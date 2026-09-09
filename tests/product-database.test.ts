import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { beforeAll, afterAll, expect, it } from 'vitest';
import {
  answerResources,
  answerSnapshotSchema,
} from '../packages/answers/src/index';
let db: PGlite;
beforeAll(async () => {
  db = new PGlite({ extensions: { pg_trgm } });
  await db.exec(
    'create role anon; create role authenticated; create role service_role bypassrls;',
  );
  for (const file of [
    'supabase/migrations/20260908184053_foundation.sql',
    'supabase/migrations/20260908193230_education_ingestion_verification.sql',
    'supabase/migrations/20260909095636_answer_product_operations.sql',
    'supabase/migrations/20260909134846_product_publication_hardening.sql',
    'supabase/migrations/20260909140251_worker_source_leases.sql',
    'supabase/seed.sql',
    'supabase/product-seed.sql',
  ])
    await db.exec(
      await readFile(new URL('../' + file, import.meta.url), 'utf8'),
    );
}, 30000);
afterAll(async () => db?.close());
it('returns a schema-valid empty product snapshot without demo facts', async () => {
  const result = await db.query<{ snapshot: unknown }>(
    "select product_snapshot($1,'2026') snapshot",
    [answerResources.map((r) => r.entity)],
  );
  const snapshot = answerSnapshotSchema.parse(result.rows[0]!.snapshot);
  expect(snapshot.facts).toEqual([]);
  expect(snapshot.checks.every((c) => !c.extraction_complete)).toBe(true);
  expect(
    snapshot.rules.some(
      (r) =>
        r.subject_entity_id ===
        snapshot.entities.find((e) => e.key === 'yks_ek_yerlestirme')?.id,
    ),
  ).toBe(true);
});
it('Postgres trigram/FTS returns catalog suggestions, never facts', async () => {
  const result = await db.query<{ matches: { resource_key: string }[] }>(
    "select search_answer_resources('yks ek terch') matches",
  );
  expect(
    result.rows[0]!.matches.some((r) => r.resource_key === 'yks_extra'),
  ).toBe(true);
});
it('claim leases are exclusive; completion requires the actual unexpired token', async () => {
  const first = await db.query<{ job: { endpoint_id: string; token: string } }>(
    'select claim_endpoint_job() job',
  );
  const second = await db.query<{
    job: { endpoint_id: string; token: string };
  }>('select claim_endpoint_job() job');
  expect(first.rows[0]!.job.endpoint_id).not.toBe(
    second.rows[0]!.job.endpoint_id,
  );
  const job = first.rows[0]!.job;
  const denied = await db.query<{ ok: boolean }>(
    "select finish_endpoint_job($1,gen_random_uuid(),true,'') ok",
    [job.endpoint_id],
  );
  expect(denied.rows[0]!.ok).toBe(false);
  const done = await db.query<{ ok: boolean }>(
    "select finish_endpoint_job($1,$2,false,'fixture') ok",
    [job.endpoint_id, job.token],
  );
  expect(done.rows[0]!.ok).toBe(true);
  const retry = await db.query<{ due: boolean; attempts: number }>(
    'select due_at>now() due,attempts from endpoint_jobs where endpoint_id=$1',
    [job.endpoint_id],
  );
  expect(retry.rows[0]).toEqual({ due: true, attempts: 1 });
  const again = await db.query<{ ok: boolean }>(
    "select finish_endpoint_job($1,$2,true,'') ok",
    [job.endpoint_id, job.token],
  );
  expect(again.rows[0]!.ok).toBe(false);
});
it('rate limiting and event aggregates retain no visitor-query linkage', async () => {
  for (let i = 0; i < 3; i++) {
    const r = await db.query<{ ok: boolean }>(
      "select consume_product_limit('daily-hash',2,3600) ok",
    );
    expect(r.rows[0]!.ok).toBe(i < 2);
  }
  await db.exec(
    "select record_product_event('unresolved','yks burs');select record_product_event('unresolved','yks burs')",
  );
  const result = await db.query<{ count: number }>(
    'select count from product_events',
  );
  expect(result.rows[0]!.count).toBe(2);
  await db.exec(
    "insert into product_events(day,kind,key) values(current_date-31,'helpful','old'); select product_maintenance()",
  );
  expect((await db.query('select * from product_events')).rows).toHaveLength(1);
});
it('all new tables and RPCs deny anonymous and authenticated use', async () => {
  for (const role of ['anon', 'authenticated']) {
    await db.exec(`set role ${role}`);
    await expect(
      db.query("select product_snapshot(array['yks'],'2026')"),
    ).rejects.toThrow(/permission denied/);
    await expect(db.query('select * from endpoint_jobs')).rejects.toThrow(
      /permission denied/,
    );
    await expect(
      db.query("select record_product_event('helpful','x')"),
    ).rejects.toThrow(/permission denied/);
    await db.exec('reset role');
  }
});
it('runs document → grounding → database verification → reviewed publication → canonical answer → revocation', async () => {
  const { randomUUID } = await import('node:crypto');
  const { answerFixture } = await import('./answer-fixture');
  const { educationOntology } = await import('../sources/education/src/index');
  const { fingerprintDocument } =
    await import('../packages/ingestion/src/index');
  const { validateCandidate } =
    await import('../packages/validation/src/index');
  const { documentSchema, documentVersionSchema } =
    await import('../packages/domain/src/index');
  const { resolveAnswer, resolveQuery } =
    await import('../packages/answers/src/index');
  const fixture = answerFixture(new Date().toISOString()),
    run = randomUUID(),
    endpoint = fixture.endpoints[0]!;
  const at = new Date(Date.now() - 1000).toISOString();
  await db.query(
    "insert into crawl_runs(id,source_endpoint_id,status,started_at) values($1,$2,'running',$3)",
    [run, endpoint.id, at],
  );
  const parsed = {
    canonical_url: fixture.documents[0]!.canonical_url,
    title: fixture.versions[0]!.title,
    document_type: 'announcement',
    raw_text: fixture.versions[0]!.raw_text,
    published_at: at,
    attachments: [],
    metadata: fixture.versions[0]!.metadata,
  };
  const hash = fingerprintDocument(parsed, 'text/html');
  const saved = await db.query<{
    result: { version_id: string; document_id: string };
  }>('select persist_ingested_document($1::jsonb) result', [
    JSON.stringify({
      source_id: endpoint.source_id,
      source_endpoint_id: endpoint.id,
      crawl_run_id: run,
      external_identifier: null,
      fetched_at: at,
      mime_type: 'text/html',
      parsed,
      normalized_text: hash.normalizedText,
      content_hash: hash.contentHash,
      normalization_version: 'v1',
    }),
  ]);
  const id = saved.rows[0]!.result;
  const doc = await db.query<{ doc: unknown }>(
    'select to_jsonb(d) doc from documents d where id=$1',
    [id.document_id],
  );
  const ver = await db.query<{ ver: unknown }>(
    'select to_jsonb(v) ver from document_versions v where id=$1',
    [id.version_id],
  );
  const candidate = fixture.validations[0]!.candidate;
  const decision = validateCandidate({
    candidate,
    document: documentSchema.parse(doc.rows[0]!.doc),
    version: documentVersionSchema.parse(ver.rows[0]!.ver),
    sourceKey: 'osym',
    sourceActive: true,
    hosts: fixture.hosts,
    ontology: educationOntology,
    asOf: new Date().toISOString(),
  });
  expect(decision.status, decision.reasons.join(', ')).toBe('verified');
  await db.query('select record_extraction($1::jsonb)', [
    JSON.stringify({
      key: randomUUID().replaceAll('-', '').repeat(2),
      version_id: id.version_id,
      provider: 'fixture-only',
      model: 'deterministic',
      ontology_version: educationOntology.version,
      status: 'completed',
      error: null,
      created_at: at,
      results: [{ candidate, decision }],
    }),
  ]);
  await db.query(
    "update crawl_runs set status='success',finished_at=now(),documents_discovered=1,documents_fetched=1 where id=$1",
    [run],
  );
  await db.query(
    "insert into source_coverage(crawl_run_id,checked_at,scope,complete,pages,discovered,reasons) values($1,now(),'rolling_window',false,$2,1,'[]')",
    [run, JSON.stringify([endpoint.base_url])],
  );
  await db.query(
    'update source_endpoints set last_successful_check_at=now() where id=$1',
    [endpoint.id],
  );
  const load = async () =>
    answerSnapshotSchema.parse(
      (
        await db.query<{ data: unknown }>(
          "select product_snapshot(array['yks_ek_yerlestirme'],'2026') data",
        )
      ).rows[0]!.data,
    );
  const before = await load(),
    fact = before.facts[0]!;
  expect(fact.status).toBe('verified');
  await expect(
    db.query(
      "select review_product_fact($1,null,'publish','fixture reviewed evidence','test-operator')",
      [fact.id],
    ),
  ).rejects.toThrow(/fact changed/);
  await db.query(
    "select review_product_fact($1,$2,'publish','fixture reviewed evidence','test-operator')",
    [fact.id, fact.updated_at],
  );
  const published = await load(),
    intent = resolveQuery('YKS ek tercih ne zaman?', 2026).intent!;
  const answer = resolveAnswer(
    intent.resource,
    intent.year,
    published,
    new Date().toISOString(),
  );
  expect(answer.factId).toBe(fact.id);
  expect(answer.value).toBe('20 Eylül 2026 – 25 Eylül 2026');
  expect(answer.evidence[0]!.versionId).toBe(id.version_id);
  expect(answer.history.some((h) => h.action === 'publish')).toBe(true);
  await db.query(
    "select review_product_fact($1,$2,'reject','fixture withdrawal after inspection','test-operator')",
    [fact.id, published.facts[0]!.updated_at],
  );
  expect(
    resolveAnswer(
      intent.resource,
      intent.year,
      await load(),
      new Date().toISOString(),
    ).factId,
  ).toBeNull();
});
it('does not run two endpoint crawls for the same institution concurrently', async () => {
  await db.exec(
    "update endpoint_jobs set due_at=now()+interval '1 day',lease_token=null,lease_until=null;update endpoint_jobs set due_at=now()-interval '1 second' where endpoint_id in(select e.id from source_endpoints e join sources s on s.id=e.source_id where s.slug='gsb')",
  );
  const a = await db.query<{ job: { endpoint_id: string; token: string } }>(
    'select claim_endpoint_job() job',
  );
  expect(a.rows[0]!.job).not.toBeNull();
  const b = await db.query<{ job: null }>('select claim_endpoint_job() job');
  expect(b.rows[0]!.job).toBeNull();
  const j = a.rows[0]!.job;
  await db.query("select finish_endpoint_job($1,$2,true,'')", [
    j.endpoint_id,
    j.token,
  ]);
  const c = await db.query<{ job: { endpoint_id: string } }>(
    'select claim_endpoint_job() job',
  );
  expect(c.rows[0]!.job.endpoint_id).not.toBe(j.endpoint_id);
});
