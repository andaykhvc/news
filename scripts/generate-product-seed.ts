import { readFileSync, writeFileSync } from 'node:fs';
import { answerResources, normalizeQuery } from '../packages/answers/src/index';
const quote = (s: string) => "'" + s.replaceAll("'", "''") + "'";
const rows = answerResources.flatMap((r) =>
  r.aliases.map((a) => `(${quote(normalizeQuery(a))},${quote(r.key)})`),
);
const sql = `-- Generated editorial aliases only; contains no government facts.\ninsert into public.query_aliases(alias,resource_key) values\n${rows.join(',\n')}\non conflict(alias) do update set resource_key=excluded.resource_key;\n`;
const file = new URL('../database/product-seed.sql', import.meta.url);
if (process.argv.includes('--check')) {
  if (readFileSync(file, 'utf8') !== sql) throw new Error('Product seed drift');
} else writeFileSync(file, sql);
