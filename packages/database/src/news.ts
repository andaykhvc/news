import { z } from 'zod';
import { extractNews } from '@sak/ingestion';
import type { AllowedHost } from '@sak/domain';
import type { DatabaseClient } from './client';
import { createKnowledgeRepository } from './knowledge';

export async function publishNewsVersion(
  client: DatabaseClient,
  versionId: string,
  hosts: AllowedHost[],
) {
  const { document, version } =
    await createKnowledgeRepository(client).getVersion(versionId);
  const candidate = extractNews(version, document.source_id, hosts);
  if (candidate.reason) return { published: false, reason: candidate.reason };
  const result = await client.query<{ published: boolean }>(
    'select publish_official_news($1::uuid,$2::jsonb,$3::jsonb) published',
    [versionId, candidate.excerpts, candidate.actions],
  );
  return { published: result[0]?.published ?? false, reason: null };
}

const articleSchema = z.object({
  id: z.string(),
  version_id: z.string(),
  title: z.string(),
  canonical_url: z.string(),
  source_name: z.string(),
  source_slug: z.string(),
  published_at: z.string().nullable(),
  verified_at: z.string(),
  latest_seen_at: z.string(),
  stale: z.boolean(),
  excerpts: z.array(
    z.object({
      id: z.string(),
      quote: z.string(),
      character_start: z.number(),
      character_end: z.number(),
    }),
  ),
  actions: z.array(z.object({ label: z.string(), url: z.string() })),
  links: z.array(z.object({ text: z.string(), url: z.string() })),
});
export type NewsArticle = z.infer<typeof articleSchema>;
const selection = `
 select d.id,v.id version_id,v.title,d.canonical_url,s.name source_name,s.slug source_slug,
 v.published_at,n.created_at verified_at,d.latest_seen_at,
 coalesce(v.metadata->'official_links','[]'::jsonb) links,
 (d.latest_seen_at<now()-make_interval(secs=>greatest(e.poll_interval_seconds*3,3600))
 or e.last_successful_check_at is null
 or e.last_successful_check_at<now()-make_interval(secs=>greatest(e.poll_interval_seconds*3,3600))
 or exists(select 1 from crawl_runs r join source_coverage c on c.crawl_run_id=r.id where r.id=(select rr.id from crawl_runs rr where rr.source_endpoint_id=e.id and rr.status not in('running','queued') order by rr.started_at desc limit 1) and (r.status<>'success' or exists(select 1 from jsonb_array_elements_text(c.reasons) reason where reason not in('document_limit','bounded_or_incomplete_discovery'))))) stale,
 (select jsonb_agg(jsonb_build_object('id',f.id,'quote',f.quote,'character_start',f.character_start,'character_end',f.character_end) order by f.ordinal) from official_news_facts f where f.version_id=v.id) excerpts,
 coalesce((select jsonb_agg(a) from jsonb_array_elements(n.actions) a where trusted_source_url(a->>'url',s.id)),'[]') actions
 from official_news_editions n join document_versions v on v.id=n.version_id
 join documents d on d.current_version_id=v.id
 join sources s on s.id=d.source_id join source_endpoints e on e.id=d.source_endpoint_id
 where d.status='active' and s.status='active' and e.status='active'
 and trusted_source_url(d.canonical_url,s.id) and (v.published_at is null or v.published_at<=now())
 and exists(select 1 from official_news_facts f where f.version_id=v.id)
`;
export async function listNews(
  client: DatabaseClient,
  limit = 24,
  source?: string,
) {
  const rows = await client.query(
    selection +
      ` and ($2::text is null or s.slug=$2)
    order by v.published_at desc nulls last,d.first_seen_at desc,d.id limit $1`,
    [Math.min(200, Math.max(1, limit)), source ?? null],
  );
  return rows.map((row) => articleSchema.parse(row));
}
export async function getNews(client: DatabaseClient, id: string) {
  if (!z.string().uuid().safeParse(id).success) return null;
  const rows = await client.query(selection + ' and d.id=$1::uuid', [id]);
  if (!rows[0]) return null;
  const article = articleSchema.parse(rows[0]);
  const history = await client.query<{
    version_id: string;
    at: string;
    title: string;
  }>(
    'select v.id version_id,n.created_at at,v.title from official_news_editions n join document_versions v on v.id=n.version_id where v.document_id=$1::uuid order by n.created_at desc limit 20',
    [id],
  );
  return { ...article, history };
}
