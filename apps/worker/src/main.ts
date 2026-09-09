import { createJsonLogger, errorMessage } from '@sak/shared';
import { runDemo } from './demo';
import { runEducationCli } from './education-cli';
async function main() {
  if (process.argv.includes('--demo')) return runDemo();
  return runEducationCli();
}
main().catch((error) => {
  createJsonLogger().log('error', 'pipeline_failed', {
    message: errorMessage(error),
  });
  process.exitCode = 1;
});
