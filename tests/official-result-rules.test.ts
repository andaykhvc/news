import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import {
  createOfficialResultTitleProvider,
  isOfficialResultTitle,
} from '../packages/ingestion/src/index';
import {
  sourceRegistrySchema,
  type Document,
  type DocumentVersion,
} from '../packages/domain/src/index';
import { educationOntology } from '../sources/education/src/index';
import { validateCandidate } from '../packages/validation/src/index';
import registryData from '../sources/registry.json';

const registry = sourceRegistrySchema.parse(registryData);
const source = registry.sources.find((item) => item.slug === 'osym')!;
const endpoint = registry.endpoints.find(
  (item) => item.slug === 'yks-announcements',
)!;

function documentFor(title: string) {
  const id = randomUUID();
  const raw = `DUYURU (21 Temmuz 2026)\n${title}\nAdaylara ve kamuoyuna saygıyla duyurulur.`;
  const version: DocumentVersion = {
    id: randomUUID(),
    document_id: id,
    content_hash: 'a'.repeat(64),
    normalization_version: 'v1',
    title,
    raw_text: raw,
    normalized_text: raw,
    mime_type: 'text/html',
    fetched_at: '2026-09-11T13:30:00Z',
    published_at: '2026-07-21T00:00:00Z',
    metadata: {
      structure: {
        parser: 'test',
        blocks: [
          {
            kind: 'paragraph',
            start: 0,
            end: raw.length,
            selector: 'main > p:nth-child(1)',
            heading: title,
            page: null,
          },
        ],
        warnings: [],
        publication_date: null,
      },
    },
  };
  const document: Document = {
    id,
    source_id: source.id,
    source_endpoint_id: endpoint.id,
    canonical_url: `https://www.osym.gov.tr/${title.toLowerCase().replaceAll(' ', '-')}`,
    external_identifier: null,
    title,
    document_type: 'announcement',
    first_seen_at: version.fetched_at,
    latest_seen_at: version.fetched_at,
    published_at: version.published_at,
    current_version_id: version.id,
    status: 'active',
  };
  return { document, version };
}

it.each([
  ['2026-YKS: Sınav Sonuçları Açıklandı', 'yks'],
  ['2026-YKS: Yerleştirme Sonuçları Açıklandı', 'yks_yerlestirme'],
] as const)(
  'grounds the exact official result title: %s',
  async (title, entity) => {
    const { document, version } = documentFor(title);
    const result = await createOfficialResultTitleProvider().extract({
      document: version,
      ontology: educationOntology,
      signal: new AbortController().signal,
    });
    const candidate = (result as { candidates: unknown[] }).candidates[0];
    expect(candidate).toMatchObject({
      entity_key: entity,
      predicate: 'results_status',
      value: { type: 'status', value: 'announced' },
      reference_period: '2026',
    });
    expect(
      validateCandidate({
        candidate,
        document,
        version,
        sourceKey: 'osym',
        sourceActive: true,
        hosts: registry.hosts,
        ontology: educationOntology,
        asOf: '2026-09-11T13:31:00Z',
      }).status,
    ).toBe('verified');
  },
);

it('rejects near-match result titles instead of inferring a fact', async () => {
  const title = '2026-YKS: Sınav Sonuçları Açıklandı (Güncelleme)';
  const { version } = documentFor(title);
  expect(isOfficialResultTitle(title)).toBe(false);
  await expect(
    createOfficialResultTitleProvider().extract({
      document: version,
      ontology: educationOntology,
      signal: new AbortController().signal,
    }),
  ).resolves.toEqual({ candidates: [] });
});
