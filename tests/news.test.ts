import { formatDate } from '../packages/answers/src/index';
import { randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { beforeAll, afterAll, expect, it } from 'vitest';
import { parseStructuredHtml } from '../packages/source-sdk/src/index';
import { educationProfiles } from '../sources/education/src/index';
import {
  extractNews,
  fingerprintDocument,
} from '../packages/ingestion/src/index';
import {
  publishNewsVersion,
  getNews,
  listNews,
  createKnowledgeRepository,
} from '../packages/database/src/index';
import { sourceRegistrySchema } from '../packages/domain/src/index';
import type { DatabaseClient } from '../packages/database/src/client';
import registryData from '../sources/registry.json';
const registry = sourceRegistrySchema.parse(registryData);
const source = registry.sources.find((s) => s.slug === 'osym')!;
const endpoint = registry.endpoints.find((e) => e.source_id === source.id)!;
let db: PGlite;
const client: DatabaseClient = {
  async query<T extends Record<string, unknown>>(
    sql: string,
    params: readonly unknown[] = [],
  ) {
    return JSON.parse(
      JSON.stringify(
        (
          await db.query<T>(
            sql,
            params.map((p) =>
              typeof p === 'object' && p !== null ? JSON.stringify(p) : p,
            ),
          )
        ).rows,
      ),
    ) as T[];
  },
  async end() {},
};
beforeAll(async () => {
  db = new PGlite({ extensions: { pg_trgm } });
  for (const file of (await readdir('database/migrations'))
    .filter((f) => f.endsWith('.sql'))
    .sort())
    await db.exec(await readFile('database/migrations/' + file, 'utf8'));
  for (const file of ['seed.sql', 'product-seed.sql'])
    await db.exec(await readFile('database/' + file, 'utf8'));
}, 30000);
afterAll(async () => db?.close());
const sentences = [
  '20-21 Haziran 2026 tarihlerinde uygulanan sınavın değerlendirme işlemleri tamamlanmıştır.',
  'Adaylar, sınav sonuçlarına 21 Temmuz 2026 tarihinde saat 05.50’den itibaren erişebilecektir.',
  'Sonuç belgesine resmî aday işlemleri üzerinden erişim sağlanmaktadır.',
  'Değerlendirme işlemlerine ilişkin sayısal bilgiler ekte sunulmuştur.',
];
function fetched(url: string, body: string) {
  return {
    requested_url: url,
    final_url: url,
    body,
    body_base64: Buffer.from(body).toString('base64'),
    mime_type: 'text/html',
    fetched_at: new Date(Date.now() - 1000).toISOString(),
  };
}
async function save(
  url = 'https://www.osym.gov.tr/synthetic-' + randomUUID(),
  suffix = '',
) {
  const html =
    '<div class="row title"><h3>2026-YKS: Sentetik Test Duyurusu</h3></div><div class="row content"><div class="col-sm-9"><p>DUYURU (21 Temmuz 2026)</p>' +
    sentences.map((s) => '<p>' + s + suffix + '</p>').join('') +
    '<p><a href="https://sonuc.osym.gov.tr/">https://ykssonuc.osym.gov.tr</a></p></div></div>';
  const response = fetched(url, html),
    parsed = parseStructuredHtml(response, educationProfiles.osym),
    run = randomUUID(),
    hash = fingerprintDocument(parsed, 'text/html');
  await client.query(
    "insert into crawl_runs(id,source_endpoint_id,status,started_at) values($1,$2,'running',$3)",
    [run, endpoint.id, response.fetched_at],
  );
  const [row] = await client.query<{
    result: { document_id: string; version_id: string };
  }>('select persist_ingested_document($1::jsonb) result', [
    {
      source_id: source.id,
      source_endpoint_id: endpoint.id,
      crawl_run_id: run,
      external_identifier: null,
      fetched_at: response.fetched_at,
      mime_type: 'text/html',
      parsed,
      normalized_text: hash.normalizedText,
      content_hash: hash.contentHash,
      normalization_version: 'v1',
    },
  ]);
  const result = row!.result;
  return {
    ...result,
    response,
    parsed,
    async archive() {
      await client.query('select archive_source_response($1::jsonb)', [
        {
          source_id: source.id,
          version_id: result.version_id,
          parent_version_id: null,
          status: 'parsed',
          reasons: [],
          response,
        },
      ]);
    },
  };
}
it('publishes any supported official announcement, with four exact sentences, actual href, provenance and idempotency', async () => {
  const doc = await save();
  await expect(
    publishNewsVersion(client, doc.version_id, registry.hosts),
  ).rejects.toThrow('archived');
  await doc.archive();
  expect(
    await publishNewsVersion(client, doc.version_id, registry.hosts),
  ).toMatchObject({ published: true });
  expect(
    await publishNewsVersion(client, doc.version_id, registry.hosts),
  ).toMatchObject({ published: false });
  const article = await getNews(client, doc.document_id);
  expect(article?.excerpts.map((e) => e.quote)).toEqual(sentences);
  expect(article?.actions).toEqual([
    { label: 'YKS sonuçlarını görüntüle', url: 'https://sonuc.osym.gov.tr/' },
  ]);
  expect(article?.published_at).toBe('2026-07-20T21:00:00.000Z');
  expect(article?.history).toHaveLength(1);
  expect(article?.stale).toBe(true);
  await client.query(
    'update source_endpoints set last_successful_check_at=now() where id=$1',
    [endpoint.id],
  );
  expect((await getNews(client, doc.document_id))?.stale).toBe(false);
  await client.query(
    "update source_endpoints set last_successful_check_at=now()-interval '2 days' where id=$1",
    [endpoint.id],
  );
  expect((await getNews(client, doc.document_id))?.stale).toBe(true);
  expect(
    (await listNews(client, 10, 'osym')).some((a) => a.id === doc.document_id),
  ).toBe(true);
  expect(await listNews(client, 10, 'meb')).toEqual([]);
});
it('rejects fabricated sentences and action URLs not present in the actual document', async () => {
  const doc = await save();
  await doc.archive();
  const { version } = await createKnowledgeRepository(client).getVersion(
    doc.version_id,
  );
  const candidate = extractNews(version, source.id, registry.hosts);
  await expect(
    client.query('select publish_official_news($1,$2,$3)', [
      doc.version_id,
      [
        {
          ...candidate.excerpts[0],
          text: 'Sonuçlar yanlış bir tarihte açıklanmıştır.',
        },
      ],
      [],
    ]),
  ).rejects.toThrow('evidence mismatch');
  await expect(
    client.query('select publish_official_news($1,$2,$3)', [
      doc.version_id,
      candidate.excerpts,
      [{ label: 'Sonuç', url: 'https://ais.osym.gov.tr/' }],
    ]),
  ).rejects.toThrow('document link');
  await expect(
    client.query('select publish_official_news($1,$2,$3)', [
      doc.version_id,
      candidate.excerpts,
      [{ label: 'Sonuç', url: 'https://evil.example/' }],
    ]),
  ).rejects.toThrow('official document link');
});
it('never serves a previous edition after the official document changes, and withdraws inactive sources', async () => {
  const doc = await save();
  await doc.archive();
  await publishNewsVersion(client, doc.version_id, registry.hosts);
  const updated = await save(
    doc.parsed.canonical_url,
    ' Güncelleme yapılmıştır.',
  );
  await updated.archive();
  expect(await getNews(client, doc.document_id)).toBeNull();
  await publishNewsVersion(client, updated.version_id, registry.hosts);
  expect((await getNews(client, doc.document_id))?.version_id).toBe(
    updated.version_id,
  );
  expect((await getNews(client, doc.document_id))?.history).toHaveLength(2);
  await client.query("update sources set status='disabled' where id=$1", [
    source.id,
  ]);
  expect(await getNews(client, doc.document_id)).toBeNull();
  await client.query("update sources set status='active' where id=$1", [
    source.id,
  ]);
});
it('does not synthesize missing sentences or publish suspected parser output', async () => {
  const doc = await save();
  const { version } = await createKnowledgeRepository(client).getVersion(
    doc.version_id,
  );
  const short = {
    ...version,
    raw_text: sentences[0]!,
    metadata: {
      structure: {
        parser: 'fixture',
        warnings: [],
        publication_date: null,
        blocks: [
          {
            kind: 'paragraph',
            start: 0,
            end: sentences[0]!.length,
            selector: 'p',
            heading: null,
            page: null,
          },
        ],
      },
    },
  };
  expect(extractNews(short, source.id, registry.hosts).excerpts).toHaveLength(
    1,
  );
  expect(
    extractNews(
      {
        ...short,
        metadata: {
          structure: {
            ...short.metadata.structure,
            warnings: ['parser_drift'],
          },
        },
      },
      source.id,
      registry.hosts,
    ).reason,
  ).toBe('parser_requires_review');
  const linked = {
    ...version,
    metadata: {
      ...version.metadata,
      official_links: [{ text: 'Sonuç', url: 'https://evil.example/' }],
    },
  };
  expect(extractNews(linked, source.id, registry.hosts).actions).toEqual([]);
  expect(
    fingerprintDocument(
      { ...doc.parsed, metadata: linked.metadata },
      'text/html',
    ).contentHash,
  ).not.toBe(fingerprintDocument(doc.parsed, 'text/html').contentHash);
});
it('reads the MEB article publication date, excluding unrelated sidebar dates', () => {
  const parsed = parseStructuredHtml(
    fetched(
      'https://www.meb.gov.tr/synthetic/haber/1/tr',
      '<h2 class="main-title">Sentetik MEB duyurusu</h2><div class="content article-detay"><div class="content-image"><div class="date">07 Eylül 2026 14:53</div></div><p>' +
        sentences[0] +
        '</p></div><aside class="date">08 Eylül 2026 17:00</aside>',
    ),
    educationProfiles.meb,
  );
  expect(parsed.published_at).toBe('2026-09-07T11:53:00.000Z');
});

it('keeps source publication separate from recrawl/edition dates across database timezones', async () => {
  const doc = await save();
  await doc.archive();
  await publishNewsVersion(client, doc.version_id, registry.hosts);
  const again = await save(doc.parsed.canonical_url);
  await again.archive();
  await publishNewsVersion(client, again.version_id, registry.hosts);
  for (const zone of ['UTC', 'Europe/Istanbul', 'America/Los_Angeles']) {
    await client.query("select set_config('TimeZone',$1,false)", [zone]);
    const article = (await listNews(client, 200, 'osym')).find(
      (a) => a.id === doc.document_id,
    )!;
    expect(article.published_at).toBe('2026-07-20T21:00:00.000Z');
    expect(article.published_at).not.toBe(article.latest_seen_at);
    expect(article.published_at).not.toBe(article.verified_at);
    expect(formatDate(article.published_at!)).toBe('21 Temmuz 2026');
    expect((await getNews(client, doc.document_id))?.published_at).toBe(
      article.published_at,
    );
  }
  await client.query("select set_config('TimeZone','UTC',false)");
});
