import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import {
  processKnowledge,
  extractCandidates,
  type KnowledgeRepository,
  type ExtractionRecord,
  type ExtractionProvider,
} from '../packages/ingestion/src/index';
import { parseStructuredHtml } from '../packages/source-sdk/src/index';
import {
  educationProfiles,
  educationOntology,
} from '../sources/education/src/index';
import {
  sourceRegistrySchema,
  type Document,
  type DocumentVersion,
  type FactCandidate,
} from '../packages/domain/src/index';
import { validateCurrentEvidence } from '../packages/validation/src/index';
import registryData from '../sources/registry.json';
const registry = sourceRegistrySchema.parse(registryData);
async function setup() {
  const body = await readFile(
    new URL('../sources/education/fixtures/osym-detail.html', import.meta.url),
    'utf8',
  );
  const url = 'https://www.osym.gov.tr/2026-dgs-tercihlerin-alinmasi';
  const p = parseStructuredHtml(
    {
      body,
      requested_url: url,
      final_url: url,
      mime_type: 'text/html',
      fetched_at: '2026-09-08T00:00:00Z',
    },
    educationProfiles.osym,
  );
  const id = randomUUID(),
    vid = randomUUID();
  const version: DocumentVersion = {
    id: vid,
    document_id: id,
    content_hash: 'a'.repeat(64),
    normalization_version: 'v1',
    title: p.title,
    raw_text: p.raw_text,
    normalized_text: p.raw_text,
    mime_type: 'text/html',
    fetched_at: '2026-09-08T00:00:00Z',
    published_at: p.published_at,
    metadata: p.metadata,
  };
  const document: Document = {
    id,
    source_id: registry.sources[0]!.id,
    source_endpoint_id: registry.endpoints[0]!.id,
    canonical_url: url,
    external_identifier: null,
    title: p.title,
    document_type: 'announcement',
    first_seen_at: version.fetched_at,
    latest_seen_at: version.fetched_at,
    published_at: null,
    current_version_id: vid,
    status: 'active',
  };
  const records: ExtractionRecord[] = [];
  const repository: KnowledgeRepository = {
    async getVersion() {
      return { document, version };
    },
    async hasExtraction(key) {
      return records.some((r) => r.key === key && r.status === 'completed');
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
  const quote = p.raw_text
    .split('\n')
    .find((t) => t.includes('tarihleri arasında'))!;
  const start = p.raw_text.indexOf(quote);
  const candidate: FactCandidate = {
    entity_key: 'dgs',
    topic_key: 'education.exams',
    predicate: 'preference_period',
    value: { type: 'date_range', start: '2026-08-27', end: '2026-09-03' },
    value_text: '27 Ağustos-3 Eylül 2026',
    unit: null,
    reference_period: '2026',
    correction_of: null,
    evidence: { quote, start, end: start + quote.length, page: null },
  };
  const provider = {
    name: 'fixture',
    model: 'offline-v1',
    extract: vi.fn(async () => ({ candidates: [candidate] })),
  };
  return {
    version,
    document,
    records,
    provider,
    input: {
      versionId: vid,
      sourceKey: 'osym',
      sourceActive: true,
      hosts: registry.hosts,
      ontology: educationOntology,
      provider,
      repository,
      signal: new AbortController().signal,
    },
  };
}
it('extracts, independently verifies and skips completed work', async () => {
  const s = await setup();
  const result = await processKnowledge(s.input);
  expect(result?.results[0]?.decision.status).toBe('verified');
  expect(await processKnowledge(s.input)).toBeNull();
  expect(s.provider.extract).toHaveBeenCalledTimes(1);
  expect(s.records).toHaveLength(1);
});
it('audits a failed provider attempt and permits a later retry', async () => {
  const s = await setup();
  s.provider.extract.mockRejectedValueOnce(
    new Error('temporary provider outage'),
  );
  expect((await processKnowledge(s.input))?.status).toBe('failed');
  expect((await processKnowledge(s.input))?.status).toBe('completed');
  expect(s.records).toHaveLength(2);
});
it('validates source trust before sending text to a provider', async () => {
  const s = await setup();
  s.document.canonical_url = 'https://not-registered.gov.tr/';
  expect((await processKnowledge(s.input))?.status).toBe('failed');
  expect(s.provider.extract).not.toHaveBeenCalled();
});
it('invalid model schemas produce audit failures and no fact candidates', async () => {
  const s = await setup();
  const provider: ExtractionProvider = {
    name: 'bad-fixture',
    model: 'test',
    async extract() {
      return { candidates: [{ status: 'verified', value: 'made up' }] };
    },
  };
  const result = await processKnowledge({ ...s.input, provider });
  expect(result?.status).toBe('failed');
  expect(result?.results).toEqual([]);
});
it('maps chunk-local evidence back to immutable global PDF offsets', async () => {
  const s = await setup();
  const quote = 'DGS tercih işlemleri 27 Ağustos-3 Eylül 2026';
  const start = 100001;
  const raw = 'x'.repeat(100000) + '\n' + quote;
  const version = {
    ...s.version,
    raw_text: raw,
    normalized_text: raw,
    metadata: {
      structure: {
        parser: 'test',
        blocks: [
          {
            kind: 'page',
            start: 0,
            end: 100000,
            page: 1,
            selector: null,
            heading: null,
          },
          {
            kind: 'page',
            start,
            end: raw.length,
            page: 2,
            selector: null,
            heading: null,
          },
        ],
        warnings: [],
        publication_date: null,
      },
    },
  };
  let calls = 0;
  const provider: ExtractionProvider = {
    name: 'chunk-test',
    model: 'fixture',
    async extract({ document }) {
      calls++;
      if (document.raw_text[0] === 'x') return { candidates: [] };
      return {
        candidates: [
          {
            entity_key: 'dgs',
            topic_key: 'education.exams',
            predicate: 'preference_period',
            value: {
              type: 'date_range',
              start: '2026-08-27',
              end: '2026-09-03',
            },
            value_text: '27 Ağustos-3 Eylül 2026',
            unit: null,
            reference_period: '2026',
            correction_of: null,
            evidence: { quote, start: 0, end: quote.length, page: 2 },
          },
        ],
      };
    },
  };
  const result = await extractCandidates(
    provider,
    version,
    educationOntology,
    s.input.signal,
  );
  expect(calls).toBe(2);
  expect(result[0]?.evidence.start).toBe(start);
  expect(raw.slice(result[0]!.evidence.start, result[0]!.evidence.end)).toBe(
    quote,
  );
});
it('requires fresh successful checks even for exact current evidence', async () => {
  const s = await setup();
  expect(
    validateCurrentEvidence({
      version: s.version,
      currentVersionId: s.version.id,
      lastObservedAt: s.version.fetched_at,
      lastSuccessfulCheckAt: null,
      coverage: null,
      asOf: '2026-09-09T00:00:00Z',
      maxAgeMs: 3600000,
    }),
  ).toContain('source_coverage_stale_or_unknown');
});
