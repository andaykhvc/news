import { environmentProblems } from '../packages/shared/src/index';
const target = process.argv.includes('--worker') ? 'worker' : 'web';
const problems = environmentProblems(
  process.env,
  target,
  process.argv.includes('--production'),
);
if (problems.length) {
  console.error(problems.join('\n'));
  process.exitCode = 1;
} else
  console.log(
    `${target}: environment configuration valid (secret values omitted)`,
  );
