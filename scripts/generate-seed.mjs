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
let sql = `-- Generated from sources/registry.json by pnpm seed:generate.\n-- Reviewed exact hosts and endpoints: see docs/official-endpoints.md. Disabled records stay disabled.\ninsert into public.sources (id, slug, name, status, authority_type, created_at, updated_at) values\n${rows.join(',\n')}\non conflict (slug) do update set status = excluded.status, updated_at = excluded.updated_at where sources.status = 'candidate';\n\ninsert into public.allowed_hosts (id, source_id, hostname, include_subdomains, status, created_at) values\n${hosts.join(',\n')}\non conflict (source_id, hostname) do nothing;\n`;

const insertRows = (table, columns, records, conflict = 'do nothing') => {
  if (!records.length) return;
  sql += `\ninsert into public.${table} (${columns.join(', ')}) values\n${records.map((row) => '(' + row.map((v) => (v === null ? 'null' : quote(v))).join(', ') + ')').join(',\n')}\non conflict ${conflict};\n`;
};
insertRows(
  'source_endpoints',
  [
    'id',
    'source_id',
    'slug',
    'name',
    'base_url',
    'endpoint_type',
    'status',
    'poll_interval_seconds',
    'created_at',
    'updated_at',
  ],
  registry.endpoints.map((e) => [
    e.id,
    e.source_id,
    e.slug,
    e.name,
    e.base_url,
    e.endpoint_type,
    e.status,
    e.poll_interval_seconds,
    e.created_at,
    e.updated_at,
  ]),
);
const ontology = JSON.parse(
  readFileSync(
    new URL('../sources/education/src/ontology.json', import.meta.url),
    'utf8',
  ),
);
const entityIds = new Map(
  ontology.entities.map((e, i) => [
    e.key,
    `00000000-0000-4000-b000-${String(i + 1).padStart(12, '0')}`,
  ]),
);
const topicIds = new Map(
  ontology.topics.map((t, i) => [
    t.key,
    `00000000-0000-4000-c000-${String(i + 1).padStart(12, '0')}`,
  ]),
);
insertRows(
  'entities',
  ['id', 'key', 'name', 'entity_type'],
  ontology.entities.map((e) => [
    entityIds.get(e.key),
    e.key,
    e.name,
    'education_subject',
  ]),
);
for (const t of ontology.topics)
  insertRows(
    'topics',
    ['id', 'key', 'name', 'parent_id'],
    [
      [
        topicIds.get(t.key),
        t.key,
        t.name,
        t.parent ? topicIds.get(t.parent) : null,
      ],
    ],
  );
insertRows(
  'authority_rules',
  ['topic_id', 'predicate', 'subject_entity_id', 'source_id', 'status'],
  ontology.authorities.flatMap((a) =>
    a.predicates.map((predicate) => [
      topicIds.get(a.topic),
      predicate,
      entityIds.get(a.entity),
      registry.sources.find((s) => s.slug === a.source).id,
      'active',
    ]),
  ),
);
if (sql.includes("'undefined'"))
  throw new Error('Unresolved registry / ontology mapping');
const target = new URL('../supabase/seed.sql', import.meta.url);
if (process.argv.includes('--check')) {
  if (readFileSync(target, 'utf8') !== sql)
    throw new Error('Seed differs from registry; run pnpm seed:generate');
} else writeFileSync(target, sql);
