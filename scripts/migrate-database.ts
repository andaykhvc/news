import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDatabaseClient } from '../packages/database/src/index';

const root = fileURLToPath(new URL('..', import.meta.url));
const directory = join(root, 'database', 'migrations');
const client = createDatabaseClient(process.env);

await client.query(
  'create table if not exists schema_migrations(name text primary key, applied_at timestamptz not null default now())',
);

for (const name of (await readdir(directory))
  .filter((name) => name.endsWith('.sql'))
  .sort()) {
  const applied = await client.query<{ name: string }>(
    'select name from schema_migrations where name=$1',
    [name],
  );
  if (applied.length) continue;
  const migration = await readFile(join(directory, name), 'utf8');
  await client.query(migration);
  await client.query('insert into schema_migrations(name) values($1)', [name]);
  console.log(`Applied ${name}`);
}

for (const name of ['seed.sql', 'product-seed.sql']) {
  await client.query(await readFile(join(root, 'database', name), 'utf8'));
  console.log(`Applied ${name}`);
}

await client.end();
