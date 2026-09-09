import type { MetadataRoute } from 'next';
import {
  answerResources,
  canonicalPath,
  currentTurkishYear,
  resolveAnswer,
} from '@sak/answers';
import { snapshotForYear, siteUrl } from '../lib/product';
export const dynamic = 'force-dynamic';
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  if (!process.env['PUBLIC_SITE_URL']) return [];
  const year = currentTurkishYear(),
    { snapshot, available } = await snapshotForYear(year),
    now = new Date().toISOString();
  return [
    { url: siteUrl() },
    { url: siteUrl() + '/nasil-calisir' },
    ...answerResources
      .map((r) => resolveAnswer(r, year, snapshot, now, available))
      .filter((a) => a.factId && !a.stale)
      .map((a) => ({
        url: siteUrl() + canonicalPath(a.resource, year),
        ...(a.verifiedAt ? { lastModified: a.verifiedAt } : {}),
      })),
  ];
}
