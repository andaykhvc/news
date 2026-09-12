import { setTimeout as delay } from 'node:timers/promises';
import { readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { sourceRegistrySchema, type Coverage } from '@sak/domain';
import {
  createDatabaseClient,
  createRepositories,
  createKnowledgeRepository,
  publishVerifiedFactsFromProvider,
  publishNewsVersion,
} from '@sak/database';
import { createMemoryRepositories } from '@sak/database/testing';
import { educationProfiles, educationOntology } from '@sak/education';
import {
  createHtmlAdapter,
  createHttpClient,
  createPinnedTransport,
  parseStructuredHtml,
  type FetchedDocument,
} from '@sak/source-sdk';
import {
  ingestEndpoint,
  parsePdf,
  fingerprintDocument,
  processKnowledge,
  createOpenAIProvider,
  createOfficialResultTitleProvider,
  isOfficialYksAnnouncementTitle,
  OFFICIAL_RESULT_TITLE_PROVIDER,
  assessCoverage,
  type KnowledgeRepository,
  type ExtractionProvider,
} from '@sak/ingestion';
import { createJsonLogger } from '@sak/shared';
import { validateSourceRegistry, validateSourceUrl } from '@sak/validation';
import registryData from '../../../sources/registry.json';

export async function runEducationCli() {
  const { values } = parseArgs({
    options: {
      source: { type: 'string' },
      endpoint: { type: 'string' },
      fixture: { type: 'string' },
      version: { type: 'string' },
      candidates: { type: 'string' },
      provider: { type: 'string' },
      write: { type: 'boolean' },
      'dry-run': { type: 'boolean' },
      'max-pages': { type: 'string' },
      'max-documents': { type: 'string' },
      help: { type: 'boolean' },
    },
    strict: true,
  });
  if (values.help || (!values.source && !values.version)) {
    console.log(
      'Şak Haber official ingestion\n  pnpm worker --source osym|meb|yok|gsb|yokak|all [--max-pages 3 --max-documents 50] [--write]\n  pnpm worker --source osym --fixture osym-detail.html\n  pnpm worker --version UUID --candidates candidates.json [--write]\n  pnpm worker --version UUID --provider openai [--write]\nDefault: dry run. --write archives evidence and automatically publishes exact official news excerpts plus facts accepted by registered publication rules.',
    );
    return;
  }
  if (values.write && values['dry-run'])
    throw new Error('Choose --write or --dry-run');
  const write = values.write ?? false;
  const controller = new AbortController();
  process.once('SIGINT', () => controller.abort());
  process.once('SIGTERM', () => controller.abort());
  const key = values.source as keyof typeof educationProfiles;
  if (
    values.source &&
    values.source !== 'all' &&
    !Object.hasOwn(educationProfiles, key)
  )
    throw new Error('Unknown source');
  if (values.fixture) {
    if (!educationProfiles[key])
      throw new Error('Fixture parsing requires one source');
    const dir = new URL(
      '../../../sources/education/fixtures/',
      import.meta.url,
    );
    const manifest = z
      .record(
        z.string(),
        z.object({ requested_url: z.string(), final_url: z.string() }),
      )
      .parse(
        JSON.parse(
          await readFile(new URL('manifest.json', dir), 'utf8'),
        ) as unknown,
      );
    const meta = manifest[values.fixture];
    if (!meta)
      throw new Error('Fixture must be in the captured official manifest');
    const bytes = await readFile(new URL(values.fixture, dir));
    const pdf = values.fixture.endsWith('.pdf');
    const fetched: FetchedDocument = {
      requested_url: meta.requested_url,
      final_url: meta.final_url,
      body: pdf ? '[PDF]' : bytes.toString('utf8'),
      body_base64: bytes.toString('base64'),
      mime_type: pdf ? 'application/pdf' : 'text/html',
      fetched_at: new Date().toISOString(),
    };
    console.log(
      JSON.stringify(
        pdf
          ? await parsePdf(fetched)
          : parseStructuredHtml(fetched, educationProfiles[key]),
        null,
        2,
      ),
    );
    return;
  }
  const client =
    write || values.version ? createDatabaseClient(process.env) : null;
  const live = client ? createRepositories(client) : null;
  const registry = validateSourceRegistry(
    live
      ? await live.sources.getRegistry()
      : sourceRegistrySchema.parse(registryData),
  );
  const memory = createMemoryRepositories(registry);
  const repositories = write && live ? live : memory.repositories;
  const records: unknown[] = [];
  const dryKnowledge: KnowledgeRepository = {
    async getVersion(id) {
      const version = memory.state.versions.get(id);
      const document = [...memory.state.documents.values()].find(
        (d) => d.current_version_id === id,
      );
      if (!version || !document) throw new Error('Missing dry-run version');
      return { document, version };
    },
    async hasExtraction() {
      return false;
    },
    async recordExtraction(r) {
      records.push(r);
    },
    async archive() {},
    async recordCoverage() {},
    async recentCoverage() {
      return [];
    },
  };
  const knowledge = client ? createKnowledgeRepository(client) : dryKnowledge;
  let provider: ExtractionProvider | null = null;
  if (values.candidates) {
    const output: unknown = JSON.parse(
      await readFile(
        fileURLToPath(new URL(values.candidates, `file://${process.cwd()}/`)),
        'utf8',
      ),
    );
    provider = {
      name: 'fixture-candidates',
      model: 'offline-v1',
      maxInputChars: 2000000,
      async extract() {
        return output;
      },
    };
  }
  if (values.provider) {
    if (values.provider !== 'openai') throw new Error('Unsupported provider');
    provider = createOpenAIProvider({
      apiKey: process.env['OPENAI_API_KEY'] ?? '',
      model: process.env['EXTRACTION_MODEL'] ?? '',
    });
  }
  const officialResultProvider = createOfficialResultTitleProvider();
  const processDocumentKnowledge = async (input: {
    versionId: string;
    title: string;
    sourceKey: string;
    hosts: ReturnType<typeof sourceRegistrySchema.parse>['hosts'];
    repository: KnowledgeRepository;
  }) => {
    const providers = [
      ...(isOfficialYksAnnouncementTitle(input.title)
        ? [officialResultProvider]
        : []),
      ...(provider ? [provider] : []),
    ];
    for (const extractionProvider of providers)
      await processKnowledge({
        versionId: input.versionId,
        sourceKey: input.sourceKey,
        sourceActive: true,
        hosts: input.hosts,
        ontology: educationOntology,
        provider: extractionProvider,
        repository: input.repository,
        signal: controller.signal,
      });
  };
  if (values.version) {
    if (!provider) throw new Error('Choose --candidates or --provider');
    const { document } = await knowledge.getVersion(values.version);
    const source = registry.sources.find((s) => s.id === document.source_id);
    if (!source) throw new Error('Unregistered source');
    const report = await processKnowledge({
      versionId: values.version,
      sourceKey: source.slug,
      sourceActive: source.status === 'active',
      hosts: registry.hosts,
      ontology: educationOntology,
      provider,
      repository: write
        ? knowledge
        : {
            ...knowledge,
            async hasExtraction() {
              return false;
            },
            async recordExtraction(r) {
              records.push(r);
            },
          },
      signal: controller.signal,
    });
    console.log(JSON.stringify({ dry_run: !write, report }, null, 2));
    if (report?.status === 'failed') process.exitCode = 1;
    return;
  }
  const maxPages = z.coerce
    .number()
    .int()
    .min(1)
    .max(10)
    .parse(values['max-pages'] ?? 3);
  const maxDocuments = z.coerce
    .number()
    .int()
    .min(1)
    .max(100)
    .parse(values['max-documents'] ?? 50);
  const transport = createPinnedTransport({
    userAgent:
      process.env['CRAWLER_USER_AGENT'] ??
      'SakHaber/0.2 (+https://github.com/andaykhvc/news)',
  });
  const endpoints = registry.endpoints.filter(
    (e) =>
      e.status === 'active' &&
      (!values.endpoint || e.id === values.endpoint) &&
      (values.source === 'all' ||
        registry.sources.find((s) => s.id === e.source_id)?.slug === key),
  );
  if (values.endpoint && endpoints.length !== 1)
    throw new Error('Scheduled endpoint is not active or registered');
  for (const endpoint of endpoints) {
    const source = registry.sources.find((s) => s.id === endpoint.source_id)!;
    const profile =
      educationProfiles[source.slug as keyof typeof educationProfiles];
    if (!profile) throw new Error('No adapter for active source');
    const hosts = registry.hosts.filter((h) => h.source_id === source.id);
    const http = createHttpClient({
      sourceId: source.id,
      hosts,
      transport,
      maxBytes: 10_000_000,
      timeoutMs: 30000,
    });
    let coverage: Coverage = {
      checked_at: new Date().toISOString(),
      pages: [],
      discovered: 0,
      scope: profile.scope,
      complete: false,
      reasons: ['discovery_not_completed'],
    };
    const previous = await knowledge.recentCoverage(endpoint.id);
    try {
      const report = await ingestEndpoint({
        source,
        endpoint,
        hosts,
        http,
        repositories,
        logger: createJsonLogger(),
        signal: controller.signal,
        adapter: createHtmlAdapter(profile, {
          maxPages,
          maxDocuments,
          onCoverage: (c) => {
            coverage = c;
          },
        }),
        retry: {
          maxAttempts: 2,
          delayMs: 1500,
          sleep: async (ms, signal) => {
            await delay(ms, undefined, { signal });
          },
        },
        async onPersisted({ fetched, parsed, persisted, runId }) {
          const store = write ? knowledge : dryKnowledge;
          await store.archive({
            version_id: persisted.version_id,
            parent_version_id: null,
            source_id: source.id,
            response: fetched,
            status: 'parsed',
            reasons: [],
          });
          if (write && client) {
            const news = await publishNewsVersion(
              client,
              persisted.version_id,
              hosts,
            );
            console.log(
              JSON.stringify({
                event: 'news_processed',
                document_id: persisted.document_id,
                ...news,
              }),
            );
          }
          await processDocumentKnowledge({
            versionId: persisted.version_id,
            title: parsed.title,
            sourceKey: source.slug,
            hosts,
            repository: store,
          });
          if (parsed.attachments.length > 10)
            console.warn(
              JSON.stringify({
                source: source.slug,
                endpoint: endpoint.slug,
                url: parsed.canonical_url,
                warning:
                  'attachment_limit: remaining attachments require review',
              }),
            );
          for (const attachment of parsed.attachments.slice(0, 10)) {
            if (!validateSourceUrl(attachment.url, source.id, hosts).ok)
              continue;
            const response = await http.get(attachment.url, controller.signal);
            if (!response.ok) {
              console.warn(
                JSON.stringify({
                  source: source.slug,
                  endpoint: endpoint.slug,
                  url: attachment.url,
                  warning: response.error.message,
                }),
              );
              continue;
            }
            const pdf = await parsePdf(response.value);
            let versionId: string | null = null;
            if (pdf.status === 'needs_review')
              console.warn(
                JSON.stringify({
                  source: source.slug,
                  endpoint: endpoint.slug,
                  url: attachment.url,
                  warning: pdf.reasons.join(';'),
                }),
              );
            if (pdf.parsed) {
              const hash = fingerprintDocument(pdf.parsed, 'application/pdf');
              const result = await repositories.documents.persist({
                source_id: source.id,
                source_endpoint_id: endpoint.id,
                crawl_run_id: runId,
                external_identifier: null,
                fetched_at: response.value.fetched_at,
                mime_type: 'application/pdf',
                parsed: pdf.parsed,
                normalized_text: hash.normalizedText,
                content_hash: hash.contentHash,
                normalization_version: 'v1',
              });
              versionId = result.version_id;
            }
            await store.archive({
              version_id: versionId,
              parent_version_id: persisted.version_id,
              source_id: source.id,
              response: response.value,
              status: pdf.status,
              reasons: pdf.reasons,
            });
            if (versionId)
              await processDocumentKnowledge({
                versionId,
                title: pdf.parsed?.title ?? '',
                sourceKey: source.slug,
                hosts,
                repository: store,
              });
          }
        },
      });
      coverage = assessCoverage(coverage, previous, report.status);
      if (write) await knowledge.recordCoverage(report.runId, coverage);
      const autoPublished =
        write && client && report.status === 'success'
          ? await publishVerifiedFactsFromProvider(
              client,
              OFFICIAL_RESULT_TITLE_PROVIDER,
            )
          : 0;
      console.log(
        JSON.stringify({
          source: source.slug,
          endpoint: endpoint.slug,
          dry_run: !write,
          extraction: [
            OFFICIAL_RESULT_TITLE_PROVIDER,
            ...(provider ? [provider.name] : []),
          ],
          auto_published: autoPublished,
          report,
          coverage,
        }),
      );
      if (report.status !== 'success') process.exitCode = 1;
    } catch (e) {
      console.error(
        JSON.stringify({
          source: source.slug,
          error: e instanceof Error ? e.message : 'source_failed',
        }),
      );
      process.exitCode = 1;
    }
  }
}
