import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { beforeAll, afterAll, expect, it } from 'vitest';
import { createIntelligenceRepository } from '../packages/database/src/intelligence';
import type { DatabaseClient } from '../packages/database/src/client';
import {
  processReport,
  sourceSchema,
} from '../packages/news-intelligence/src/index';
import { fixtureSource, report, scenario } from './intelligence-fixtures';
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
const repo = createIntelligenceRepository(client);
const signal = () => AbortSignal.timeout(30000);
beforeAll(async () => {
  db = new PGlite({ extensions: { pg_trgm } });
  for (const name of (await readdir('database/migrations'))
    .filter((n) => n.endsWith('.sql'))
    .sort())
    await db.exec(await readFile('database/migrations/' + name, 'utf8'));
  for (const r of scenario())
    await repo.register(
      sourceSchema.parse({
        ...fixtureSource,
        id: r.sourceId,
        family: r.sourceFamily,
      }),
    );
}, 30000);
afterAll(async () => db?.close());
it('persists a complete evolving event with exact evidence and replay idempotency', async () => {
  await repo.namespace('dev-flow');
  const input = scenario();
  for (const r of input) {
    expect(await repo.store(r)).toBe(true);
    await repo.process(r, 'dev-flow', signal());
  }
  const [event] = await repo.events('dev-flow');
  expect(event?.reports).toHaveLength(4);
  expect(event?.timeline).toHaveLength(4);
  expect(event?.signals.families).toBe(2);
  const saved = await client.query<{
    quote: string;
    text: string;
    start: number;
    end: number;
  }>(
    `select e.quote,r.report->>'text' text,e.start_offset start,e.end_offset "end" from intelligence_evidence e join intelligence_reports r on r.id=e.report_id where namespace='dev-flow'`,
  );
  expect(saved.length).toBeGreaterThan(3);
  for (const e of saved) expect(e.text.slice(e.start, e.end)).toBe(e.quote);
  for (const r of input) {
    expect(await repo.store(r)).toBe(false);
    expect((await repo.process(r, 'dev-flow', signal())).duplicate).toBe(true);
  }
  expect((await repo.events('dev-flow'))[0]?.timeline).toHaveLength(4);
  const timeline = await client.query<{ claims: { status: string }[] }>(
    "select claims from intelligence_updates where namespace='dev-flow' order by at,id",
  );
  expect(
    timeline.some((u) => u.claims.some((c) => c.status === 'conflicting')),
  ).toBe(true);
  expect(await repo.reports({ namespace: 'dev-flow' })).toHaveLength(0);
  expect(await repo.events('live')).toHaveLength(0);
});
it('rejects stale namespace revisions and lets pending stored reports retry without fetching', async () => {
  await repo.namespace('dev-cas');
  const r = scenario()[0]!,
    event = (await processReport(r, [], r.discoveredAt, signal())).event;
  expect(
    (
      await client.query<{ saved: boolean }>(
        'select intelligence_save_event($1,$2,$3,$4::jsonb) saved',
        ['dev-cas', 999, r.id, event],
      )
    )[0]?.saved,
  ).toBe(false);
  expect(
    (await repo.reports({ namespace: 'dev-cas' })).some((p) => p.id === r.id),
  ).toBe(true);
  await expect(
    repo.process(r, 'dev-cas', signal(), {
      analysis: {
        name: 'offline',
        async analyze() {
          throw new Error('model_offline');
        },
      },
    }),
  ).rejects.toThrow('model_offline');
  await repo.process(r, 'dev-cas', signal());
  expect(await repo.events('dev-cas')).toHaveLength(1);
  await expect(
    client.query(
      'update intelligence_reports set published_at=now() where id=$1',
      [r.id],
    ),
  ).rejects.toThrow();
  await expect(
    client.query("delete from intelligence_updates where namespace='dev-cas'"),
  ).rejects.toThrow();
});
it('does not permit invented provenance, forged quotes, or deleting prior event history', async () => {
  const r = scenario()[0]!;
  await repo.namespace('dev-tamper');
  const event = (await processReport(r, [], r.discoveredAt, signal())).event;
  const bad = structuredClone(event);
  bad.claims[0]!.evidence[0]!.quote = 'An invented quotation';
  await expect(
    client.query('select intelligence_save_event($1,0,$2,$3::jsonb)', [
      'dev-tamper',
      r.id,
      bad,
    ]),
  ).rejects.toThrow('Claim evidence mismatch');
  const official = structuredClone(event);
  official.claims[0]!.evidence[0]!.officialVersionId =
    '11111111-1111-4111-8111-111111111111';
  await expect(
    client.query('select intelligence_save_event($1,0,$2,$3::jsonb)', [
      'dev-tamper',
      r.id,
      official,
    ]),
  ).rejects.toThrow('identity mismatch');
  await expect(
    repo.store({
      ...r,
      id: 'f'.repeat(64),
      officialVersionId: '11111111-1111-4111-8111-111111111111',
    }),
  ).rejects.toThrow('Official bridge evidence invalid');
  await repo.process(r, 'dev-tamper', signal());
  const second = scenario()[1]!,
    next = (await processReport(second, [event], second.discoveredAt, signal()))
      .event;
  next.timeline = next.timeline.slice(1);
  await expect(
    client.query('select intelligence_save_event($1,1,$2,$3::jsonb)', [
      'dev-tamper',
      second.id,
      next,
    ]),
  ).rejects.toThrow('Event history');
});
it('uses explicit occurrence dates when a later article describes an older event', async () => {
  await repo.namespace('dev-occurrence');
  const a = report(
    'source-a',
    'Ankara Eskişehir yolunda kaza',
    'Ankara Eskişehir yolunda kaza 1 Eylül 2026 tarihinde meydana geldi. Kazada 2 kişi yaralandı.',
    '2026-09-02T09:00:00.000Z',
  );
  const b = report(
    'source-b',
    'Eskişehir yolundaki kaza hakkında açıklama',
    'Ankara Eskişehir yolunda kaza 1 Eylül 2026 tarihinde meydana geldi. Kazada 2 kişi yaralandı.',
    '2026-09-12T09:00:00.000Z',
  );
  for (const r of [a, b]) {
    await repo.store(r);
    await repo.process(r, 'dev-occurrence', signal());
  }
  expect(await repo.events('dev-occurrence')).toHaveLength(1);
});
it('leases exclude shared hosts, reject wrong tokens, retain crawl stats, and back off failures', async () => {
  const one = await client.query<{
    job: { sourceId: string; token: string } | null;
  }>('select intelligence_claim_source() job');
  expect(one[0]?.job).not.toBeNull();
  const job = one[0]!.job!;
  expect(
    (
      await client.query<{ job: null }>(
        'select intelligence_claim_source() job',
      )
    )[0]?.job,
  ).toBeNull();
  expect(
    (
      await client.query<{ ok: boolean }>(
        "select intelligence_finish_source($1,'11111111-1111-4111-8111-111111111111',false,'{}',null) ok",
        [job.sourceId],
      )
    )[0]?.ok,
  ).toBe(false);
  await client.query(
    "update intelligence_sources set last_stats='{" +
      '"parsed":3' +
      "}'::jsonb where id=$1",
    [job.sourceId],
  );
  await client.query(
    "select intelligence_finish_source($1,$2,false,'{}','fixture_failure')",
    [job.sourceId, job.token],
  );
  const [state] = await client.query<{
    attempts: number;
    deferred: boolean;
    last_stats: { parsed: number };
    last_successful_check_at: null;
  }>(
    'select attempts,due_at>now() deferred,last_stats,last_successful_check_at from intelligence_sources where id=$1',
    [job.sourceId],
  );
  expect(state?.attempts).toBe(1);
  expect(state?.deferred).toBe(true);
  expect(state?.last_stats.parsed).toBe(3);
  expect(state?.last_successful_check_at).toBeNull();
  await repo.register(
    sourceSchema.parse({
      ...fixtureSource,
      id: job.sourceId,
      status: 'active',
    }),
  );
  expect(
    (
      await client.query<{ attempts: number }>(
        'select attempts from intelligence_sources where id=$1',
        [job.sourceId],
      )
    )[0]?.attempts,
  ).toBe(1);
});
it('retains HTTP validators durably for a later worker process', async () => {
  const response = {
    url: 'https://fixture.example/article',
    body: 'fixture content',
    etag: 'v1',
    lastModified: null,
    checkedAt: '2026-09-10T00:00:00Z',
    status: 200,
  };
  await repo.cache.put('source-a', response);
  expect(
    await createIntelligenceRepository(client).cache.get(
      'source-a',
      response.url,
    ),
  ).toEqual(response);
});
it('synchronizes parser settings without re-enabling disabled sources or resetting health', async () => {
  await client.query(
    "update intelligence_sources set status='disabled' where id='source-c'",
  );
  await repo.register(
    sourceSchema.parse({
      ...fixtureSource,
      id: 'source-c',
      articleSelector: '.new-parser',
    }),
  );
  const source = (await repo.sources()).find((s) => s.id === 'source-c');
  expect(source?.status).toBe('disabled');
  expect(source?.articleSelector).toBe('.new-parser');
  expect((await repo.quality()).every((c) => c['violations'] === 0)).toBe(true);
});
it('public queries serve only live open-web reports and their current revisions, with source filtering', async () => {
  const { listPublicEvents, getPublicEvent } =
    await import('../packages/database/src/public-events');
  const s = sourceSchema.parse({ ...fixtureSource, id: 'public-source' });
  await repo.register(s);
  const first = {
    ...report(
      s.id,
      'Ankara Eskişehir yolunda halka açık test haberi',
      'Ankara Eskişehir yolunda 3 araç çarpıştı. Kazada 2 kişi yaralandı.',
    ),
    metadata: {},
  };
  await repo.store(first);
  await repo.process(first, 'live', signal());
  const firstFeed = await listPublicEvents(client, 24, s.id);
  expect(firstFeed).toHaveLength(1);
  expect(firstFeed[0]?.publishedAt).toBe(first.publishedAt);
  const revised = {
    ...report(
      s.id,
      first.title,
      first.text.replace('2 kişi', '4 kişi'),
      '2026-09-10T10:00:00.000Z',
      first.canonicalUrl,
    ),
    metadata: {},
  };
  await repo.store(revised);
  await repo.process(revised, 'live', signal());
  const event = await getPublicEvent(client, firstFeed[0]!.id);
  expect(event?.sources).toHaveLength(1);
  expect(event?.sources[0]?.id).toBe(revised.id);
  expect(event?.history).toHaveLength(2);
  expect(
    event?.claims.find((c) => c.predicate === 'injury_count')?.value,
  ).toEqual({ type: 'number', value: 4 });
  expect(await listPublicEvents(client, 24, 'unknown-source')).toHaveLength(0);
  expect(await getPublicEvent(client, 'bad-id')).toBeNull();
  await client.query(
    "update intelligence_sources set status='disabled' where id=$1",
    [s.id],
  );
  expect(await getPublicEvent(client, firstFeed[0]!.id)).toBeNull();
});
