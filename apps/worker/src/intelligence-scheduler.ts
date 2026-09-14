import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readFile, writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { z } from 'zod';
import {
  createDatabaseClient,
  createIntelligenceRepository,
} from '@sak/database';
import { sourceSchema } from '@sak/news-intelligence';
export async function runIntelligenceScheduler() {
  const concurrency = z.coerce
    .number()
    .int()
    .min(1)
    .max(4)
    .parse(process.env['NEWS_CONCURRENCY'] ?? 2);
  const db = createDatabaseClient(process.env),
    repo = createIntelligenceRepository(db);
  for (const source of z
    .array(sourceSchema)
    .parse(
      JSON.parse(
        await readFile(
          new URL('../../../sources/news/registry.json', import.meta.url),
          'utf8',
        ),
      ),
    ))
    await repo.register(source);
  const abort = new AbortController(),
    children = new Set<ReturnType<typeof spawn>>();
  const stop = () => {
    abort.abort();
    for (const child of children) child.kill('SIGTERM');
    setTimeout(() => {
      for (const child of children) child.kill('SIGKILL');
    }, 5000).unref();
  };
  process.once('SIGTERM', stop);
  process.once('SIGINT', stop);
  let databaseSeen = Date.now();
  await writeFile('/tmp/sak-worker-heartbeat', String(databaseSeen));
  const heartbeat = setInterval(() => {
    if (Date.now() - databaseSeen < 90000)
      void writeFile('/tmp/sak-worker-heartbeat', String(databaseSeen)).catch(
        () => {},
      );
  }, 30000);
  function execute(args: string[]) {
    return new Promise<boolean>((resolve) => {
      const child = spawn(
        process.execPath,
        [
          '--import',
          'tsx',
          fileURLToPath(new URL('./main.ts', import.meta.url)),
          '--intelligence',
          ...args,
          '--write',
        ],
        { stdio: 'inherit', env: process.env },
      );
      children.add(child);
      const timeout = setTimeout(() => child.kill('SIGKILL'), 11 * 60 * 1000);
      const finish = (ok: boolean) => {
        clearTimeout(timeout);
        children.delete(child);
        resolve(ok);
      };
      child.once('exit', (code) => finish(code === 0));
      child.once('error', () => finish(false));
    });
  }
  async function lane() {
    while (!abort.signal.aborted) {
      try {
        const [row] = await db.query<{
          job: { sourceId: string; token: string } | null;
        }>('select intelligence_claim_source() job');
        databaseSeen = Date.now();
        if (!row?.job) {
          await delay(10000, undefined, { signal: abort.signal });
          continue;
        }
        const job = row.job,
          success = await execute(['--source', job.sourceId]);
        await db.query(
          'select intelligence_finish_source($1,$2::uuid,$3,$4::jsonb,$5)',
          [
            job.sourceId,
            job.token,
            success,
            { success },
            success ? '' : 'crawl_or_processing_failed',
          ],
        );
        databaseSeen = Date.now();
      } catch (error) {
        if (abort.signal.aborted) break;
        console.error(
          JSON.stringify({
            event: 'intelligence_scheduler_error',
            reason: error instanceof Error ? error.message : 'unknown',
          }),
        );
        await delay(5000, undefined, { signal: abort.signal }).catch(() => {});
      }
    }
  }
  async function maintenance() {
    let nextBridge = 0;
    while (!abort.signal.aborted) {
      try {
        await db.query('select 1');
        databaseSeen = Date.now();
        if (Date.now() >= nextBridge) {
          const success = await execute(['--bridge']);
          console.log(
            JSON.stringify({ event: 'intelligence_official_bridge', success }),
          );
          nextBridge = Date.now() + 900000;
          // Only disposable HTTP caches expire; report/evidence/update history is immutable.
          await db.query(
            "delete from intelligence_http_cache where (response->>'checkedAt')::timestamptz<now()-interval '7 days'",
          );
          console.log(
            JSON.stringify({
              event: 'intelligence_health',
              sources: await repo.health(),
            }),
          );
        }
      } catch (error) {
        console.error(
          JSON.stringify({
            event: 'intelligence_maintenance_error',
            reason: error instanceof Error ? error.message : 'unknown',
          }),
        );
      }
      await delay(30000, undefined, { signal: abort.signal }).catch(() => {});
    }
  }
  try {
    await Promise.all([
      ...Array.from({ length: concurrency }, lane),
      maintenance(),
    ]);
  } finally {
    clearInterval(heartbeat);
    stop();
    await db.end();
  }
}
