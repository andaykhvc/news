import 'server-only';
import { cache } from 'react';
import { combineNews } from './news-feed';
import type { NewsFilter } from './news-categories';
import {
  createDatabaseClient,
  databaseEnvironmentSchema,
  listRecentOfficialAnnouncements,
  loadAnswerSnapshot,
} from '@sak/database';
import {
  answerResources,
  emptySnapshot,
  resolveAnswer,
  type AnswerResource,
} from '@sak/answers';
export function database() {
  if (!process.env['DATABASE_URL']) return null;
  const parsed = databaseEnvironmentSchema.safeParse(process.env);
  return parsed.success ? createDatabaseClient(parsed.data) : null;
}
export function siteUrl() {
  const value = process.env['PUBLIC_SITE_URL'];
  if (!value) {
    const domain = process.env['VERCEL_PROJECT_PRODUCTION_URL'];
    return domain
      ? new URL('https://' + domain).origin
      : 'http://localhost:3000';
  }
  const url = new URL(value);
  if (
    url.username ||
    url.password ||
    !['https:', 'http:'].includes(url.protocol)
  )
    throw new Error('Invalid PUBLIC_SITE_URL');
  return url.origin;
}
// Request-scoped memoization only: a revocation or conflict must be visible on the next request.
export const snapshotForGroup = cache(async (group: string, year: number) => {
  const client = database();
  if (!client) return { snapshot: emptySnapshot(), available: false };
  try {
    return {
      snapshot: await loadAnswerSnapshot(
        client,
        [
          ...new Set(
            answerResources
              .filter((r) => group === '*' || r.group === group)
              .map((r) => r.entity),
          ),
        ],
        year,
      ),
      available: true,
    };
  } catch {
    console.error('answer_snapshot_unavailable');
    return { snapshot: emptySnapshot(), available: false };
  }
});
export const snapshotForYear = (year: number) => snapshotForGroup('*', year);
export const recentOfficialAnnouncements = cache(async () => {
  const client = database();
  if (!client) return [];
  try {
    return await listRecentOfficialAnnouncements(client);
  } catch {
    console.error('official_announcements_unavailable');
    return [];
  }
});
export const answerFor = cache(
  async (resource: AnswerResource, year: number) => {
    const result = await snapshotForGroup(resource.group, year);
    return resolveAnswer(
      resource,
      year,
      result.snapshot,
      new Date().toISOString(),
      result.available,
    );
  },
);

export const officialNewsFeed = cache(async (limit = 24, source?: string) => {
  const client = database();
  if (!client) return [];
  try {
    const { listNews } = await import('@sak/database');
    return await listNews(client, limit, source);
  } catch {
    console.error('news_feed_unavailable');
    return [];
  }
});
export const newsArticle = cache(async (id: string) => {
  const client = database();
  if (!client) return null;
  try {
    const { getNews } = await import('@sak/database');
    return await getNews(client, id);
  } catch {
    console.error('news_article_unavailable');
    return null;
  }
});

export const eventArticle = cache(async (id: string) => {
  const client = database();
  if (!client) return null;
  try {
    const { getPublicEvent } = await import('@sak/database');
    return await getPublicEvent(client, id);
  } catch {
    console.error('event_article_unavailable');
    return null;
  }
});
export const newsFeed = cache(
  async (limit = 24, source?: string, category?: NewsFilter) => {
    const client = database();
    if (!client) return [];
    const { listPublicEvents } = await import('@sak/database');
    const readLimit = category ? 200 : limit;
    const results = await Promise.allSettled([
      officialNewsFeed(readLimit, source),
      listPublicEvents(client, readLimit, source),
    ]);
    if (results[1].status === 'rejected')
      console.error('event_feed_unavailable');
    return combineNews(
      results[0].status === 'fulfilled' ? results[0].value : [],
      results[1].status === 'fulfilled' ? results[1].value : [],
      { limit, category },
    );
  },
);
