import { createDatabaseClient, createRepositories } from '@sak/database';
import { createJsonLogger, errorMessage } from '@sak/shared';
import { executeJob } from './jobs';
import { runDemo } from './demo';

async function main() {
  if (process.argv.includes('--demo')) return runDemo();
  const logger = createJsonLogger();
  const endpointIndex = process.argv.indexOf('--endpoint');
  if (endpointIndex < 0) {
    logger.log('info', 'worker_ready', {
      installed_adapters: 0,
      message:
        'No real source adapters installed. Use --demo for an offline run.',
    });
    return;
  }
  const controller = new AbortController();
  process.once('SIGINT', () => controller.abort());
  process.once('SIGTERM', () => controller.abort());
  const repositories = createRepositories(createDatabaseClient(process.env));
  const report = await executeJob(
    { type: 'ingest_endpoint', endpointId: process.argv[endpointIndex + 1] },
    {
      repositories,
      adapters: new Map(),
      logger,
      signal: controller.signal,
      httpForSource: () => {
        throw new Error(
          'Live network transport must be configured with the first adapter',
        );
      },
    },
  );
  if (report.status !== 'success') process.exitCode = 1;
}
main().catch((error) => {
  createJsonLogger().log('error', 'pipeline_failed', {
    message: errorMessage(error),
  });
  process.exitCode = 1;
});
