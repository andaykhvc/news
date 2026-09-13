import type { DatabaseClient } from '@sak/database';
import type { createIntelligenceRepository } from '@sak/database';
import {
  hash,
  sourceSchema,
  reportSchema,
  type NewsReport,
} from '@sak/news-intelligence';
/** Read existing archived, registered official versions. This bridge never writes facts or answers. */
export async function bridgeOfficialDocuments(
  db: DatabaseClient,
  repo: ReturnType<typeof createIntelligenceRepository>,
  write: boolean,
  handle: (report: NewsReport) => Promise<void>,
) {
  const versions = await db.query<{
    id: string;
    slug: string;
    canonical_url: string;
    title: string;
    raw_text: string;
    published_at: string | null;
    latest_seen_at: string;
  }>(`select v.id,s.slug,d.canonical_url,v.title,v.raw_text,v.published_at,d.latest_seen_at from documents d join document_versions v on v.id=d.current_version_id join sources s on s.id=d.source_id
 where d.status='active' and s.status='active' and length(v.raw_text) between 40 and 100000 and trusted_source_url(d.canonical_url,d.source_id)
 and exists(select 1 from source_responses r where r.document_version_id=v.id and r.status='parsed')
 and not exists(select 1 from intelligence_reports i join intelligence_event_reports m on m.report_id=i.id and m.namespace='live' where i.official_version_id=v.id)
 order by d.latest_seen_at desc limit 100`);
  for (const v of versions) {
    // Separate host-qualified identities retain a fixed URL policy even for multi-host institutions.
    const host = new URL(v.canonical_url).hostname;
    const source = sourceSchema.parse({
      id: 'official-' + v.slug + '-' + hash(host).slice(0, 8),
      name: v.slug,
      status: 'active',
      hosts: [host],
      family: 'official-' + v.slug,
      reliability: 1,
      discovery: [],
    });
    try {
      if (write) await repo.register(source);
      const key = hash([source.id, v.canonical_url]),
        contentHash = hash([v.id]);
      await handle(
        reportSchema.parse({
          id: hash([key, contentHash]),
          key,
          sourceId: source.id,
          sourceFamily: source.family,
          sourceReliability: 1,
          canonicalUrl: v.canonical_url,
          title: v.title,
          text: v.raw_text,
          contentHash,
          publishedAt: v.published_at,
          modifiedAt: null,
          discoveredAt: v.latest_seen_at,
          officialVersionId: v.id,
          metadata: { bridge: 'existing_official_document' },
        }),
      );
    } catch (error) {
      process.exitCode = 1;
      console.error(
        JSON.stringify({
          event: 'intelligence_bridge_failed',
          versionId: v.id,
          reason: error instanceof Error ? error.message : 'bridge_failed',
        }),
      );
    }
  }
}
