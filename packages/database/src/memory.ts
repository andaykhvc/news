import { randomUUID } from 'node:crypto';
import type {
  CrawlError,
  CrawlRun,
  Document,
  DocumentVersion,
  SourceRegistry,
} from '@sak/domain';
import {
  detectDocumentVersion,
  persistDocumentInputSchema,
  type IngestionRepositories,
  type PersistDocumentResult,
} from '@sak/ingestion';

/** Test/demo adapter only. No network, no production durability or concurrency claims. */
export function createMemoryRepositories(registryInput: SourceRegistry) {
  const registry = structuredClone(registryInput);
  const documents = new Map<string, Document>();
  const versions = new Map<string, DocumentVersion>();
  const runs = new Map<string, CrawlRun>();
  const errors: CrawlError[] = [];
  const observations = new Map<string, PersistDocumentResult>();
  const repositories: IngestionRepositories = {
    sources: {
      async getRegistry() {
        return structuredClone(registry);
      },
      async markSuccessfulCheck(id, at) {
        const endpoint = registry.endpoints.find((e) => e.id === id);
        if (!endpoint) throw new Error('Missing endpoint');
        if (
          !endpoint.last_successful_check_at ||
          Date.parse(at) > Date.parse(endpoint.last_successful_check_at)
        )
          endpoint.last_successful_check_at = at;
      },
    },
    documents: {
      async persist(rawInput) {
        const input = persistDocumentInputSchema.parse(rawInput);
        const key = `${input.source_id}:${input.parsed.canonical_url}`;
        const existing = documents.get(key);
        const observationKey = `${input.crawl_run_id}:${key}`;
        const previous = observations.get(observationKey);
        if (previous) return previous;
        if (
          existing &&
          Date.parse(input.fetched_at) < Date.parse(existing.latest_seen_at)
        )
          throw new Error('Stale observation');
        const current = existing?.current_version_id
          ? versions.get(existing.current_version_id)
          : undefined;
        const outcome = detectDocumentVersion(
          current?.content_hash ?? null,
          input.content_hash,
        );
        const docId = existing?.id ?? randomUUID();
        let version = [...versions.values()].find(
          (v) =>
            v.document_id === docId && v.content_hash === input.content_hash,
        );
        if (!version) {
          version = {
            id: randomUUID(),
            document_id: docId,
            content_hash: input.content_hash,
            normalization_version: input.normalization_version,
            title: input.parsed.title,
            raw_text: input.parsed.raw_text,
            normalized_text: input.normalized_text,
            mime_type: input.mime_type,
            fetched_at: input.fetched_at,
            published_at: input.parsed.published_at,
            metadata: input.parsed.metadata,
          };
          versions.set(version.id, structuredClone(version));
        }
        documents.set(key, {
          id: docId,
          source_id: input.source_id,
          source_endpoint_id:
            existing?.source_endpoint_id ?? input.source_endpoint_id,
          canonical_url: input.parsed.canonical_url,
          external_identifier: input.external_identifier,
          title: input.parsed.title,
          document_type: input.parsed.document_type,
          first_seen_at: existing?.first_seen_at ?? input.fetched_at,
          latest_seen_at: input.fetched_at,
          published_at: input.parsed.published_at,
          status: 'active',
          current_version_id: version.id,
        });
        const result = { outcome, document_id: docId, version_id: version.id };
        observations.set(observationKey, result);
        return result;
      },
    },
    crawls: {
      async start(endpointId, at) {
        const run: CrawlRun = {
          id: randomUUID(),
          source_endpoint_id: endpointId,
          started_at: at,
          finished_at: null,
          status: 'running',
          documents_discovered: 0,
          documents_fetched: 0,
          documents_changed: 0,
          errors_count: 0,
          metadata: {},
        };
        runs.set(run.id, run);
        return structuredClone(run);
      },
      async recordError(error) {
        errors.push({ id: randomUUID(), ...structuredClone(error) });
      },
      async finish(id, status, statistics, at) {
        const run = runs.get(id);
        if (!run) throw new Error('Missing crawl');
        runs.set(id, { ...run, ...statistics, status, finished_at: at });
      },
    },
  };
  return {
    repositories,
    state: { registry, documents, versions, runs, errors, observations },
  };
}
