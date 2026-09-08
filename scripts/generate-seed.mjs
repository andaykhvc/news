import { readFileSync, writeFileSync } from 'node:fs';
import { URL } from 'node:url';

const registry = JSON.parse(
  readFileSync(new URL('../sources/registry.json', import.meta.url), 'utf8'),
);
const quote = (value) => `'${String(value).replaceAll("'", "''")}'`;
const rows = registry.sources.map(
  (s) =>
    `(${[s.id, s.slug, s.name, s.status, s.authority_type, s.created_at, s.updated_at].map(quote).join(', ')})`,
);
const hosts = registry.hosts.map(
  (h) =>
    `(${[h.id, h.source_id, h.hostname].map(quote).join(', ')}, ${h.include_subdomains}, ${quote(h.status)}, ${quote(h.created_at)})`,
);
const sql = `-- Generated from sources/registry.json by pnpm seed:generate.\n-- Candidates only; no unverified endpoint URLs or automatic trust activation.\ninsert into public.sources (id, slug, name, status, authority_type, created_at, updated_at) values\n${rows.join(',\n')}\non conflict (slug) do nothing;\n\ninsert into public.allowed_hosts (id, source_id, hostname, include_subdomains, status, created_at) values\n${hosts.join(',\n')}\non conflict (source_id, hostname) do nothing;\n`;
const target = new URL('../supabase/seed.sql', import.meta.url);
if (process.argv.includes('--check')) {
  if (readFileSync(target, 'utf8') !== sql)
    throw new Error('Seed differs from registry; run pnpm seed:generate');
} else writeFileSync(target, sql);
