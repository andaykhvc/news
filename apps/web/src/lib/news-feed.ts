import type { NewsArticle, PublicNewsEvent } from '@sak/database';
import {
  eventCategory,
  inferNewsCategory,
  isBreakingNews,
  type NewsFilter,
  type NewsTopicCategory,
} from './news-categories';
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
  category: NewsTopicCategory;
  conflicts: boolean;
};
export function combineNews(
  official: NewsArticle[],
  events: PublicNewsEvent[],
  options:
    | number
    | {
        limit?: number;
        category?: NewsFilter | undefined;
        now?: string;
      } = 24,
): FeedItem[] {
  const {
    limit = 24,
    category,
    now = new Date().toISOString(),
  } = typeof options === 'number' ? { limit: options } : options;
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
      category: inferNewsCategory({
        title: n.title,
        excerpt: n.excerpts[0]?.quote ?? '',
        sourceSlug: n.source_slug,
      }),
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
      category: eventCategory(e),
      conflicts: e.conflicts,
    })),
  ];
  return items
    .filter((item) =>
      category === 'son-dakika'
        ? isBreakingNews(item.publishedAt, now)
        : !category || item.category === category,
    )
    .sort(
      (a, b) =>
        (Date.parse(b.publishedAt ?? '') || 0) -
          (Date.parse(a.publishedAt ?? '') || 0) || a.id.localeCompare(b.id),
    )
    .slice(0, limit);
}
