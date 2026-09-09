import { createJsonLogger, errorMessage } from '@sak/shared';
import { runScheduler } from './scheduler';
import { runEducationCli } from './education-cli';
async function main() {
  if (process.argv.includes('--scheduler')) return runScheduler();
  if (process.argv.includes('--demo')) {
    if (process.env['NODE_ENV'] === 'production')
      throw new Error('Demo is disabled in production');
    return (await import('./demo')).runDemo();
  }
  return runEducationCli();
}
main().catch((error) => {
  createJsonLogger().log('error', 'pipeline_failed', {
    message: errorMessage(error),
  });
  process.exitCode = 1;
});
