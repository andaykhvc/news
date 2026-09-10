import {
  answerSnapshotSchema,
  factHistory,
  type AnswerSnapshot,
} from '@sak/answers';
import type { DatabaseClient } from './client';

export interface OfficialAnnouncement {
  id: string;
  title: string;
  canonicalUrl: string;
  sourceName: string;
  publishedAt: string | null;
  lastSeenAt: string;
}

/**
 * These are source documents, not extracted facts. Keeping the official title
 * and direct URL intact lets the homepage be useful as soon as a crawl succeeds
 * without turning an unreviewed document into a factual claim.
 */
export async function listRecentOfficialAnnouncements(
  client: DatabaseClient,
  limit = 12,
): Promise<OfficialAnnouncement[]> {
  return client
    .query<{
      id: string;
      title: string;
      canonical_url: string;
      source_name: string;
      published_at: string | null;
      latest_seen_at: string;
    }>(
      `select d.id,d.title,d.canonical_url,s.name source_name,d.published_at,d.latest_seen_at
     from documents d
     join sources s on s.id=d.source_id
     where d.status='active' and s.status='active' and d.current_version_id is not null
     order by coalesce(d.published_at,d.latest_seen_at) desc,d.latest_seen_at desc
     limit $1`,
      [Math.min(Math.max(Math.trunc(limit), 1), 24)],
    )
    .then((rows) =>
      rows.map((row) => ({
        id: row.id,
        title: row.title,
        canonicalUrl: row.canonical_url,
        sourceName: row.source_name,
        publishedAt: row.published_at,
        lastSeenAt: row.latest_seen_at,
      })),
    );
}

export async function loadAnswerSnapshot(
  client: DatabaseClient,
  entities: string[],
  year: number,
): Promise<AnswerSnapshot> {
  const rows = await client.query<{ data: unknown }>(
    'select product_snapshot($1::text[],$2::text) data',
    [entities, String(year)],
  );
  const snapshot = answerSnapshotSchema.parse(rows[0]?.data);
  const history = new Map<string, AnswerSnapshot['history'][number]>();
  for (const entry of [
    ...snapshot.facts.flatMap(factHistory),
    ...snapshot.history,
  ]) {
    const action = entry.action === 'publish' ? 'published' : entry.action;
    history.set(`${entry.fact_id}:${Date.parse(entry.at)}:${action}`, {
      ...entry,
      action,
    });
  }
  snapshot.history = [...history.values()];
  return snapshot;
}
