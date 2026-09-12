import type { MetadataRoute } from 'next';
import {
  answerResources,
  canonicalPath,
  currentTurkishYear,
  resolveAnswer,
} from '@sak/answers';
import { snapshotForYear, siteUrl, newsFeed } from '../lib/product';
export const dynamic = 'force-dynamic';
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  if (
    !process.env['PUBLIC_SITE_URL'] &&
    !process.env['VERCEL_PROJECT_PRODUCTION_URL']
  )
    return [];
  const year = currentTurkishYear(),
    { snapshot, available } = await snapshotForYear(year),
    now = new Date().toISOString();
  return [
    { url: siteUrl() },
    { url: siteUrl() + '/nasil-calisir' },
    { url: siteUrl() + '/haberler' },
    ...(await newsFeed(200))
      .filter((n) => !n.stale)
      .map((n) => ({
        url: siteUrl() + '/haber/' + n.id,
        lastModified: n.verified_at,
      })),
    ...answerResources
      .map((r) => resolveAnswer(r, year, snapshot, now, available))
      .filter((a) => a.factId && !a.stale)
      .map((a) => ({
        url: siteUrl() + canonicalPath(a.resource, year),
        ...(a.verifiedAt ? { lastModified: a.verifiedAt } : {}),
      })),
  ];
}
