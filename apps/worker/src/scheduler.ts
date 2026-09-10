import { writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { createDatabaseClient } from '@sak/database';
const jobSchema = z.object({
  endpoint_id: z.string().uuid(),
  token: z.string().uuid(),
});
/** Each endpoint runs in a bounded child; PDF limits and transport retries remain in the existing pipeline. */
export async function runScheduler() {
  const concurrency = z.coerce
    .number()
    .int()
    .min(1)
    .max(4)
    .parse(process.env['WORKER_CONCURRENCY'] ?? 2);
  const client = createDatabaseClient(process.env);
  let stopping = false;
  let lastMaintenance = Date.now();
  const heartbeat = setInterval(() => {
    void writeFile('/tmp/sak-worker-heartbeat', String(Date.now())).catch(
      () => {},
    );
  }, 30000);
  heartbeat.unref();
  const children = new Set<ReturnType<typeof spawn>>();
  const stop = () => {
    stopping = true;
    clearInterval(heartbeat);
    for (const child of children) {
      child.kill('SIGTERM');
      const kill = setTimeout(() => child.kill('SIGKILL'), 5000);
      kill.unref();
      child.once('exit', () => clearTimeout(kill));
    }
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  const once = process.argv.includes('--once');
  async function lane() {
    do {
      if (Date.now() - lastMaintenance > 3600000) {
        lastMaintenance = Date.now();
        await client.query('select product_maintenance()');
      }
      const claim = await client.query<{ job: unknown }>(
        'select claim_endpoint_job() job',
      );
      if (!claim[0]?.job) {
        if (once) return;
        await delay(15000);
        continue;
      }
      const job = jobSchema.parse(claim[0].job);
      const success = await new Promise<boolean>((resolve) => {
        const args = [
          '--import',
          'tsx',
          fileURLToPath(new URL('./main.ts', import.meta.url)),
          '--source',
          'all',
          '--endpoint',
          job.endpoint_id,
          '--write',
        ];
        if (process.env['EXTRACTION_MODEL'] && process.env['OPENAI_API_KEY'])
          args.push('--provider', 'openai');
        const child = spawn(process.execPath, args, {
          stdio: 'inherit',
          env: process.env,
        });
        children.add(child);
        let hardKill: ReturnType<typeof setTimeout> | undefined;
        const timeout = setTimeout(
          () => {
            child.kill('SIGTERM');
            hardKill = setTimeout(() => child.kill('SIGKILL'), 5000);
          },
          20 * 60 * 1000,
        );
        child.once('error', () => {
          clearTimeout(timeout);
          children.delete(child);
          resolve(false);
        });
        child.once('exit', (code) => {
          clearTimeout(timeout);
          clearTimeout(hardKill);
          children.delete(child);
          resolve(code === 0);
        });
      });
      const done = await client.query<{ done: boolean }>(
        'select finish_endpoint_job($1::uuid,$2::uuid,$3,$4) done',
        [
          job.endpoint_id,
          job.token,
          success,
          success ? '' : 'crawl_failed_or_timed_out; inspect crawl_errors',
        ],
      );
      if (done[0]?.done !== true)
        console.error('Job completion rejected; lease may have expired');
      if (once) return;
    } while (!stopping);
  }
  await client.query('select product_maintenance()');
  const results = await Promise.allSettled(
    Array.from({ length: concurrency }, () =>
      lane().catch((error: unknown) => {
        stop();
        throw error;
      }),
    ),
  );
  stop();
  if (results.some((r) => r.status === 'rejected'))
    throw new Error('Scheduler lane failed');
}
