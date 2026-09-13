import type { NewsArticle, PublicNewsEvent } from '@sak/database';
export type FeedItem = {
  id: string;
  href: string;
  title: string;
  source: string;
  excerpt: string;
  publishedAt: string | null;
  checkedAt: string | null;
  updatedAt: string;
  stale: boolean;
  kind: 'event' | 'official';
  conflicts: boolean;
};
export function combineNews(
  official: NewsArticle[],
  events: PublicNewsEvent[],
  limit = 24,
): FeedItem[] {
  const items: FeedItem[] = [
    ...official.map((n) => ({
      id: n.id,
      href: '/haber/' + n.id,
      title: n.title,
      source: n.source_name,
      excerpt: n.excerpts[0]?.quote ?? '',
      publishedAt: n.published_at,
      checkedAt: n.latest_seen_at,
      updatedAt: n.verified_at,
      stale: n.stale,
      kind: 'official' as const,
      conflicts: false,
    })),
    ...events.map((e) => ({
      id: e.id,
      href: '/olay/' + e.id,
      title: e.title,
      source: [...new Set(e.sources.map((s) => s.name))].join(' · '),
      excerpt: e.sources[0]?.excerpt ?? '',
      publishedAt: e.publishedAt,
      checkedAt: e.checkedAt,
      updatedAt: e.updatedAt,
      stale: e.stale,
      kind: 'event' as const,
      conflicts: e.conflicts,
    })),
  ];
  return items
    .sort(
      (a, b) =>
        (Date.parse(b.publishedAt ?? '') || 0) -
          (Date.parse(a.publishedAt ?? '') || 0) || a.id.localeCompare(b.id),
    )
    .slice(0, limit);
}
