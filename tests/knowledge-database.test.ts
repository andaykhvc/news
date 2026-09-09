import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, afterAll, expect, it } from 'vitest';
import {
  educationProfiles,
  educationOntology,
} from '../sources/education/src/index';
import {
  parseStructuredHtml,
  type ParsedDocument,
} from '../packages/source-sdk/src/index';
import {
  fingerprintDocument,
  type ExtractionRecord,
} from '../packages/ingestion/src/index';
import {
  documentSchema,
  documentVersionSchema,
  sourceRegistrySchema,
  type FactCandidate,
} from '../packages/domain/src/index';
import { validateCandidate } from '../packages/validation/src/index';
import data from '../sources/registry.json';
const registry = sourceRegistrySchema.parse(data),
  source = registry.sources[0]!,
  endpoint = registry.endpoints[0]!;
let db: PGlite;
let parsed: ParsedDocument;
let clock = Date.parse('2026-09-08T00:00:00Z');
beforeAll(async () => {
  db = new PGlite();
  await db.exec(
    'create role anon;create role authenticated;create role service_role bypassrls;',
  );
  for (const name of [
    'supabase/migrations/20260908184053_foundation.sql',
    'supabase/migrations/20260908193230_education_ingestion_verification.sql',
    'supabase/seed.sql',
  ])
    await db.exec(
      await readFile(new URL('../' + name, import.meta.url), 'utf8'),
    );
  const body = await readFile(
    new URL('../sources/education/fixtures/osym-detail.html', import.meta.url),
    'utf8',
  );
  parsed = parseStructuredHtml(
    {
      body,
      requested_url: 'https://www.osym.gov.tr/2026-dgs-tercihlerin-alinmasi',
      final_url: 'https://www.osym.gov.tr/2026-dgs-tercihlerin-alinmasi',
      mime_type: 'text/html',
      fetched_at: '2026-09-08T00:00:00Z',
    },
    educationProfiles.osym,
  );
}, 30000);
afterAll(async () => db?.close());
async function save(p: ParsedDocument) {
  const run = randomUUID();
  const at = new Date((clock += 1000)).toISOString();
  await db.query(
    "insert into crawl_runs(id,source_endpoint_id,status,started_at) values($1,$2,'running',$3)",
    [run, endpoint.id, at],
  );
  const hash = fingerprintDocument(p, 'text/html');
  const res = await db.query<{
    result: { version_id: string; document_id: string };
  }>('select persist_ingested_document($1::jsonb) as result', [
    JSON.stringify({
      source_id: source.id,
      source_endpoint_id: endpoint.id,
      crawl_run_id: run,
      external_identifier: null,
      fetched_at: at,
      mime_type: 'text/html',
      parsed: p,
      normalized_text: hash.normalizedText,
      content_hash: hash.contentHash,
      normalization_version: 'v1',
    }),
  ]);
  return res.rows[0]!.result;
}
async function record(
  versionId: string,
  end = '2026-09-03',
): Promise<ExtractionRecord> {
  const version = documentVersionSchema.parse(
    JSON.parse(
      JSON.stringify(
        (
          await db.query('select * from document_versions where id=$1', [
            versionId,
          ])
        ).rows[0],
      ),
    ) as unknown,
  );
  const document = documentSchema.parse(
    JSON.parse(
      JSON.stringify(
        (
          await db.query('select * from documents where id=$1', [
            version.document_id,
          ])
        ).rows[0],
      ),
    ) as unknown,
  );
  const quote = version.raw_text
    .split('\n')
    .find((s) => s.includes('tarihleri arasında'))!;
  const start = version.raw_text.indexOf(quote);
  const candidate: FactCandidate = {
    entity_key: 'dgs',
    topic_key: 'education.exams',
    predicate: 'preference_period',
    value: { type: 'date_range', start: '2026-08-27', end },
    value_text:
      end === '2026-09-03'
        ? '27 Ağustos-3 Eylül 2026'
        : '27 Ağustos-4 Eylül 2026',
    unit: null,
    reference_period: '2026',
    correction_of: null,
    evidence: { quote, start, end: start + quote.length, page: null },
  };
  const decision = validateCandidate({
    candidate,
    document,
    version,
    sourceKey: 'osym',
    sourceActive: true,
    hosts: registry.hosts,
    ontology: educationOntology,
    asOf: '2026-09-09T00:00:00Z',
  });
  expect(decision.status).toBe('verified');
  return {
    key: randomUUID().replaceAll('-', '').repeat(2),
    version_id: versionId,
    provider: 'offline-test',
    model: 'fixture-v1',
    ontology_version: 'education-v1',
    status: 'completed',
    error: null,
    created_at: new Date().toISOString(),
    results: [{ candidate, decision }],
  };
}
async function submit(r: ExtractionRecord) {
  await db.query('select record_extraction($1::jsonb)', [JSON.stringify(r)]);
}
async function counts() {
  return (
    await db.query<{ facts: number; evidence: number; attempts: number }>(
      'select (select count(*)::integer from facts) facts,(select count(*)::integer from fact_evidence) evidence,(select count(*)::integer from extraction_attempts) attempts',
    )
  ).rows[0]!;
}
it('runs the full official HTML → version → validated fact → exact evidence transaction idempotently', async () => {
  const v = await save(parsed);
  const r = await record(v.version_id);
  await submit(r);
  await submit(r);
  expect(await counts()).toEqual({ facts: 1, evidence: 1, attempts: 1 });
  await submit({ ...r, key: 'b'.repeat(64) });
  expect(await counts()).toEqual({ facts: 1, evidence: 1, attempts: 2 });
  const result = await db.query<{ status: string }>('select status from facts');
  expect(result.rows[0]!.status).toBe('verified');
});
it('holds both changed authoritative claims for explicit resolution and retains history', async () => {
  const old = (await db.query<{ id: string }>('select id from facts limit 1'))
    .rows[0]!.id;
  const changed = {
    ...parsed,
    raw_text: parsed.raw_text.replace(
      '27 Ağustos-3 Eylül 2026',
      '27 Ağustos-4 Eylül 2026',
    ),
  };
  const v = await save(changed);
  const r = await record(v.version_id, '2026-09-04');
  await submit(r);
  const rows = (
    await db.query<{ id: string; status: string }>(
      'select id,status from facts',
    )
  ).rows;
  expect(rows.map((r) => r.status)).toEqual(['needs_review', 'needs_review']);
  const replacement = rows.find((r) => r.id !== old)!.id;
  await db.query('select resolve_fact_correction($1,$2,$3,$4)', [
    old,
    replacement,
    'Synthetic test: reviewed explicit correction evidence',
    'test-reviewer',
  ]);
  const result = (
    await db.query<{ status: string }>('select status from facts where id=$1', [
      old,
    ])
  ).rows[0];
  expect(result?.status).toBe('superseded');
  await expect(
    db.query("update facts set status='verified' where id=$1", [old]),
  ).rejects.toThrow('Terminal');
  expect((await db.query('select * from fact_evidence')).rows).toHaveLength(2);
});
it('rejects direct unaudited verification and wrong UTF-16 locators', async () => {
  const v = await save({
    ...parsed,
    canonical_url: parsed.canonical_url + '-synthetic-test',
  });
  const r = await record(v.version_id);
  r.results[0]!.candidate.evidence.start += 1;
  await expect(submit(r)).rejects.toThrow('offsets');
  const sliced = await db.query<{ value: string }>(
    'select utf16_slice($1,2,5) as value',
    ['😀abc'],
  );
  expect(sliced.rows[0]?.value).toBe('abc');
});
it('requires exact registered official hosts when archiving response bytes', async () => {
  const input = {
    source_id: source.id,
    version_id: null,
    parent_version_id: null,
    status: 'needs_review',
    reasons: ['test'],
    response: {
      requested_url: 'https://www.osym.gov.tr/test',
      final_url: 'https://www.osym.gov.tr/test',
      body_base64: Buffer.from('source bytes').toString('base64'),
      mime_type: 'text/plain',
      fetched_at: new Date().toISOString(),
    },
  };
  await db.query('select archive_source_response($1::jsonb)', [
    JSON.stringify(input),
  ]);
  await db.query('select archive_source_response($1::jsonb)', [
    JSON.stringify(input),
  ]);
  expect(
    (await db.query('select hash from source_artifacts')).rows,
  ).toHaveLength(1);
  expect((await db.query('select id from source_responses')).rows).toHaveLength(
    1,
  );
  await expect(
    db.query('select archive_source_response($1::jsonb)', [
      JSON.stringify({
        ...input,
        response: { ...input.response, final_url: 'https://evil.gov.tr/test' },
      }),
    ]),
  ).rejects.toThrow('Untrusted');
});
it('keeps audit records immutable and denies browser roles', async () => {
  for (const table of [
    'source_artifacts',
    'source_responses',
    'extraction_attempts',
    'candidate_validations',
  ])
    await expect(db.query(`delete from ${table}`)).rejects.toThrow('immutable');
  await db.exec('begin;set local role anon;');
  await expect(db.query('select * from candidate_validations')).rejects.toThrow(
    'permission denied',
  );
  await db.exec('rollback');
  const r = await db.query<{ enabled: boolean }>(
    "select bool_and(relrowsecurity) enabled from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and relkind='r'",
  );
  expect(r.rows[0]?.enabled).toBe(true);
});

it('requires an audit record for direct SQL verification', async () => {
  await expect(
    db.query(
      "insert into facts(subject_entity_id,topic_id,predicate,value,authority_source_id,reference_period,status,verified_at) select e.id,t.id,'exam_date',$1,$2,'2026','verified',now() from entities e cross join topics t where e.key='dgs' and t.key='education.exams'",
      [JSON.stringify({ type: 'date', value: '2026-10-25' }), source.id],
    ),
  ).rejects.toThrow('audited');
});
it('retains failed extraction attempts while allowing one completed retry', async () => {
  const v = await save({
    ...parsed,
    canonical_url: parsed.canonical_url + '-retry-test',
  });
  const r: ExtractionRecord = {
    key: 'e'.repeat(64),
    version_id: v.version_id,
    provider: 'failure-test',
    model: 'fixture',
    ontology_version: 'education-v1',
    status: 'failed',
    error: 'temporary outage',
    created_at: new Date().toISOString(),
    results: [],
  };
  await submit(r);
  await submit(r);
  await submit({ ...r, status: 'completed', error: null });
  await submit({ ...r, status: 'completed', error: null });
  const attempts = (
    await db.query<{ status: string }>(
      'select status from extraction_attempts where idempotency_key=$1',
      [r.key],
    )
  ).rows;
  expect(attempts.filter((a) => a.status === 'failed')).toHaveLength(2);
  expect(attempts.filter((a) => a.status === 'completed')).toHaveLength(1);
});
