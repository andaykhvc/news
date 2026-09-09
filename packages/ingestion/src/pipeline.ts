import { z } from 'zod';
import type {
  AllowedHost,
  CrawlStatistics,
  Source,
  SourceEndpoint,
} from '@sak/domain';
import { errorMessage, type Logger, type LogEvent } from '@sak/shared';
import {
  discoveredDocumentSchema,
  fetchedDocumentSchema,
  parsedDocumentSchema,
  type AdapterContext,
  type FetchedDocument,
  type ParsedDocument,
  type AdapterError,
  type HttpClient,
  type SourceAdapter,
} from '@sak/source-sdk';
import { validateSourceRegistry, validateSourceUrl } from '@sak/validation';
import { fingerprintDocument, NORMALIZATION_VERSION } from './content';
import {
  persistDocumentInputSchema,
  type IngestionRepositories,
  type PersistDocumentResult,
} from './ports';
import { noRetries, withRetry, type RetryPolicy } from './retry';

export type IngestionOutcome =
  | ({ url: string } & PersistDocumentResult)
  | { outcome: 'failed' | 'skipped'; url: string; reason: string };
export interface IngestionReport {
  runId: string;
  status: 'success' | 'partial' | 'failed';
  statistics: CrawlStatistics;
  outcomes: IngestionOutcome[];
}
export async function ingestEndpoint(input: {
  source: Source;
  endpoint: SourceEndpoint;
  hosts: AllowedHost[];
  adapter: SourceAdapter;
  http: HttpClient;
  repositories: IngestionRepositories;
  logger: Logger;
  now?: () => Date;
  signal?: AbortSignal;
  retry?: RetryPolicy;
  onPersisted?: (item: {
    fetched: FetchedDocument;
    parsed: ParsedDocument;
    persisted: PersistDocumentResult;
    runId: string;
    reportIssue: (url: string, error: AdapterError) => Promise<void>;
  }) => Promise<void>;
}): Promise<IngestionReport> {
  const { source, endpoint, adapter, repositories, logger } = input;
  const now = () => (input.now?.() ?? new Date()).toISOString();
  const signal = input.signal ?? new AbortController().signal;
  const run = await repositories.crawls.start(endpoint.id, now());
  const statistics: CrawlStatistics = {
    documents_discovered: 0,
    documents_fetched: 0,
    documents_changed: 0,
    errors_count: 0,
  };
  const outcomes: IngestionOutcome[] = [];
  const context: AdapterContext = {
    source,
    endpoint,
    http: input.http,
    logger,
    signal,
  };
  logger.log('info', 'crawl_started', {
    crawl_run_id: run.id,
    source_id: source.id,
    endpoint_id: endpoint.id,
  });
  const recordFailure = async (url: string | null, error: AdapterError) => {
    statistics.errors_count++;
    await repositories.crawls.recordError({
      crawl_run_id: run.id,
      source_endpoint_id: endpoint.id,
      url,
      error_type: error.type,
      message: error.message,
      retryable: error.retryable,
      created_at: now(),
      metadata: {},
    });
    const event: LogEvent =
      error.type === 'source_validation_failed' ||
      error.type === 'fetch_failed' ||
      error.type === 'parse_failed'
        ? error.type
        : 'pipeline_failed';
    logger.log('error', event, {
      crawl_run_id: run.id,
      message: error.message,
    });
    if (url) outcomes.push({ outcome: 'failed', url, reason: error.message });
  };
  const ensureUrl = (url: string) => {
    const result = validateSourceUrl(url, source.id, input.hosts);
    if (!result.ok)
      throw new Error(`source_validation_failed: ${result.reason}`);
    return result.url;
  };
  let fatal = false;
  try {
    validateSourceRegistry({
      sources: [source],
      endpoints: [endpoint],
      hosts: input.hosts,
    });
    if (
      source.status !== 'active' ||
      endpoint.status !== 'active' ||
      endpoint.source_id !== source.id ||
      adapter.sourceKey !== source.slug
    )
      throw new Error(
        'Source, endpoint and adapter must be active and aligned',
      );
    ensureUrl(endpoint.base_url);
    const discovery = await withRetry(
      () => adapter.discover(context),
      input.retry ?? noRetries,
      signal,
      (attempt) =>
        logger.log('warn', 'retry_scheduled', {
          crawl_run_id: run.id,
          attempt,
        }),
    );
    if (!discovery.ok) {
      await recordFailure(null, discovery.error);
      fatal = true;
    } else {
      const documents = z.array(z.unknown()).max(10_000).parse(discovery.value);
      statistics.documents_discovered = documents.length;
      const discoveryProblems =
        adapter
          .getCoverage?.()
          ?.reasons.filter(
            (r) =>
              !['document_limit', 'bounded_or_incomplete_discovery'].includes(
                r,
              ),
          ) ?? [];
      for (const reason of discoveryProblems)
        await recordFailure(null, {
          type: 'discovery_failed',
          message: reason,
          retryable: false,
        });
      const seen = new Set<string>();
      const canonicalSeen = new Set<string>();
      for (const raw of documents) {
        signal.throwIfAborted();
        const candidate = discoveredDocumentSchema.safeParse(raw);
        if (!candidate.success) {
          await recordFailure(null, {
            type: 'invalid_document',
            message: 'Invalid discovered document',
            retryable: false,
          });
          continue;
        }
        const discovered = candidate.data;
        let stage: AdapterError['type'] = 'source_validation_failed';
        try {
          const url = ensureUrl(discovered.url);
          if (seen.has(url)) {
            outcomes.push({
              outcome: 'skipped',
              url,
              reason: 'duplicate_discovery',
            });
            continue;
          }
          seen.add(url);
          logger.log('info', 'document_discovered', { crawl_run_id: run.id });
          stage = 'fetch_failed';
          const fetchedResult = await withRetry(
            () => adapter.fetch({ ...discovered, url }, context),
            input.retry ?? noRetries,
            signal,
            (attempt) =>
              logger.log('warn', 'retry_scheduled', {
                crawl_run_id: run.id,
                attempt,
              }),
          );
          if (!fetchedResult.ok) {
            await recordFailure(url, fetchedResult.error);
            continue;
          }
          const fetched = fetchedDocumentSchema.parse(fetchedResult.value);
          statistics.documents_fetched++;
          stage = 'source_validation_failed';
          if (ensureUrl(fetched.requested_url) !== url)
            throw new Error('Fetched request does not match discovery');
          ensureUrl(fetched.final_url);
          stage = 'parse_failed';
          const parsedResult = await adapter.parse(fetched, context);
          if (!parsedResult.ok) {
            await recordFailure(url, parsedResult.error);
            continue;
          }
          const parsed = parsedDocumentSchema.parse(parsedResult.value);
          stage = 'source_validation_failed';
          parsed.canonical_url = ensureUrl(parsed.canonical_url);
          const acceptedAttachments = [];
          for (const attachment of parsed.attachments) {
            try {
              acceptedAttachments.push({
                ...attachment,
                url: ensureUrl(attachment.url),
              });
            } catch {
              await recordFailure(attachment.url, {
                type: 'source_validation_failed',
                message:
                  'Attachment host is not registered; parent document preserved',
                retryable: false,
              });
            }
          }
          parsed.attachments = acceptedAttachments;
          if (canonicalSeen.has(parsed.canonical_url)) {
            outcomes.push({
              outcome: 'skipped',
              url,
              reason: 'duplicate_canonical',
            });
            continue;
          }
          stage = 'invalid_document';
          const fingerprint = fingerprintDocument(parsed, fetched.mime_type);
          const persisted = await repositories.documents.persist(
            persistDocumentInputSchema.parse({
              source_id: source.id,
              source_endpoint_id: endpoint.id,
              crawl_run_id: run.id,
              external_identifier: discovered.external_identifier,
              fetched_at: fetched.fetched_at,
              mime_type: fetched.mime_type,
              parsed,
              normalized_text: fingerprint.normalizedText,
              content_hash: fingerprint.contentHash,
              normalization_version: NORMALIZATION_VERSION,
            }),
          );
          if (input.onPersisted)
            await input.onPersisted({
              fetched,
              parsed,
              persisted,
              runId: run.id,
              reportIssue: recordFailure,
            });
          canonicalSeen.add(parsed.canonical_url);
          if (persisted.outcome !== 'unchanged') statistics.documents_changed++;
          outcomes.push({ ...persisted, url });
          const events = {
            new_document: 'document_created',
            new_version: 'document_version_created',
            unchanged: 'document_unchanged',
          } as const;
          logger.log('info', events[persisted.outcome], {
            crawl_run_id: run.id,
            document_id: persisted.document_id,
            version_id: persisted.version_id,
          });
        } catch (error) {
          await recordFailure(discovered.url, {
            type: stage,
            message: errorMessage(error),
            retryable: false,
          });
        }
      }
    }
  } catch (error) {
    fatal = true;
    await recordFailure(null, {
      type: 'discovery_failed',
      message: errorMessage(error),
      retryable: false,
    });
  }
  const successes = outcomes.filter((o) =>
    ['new_document', 'new_version', 'unchanged'].includes(o.outcome),
  ).length;
  const status =
    fatal || (statistics.errors_count > 0 && successes === 0)
      ? 'failed'
      : statistics.errors_count > 0
        ? 'partial'
        : 'success';
  const finishedAt = now();
  await repositories.crawls.finish(run.id, status, statistics, finishedAt);
  if (status === 'success')
    await repositories.sources.markSuccessfulCheck(endpoint.id, finishedAt);
  logger.log('info', 'crawl_finished', {
    crawl_run_id: run.id,
    status,
    ...statistics,
  });
  return { runId: run.id, status, statistics, outcomes };
}
