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
        const result = await client
          .rpc('product_maintenance', {})
          .abortSignal(AbortSignal.timeout(10000));
        if (result.error) throw new Error('Scheduled maintenance failed');
      }
      const claim = await client
        .rpc('claim_endpoint_job', {})
        .abortSignal(AbortSignal.timeout(10000));
      if (claim.error) throw new Error('Could not claim worker job');
      if (!claim.data) {
        if (once) return;
        await delay(15000);
        continue;
      }
      const job = jobSchema.parse(claim.data);
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
      const done = await client
        .rpc('finish_endpoint_job', {
          p_endpoint: job.endpoint_id,
          p_token: job.token,
          p_success: success,
          p_error: success
            ? ''
            : 'crawl_failed_or_timed_out; inspect crawl_errors',
        })
        .abortSignal(AbortSignal.timeout(10000));
      if (done.error || !done.data)
        console.error('Job completion rejected; lease may have expired');
      if (once) return;
    } while (!stopping);
  }
  const maintenance = await client
    .rpc('product_maintenance', {})
    .abortSignal(AbortSignal.timeout(10000));
  if (maintenance.error) throw new Error('Product maintenance failed');
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
