import { readFileSync } from 'node:fs';
import { URL } from 'node:url';

const allowed = {
  domain: [],
  shared: [],
  validation: ['domain'],
  'source-sdk': ['domain', 'shared', 'validation'],
  ingestion: ['domain', 'shared', 'validation', 'source-sdk'],
  database: ['domain', 'ingestion'],
};
for (const [name, dependencies] of Object.entries(allowed)) {
  const pkg = JSON.parse(
    readFileSync(
      new URL(`../packages/${name}/package.json`, import.meta.url),
      'utf8',
    ),
  );
  for (const dep of Object.keys(pkg.dependencies ?? {})) {
    if (dep.startsWith('@sak/') && !dependencies.includes(dep.slice(5)))
      throw new Error(`${name} cannot depend on ${dep}`);
  }
}
console.log('Package dependency boundaries passed.');
