import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  fingerprintDocument,
  persistDocumentResultSchema,
  type PersistDocumentInput,
} from '../packages/ingestion/src/index';
import { registry, source, endpoint, documentFixture } from './helpers';

let db: PGlite;
let clock = Date.parse('2026-09-08T00:00:00Z');
beforeAll(async () => {
  db = new PGlite();
  await db.exec(
    await readFile(
      new URL(
        '../database/migrations/20260908184053_foundation.sql',
        import.meta.url,
      ),
      'utf8',
    ),
  );
  await db.exec(
    await readFile(new URL('../database/seed.sql', import.meta.url), 'utf8'),
  );
  await db.query(
    'insert into sources(id,slug,name,status,authority_type) values($1,$2,$3,$4,$5)',
    [source.id, source.slug, source.name, source.status, source.authority_type],
  );
  for (const host of registry.hosts)
    await db.query(
      'insert into allowed_hosts(id,source_id,hostname,status) values($1,$2,$3,$4)',
      [host.id, source.id, host.hostname, host.status],
    );
  await db.query(
    'insert into source_endpoints(id,source_id,slug,name,base_url,endpoint_type,status,poll_interval_seconds) values($1,$2,$3,$4,$5,$6,$7,$8)',
    [
      endpoint.id,
      source.id,
      endpoint.slug,
      endpoint.name,
      endpoint.base_url,
      endpoint.endpoint_type,
      endpoint.status,
      endpoint.poll_interval_seconds,
    ],
  );
});
afterAll(async () => {
  await db?.close();
});

async function inputFor(
  rawText: string,
  url = `https://fixture.gov.tr/${randomUUID()}`,
): Promise<PersistDocumentInput> {
  const runId = randomUUID();
  const at = new Date((clock += 1000)).toISOString();
  await db.query(
    "insert into crawl_runs(id, source_endpoint_id, status, started_at) values($1,$2,'running',$3)",
    [runId, endpoint.id, at],
  );
  const parsed = {
    ...documentFixture.parsed,
    raw_text: rawText,
    canonical_url: url,
  };
  const hash = fingerprintDocument(parsed, 'text/plain');
  return {
    source_id: source.id,
    source_endpoint_id: endpoint.id,
    crawl_run_id: runId,
    external_identifier: null,
    fetched_at: at,
    mime_type: 'text/plain',
    parsed,
    normalized_text: hash.normalizedText,
    content_hash: hash.contentHash,
    normalization_version: 'v1',
  };
}
async function persist(input: PersistDocumentInput) {
  const result = await db.query<{ result: unknown }>(
    'select public.persist_ingested_document($1::jsonb) as result',
    [JSON.stringify(input)],
  );
  return persistDocumentResultSchema.parse(result.rows[0]?.result);
}
async function count(table: string) {
  const allowed = ['document_versions', 'documents', 'document_observations'];
  if (!allowed.includes(table)) throw new Error('Unexpected table');
  return (
    (
      await db.query<{ count: number }>(
        `select count(*)::integer as count from ${table}`,
      )
    ).rows[0]?.count ?? 0
  );
}

describe('PostgreSQL migration and transactional persistence', () => {
  it('creates the private application schema', async () => {
    const result = await db.query<{ relname: string; relrowsecurity: boolean }>(
      "select relname,relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and relkind='r'",
    );
    expect(result.rows).toHaveLength(17);
  });
  it('preserves A → B → A with only two immutable versions and three observations', async () => {
    const versionsBefore = await count('document_versions');
    const observationsBefore = await count('document_observations');
    const input = await inputFor('Synthetic A');
    const a = await persist(input);
    const b = await persist(
      await inputFor('Synthetic B', input.parsed.canonical_url),
    );
    const reverted = await persist(
      await inputFor('Synthetic A', input.parsed.canonical_url),
    );
    expect([a.outcome, b.outcome, reverted.outcome]).toEqual([
      'new_document',
      'new_version',
      'new_version',
    ]);
    expect(reverted.version_id).toBe(a.version_id);
    expect(await count('document_versions')).toBe(versionsBefore + 2);
    expect(await count('document_observations')).toBe(observationsBefore + 3);
  });
  it('is idempotent within a crawl and records unchanged later checks', async () => {
    const input = await inputFor('Synthetic stable');
    const first = await persist(input);
    expect(await persist(input)).toEqual(first);
    expect(
      (
        await persist(
          await inputFor('Synthetic stable', input.parsed.canonical_url),
        )
      ).outcome,
    ).toBe('unchanged');
  });
  it('rolls back the logical document when version insertion fails', async () => {
    const before = await count('documents');
    const input = await inputFor('Synthetic invalid');
    await expect(
      persist({ ...input, content_hash: 'invalid' }),
    ).rejects.toThrow();
    expect(await count('documents')).toBe(before);
  });
  it('prevents stale fetches from rolling back current content', async () => {
    const old = await inputFor('Synthetic old');
    await persist(await inputFor('Synthetic new', old.parsed.canonical_url));
    await expect(persist(old)).rejects.toThrow('Stale observation');
  });
  it('prevents historical version updates and deletion', async () => {
    const record = await persist(await inputFor('Synthetic immutable'));
    await expect(
      db.query("update document_versions set raw_text='tampered' where id=$1", [
        record.version_id,
      ]),
    ).rejects.toThrow('immutable');
    await expect(
      db.query('delete from document_versions where id=$1', [
        record.version_id,
      ]),
    ).rejects.toThrow('immutable');
  });
  it('rejects a current version belonging to a different logical document', async () => {
    const first = await persist(await inputFor('Synthetic first'));
    const second = await persist(await inputFor('Synthetic second'));
    await expect(
      db.query('update documents set current_version_id=$1 where id=$2', [
        first.version_id,
        second.document_id,
      ]),
    ).rejects.toThrow('foreign key');
  });
  it('prevents source/endpoint ownership mismatches', async () => {
    const input = await inputFor('Synthetic wrong source');
    await expect(
      persist({ ...input, source_id: randomUUID() }),
    ).rejects.toThrow('active source');
  });
  it('allows the server database account while denying history edits and deletion', async () => {
    const input = await inputFor('Synthetic service role');
    expect((await persist(input)).outcome).toBe('new_document');
    await expect(
      db.query("update document_versions set raw_text='tampered'"),
    ).rejects.toThrow('immutable');
  });
  it('requires evidence for publication and preserves superseded facts', async () => {
    const doc = await persist(
      await inputFor('Synthetic deadline 12 September'),
    );
    const entity = randomUUID();
    const factId = randomUUID();
    await db.query(
      "insert into entities(id,key,name,entity_type) values($1,$2,'Synthetic service','test')",
      [entity, entity],
    );
    await db.query(
      "insert into facts(id,subject_entity_id,predicate,value,authority_source_id) values($1,$2,'deadline',$3,$4)",
      [
        factId,
        entity,
        JSON.stringify({ type: 'date', value: '2026-09-12' }),
        source.id,
      ],
    );
    await expect(
      db.query(
        "update facts set status='published',verified_at=now(),published_at=now() where id=$1",
        [factId],
      ),
    ).rejects.toThrow('evidence');
    await db.query(
      "insert into fact_evidence(fact_id,document_version_id,evidence_text,evidence_locator) values($1,$2,'deadline 12 September',$3)",
      [factId, doc.version_id, JSON.stringify({ representation: 'raw_text' })],
    );
    await db.query(
      "update facts set status='published',verified_at=now(),published_at=now() where id=$1",
      [factId],
    );
    await expect(
      db.query('update facts set value=$1 where id=$2', [
        JSON.stringify({ type: 'date', value: '2026-09-10' }),
        factId,
      ]),
    ).rejects.toThrow('immutable');
    await db.query(
      "update facts set status='superseded',superseded_at=now() where id=$1",
      [factId],
    );
    await expect(
      db.query('delete from facts where id=$1', [factId]),
    ).rejects.toThrow('Historical');
  });
  it('checks typed values in PostgreSQL as well as TypeScript', async () => {
    const result = await db.query<{ valid: boolean; invalid: boolean }>(
      'select public.is_fact_value($1) as valid,public.is_fact_value($2) as invalid',
      [
        JSON.stringify({ type: 'money', amount: '123.45', currency: 'TRY' }),
        JSON.stringify({ type: 'money', amount: 123.45, currency: 'TRY' }),
      ],
    );
    expect(result.rows[0]).toEqual({ valid: true, invalid: false });
  });
  it('prevents topic cycles', async () => {
    const a = randomUUID();
    const b = randomUUID();
    await db.query(
      "insert into topics(id,key,name) values($1,'synthetic','Synthetic')",
      [a],
    );
    await db.query(
      "insert into topics(id,key,name,parent_id) values($1,'synthetic.child','Child',$2)",
      [b, a],
    );
    await expect(
      db.query('update topics set parent_id=$1 where id=$2', [b, a]),
    ).rejects.toThrow('cycles');
  });
});
