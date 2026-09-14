import {
  createJsonLogger,
  errorMessage,
  environmentProblems,
} from '@sak/shared';
import { runScheduler } from './scheduler';
import { runEducationCli } from './education-cli';
async function main() {
  if (process.argv.includes('--intelligence')) {
    if (
      process.argv.some((a) =>
        [
          '--write',
          '--scheduler',
          '--health',
          '--check',
          '--inspect',
          '--replay',
          '--bridge',
          '--explain',
        ].includes(a),
      )
    ) {
      const problems = environmentProblems(process.env, 'worker');
      if (problems.length) throw new Error(problems.join('; '));
    }
    if (process.argv.includes('--scheduler'))
      return (
        await import('./intelligence-scheduler')
      ).runIntelligenceScheduler();
    return (await import('./intelligence-cli')).runIntelligenceCli();
  }
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
