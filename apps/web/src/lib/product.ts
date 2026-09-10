import 'server-only';
import { cache } from 'react';
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
  if (!value) return 'http://localhost:3000';
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
