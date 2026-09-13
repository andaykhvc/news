import { discover, parseReport } from './discovery';
import { allowedUrl, type CachedResponse } from './network';
import type { NewsReport, NewsSource } from './model';
export type CrawlStats = {
  discovered: number;
  fetched: number;
  unchanged: number;
  parsed: number;
  failed: number;
  publicationMissing: number;
  publicationParseFailures: number;
  discoverySuccesses: number;
  discoveryFailures: number;
  bounded: boolean;
  errors: { url: string; reason: string }[];
};
export async function crawlSource(
  source: NewsSource,
  fetcher: (url: string) => Promise<CachedResponse & { notModified: boolean }>,
  options: {
    urls?: string[];
    from?: string;
    to?: string;
    onReport: (report: NewsReport) => Promise<void>;
    onCandidate?: (url: string, from: string, reason: string) => Promise<void>;
    signal: AbortSignal;
  },
) {
  const stats: CrawlStats = {
    discovered: 0,
    fetched: 0,
    unchanged: 0,
    parsed: 0,
    failed: 0,
    publicationMissing: 0,
    publicationParseFailures: 0,
    discoverySuccesses: 0,
    discoveryFailures: 0,
    bounded: false,
    errors: [],
  };
  const articles = new Map<string, string | null>();
  const visited = new Set<string>();
  const queue = [...source.discovery];
  if (options.urls) {
    for (const url of options.urls) articles.set(allowedUrl(url, source), null);
    queue.length = 0;
  }
  while (queue.length && visited.size < source.maxPages) {
    options.signal.throwIfAborted();
    const endpoint = queue.shift()!;
    if (visited.has(endpoint.url)) continue;
    visited.add(endpoint.url);
    try {
      const response = await fetcher(endpoint.url);
      const result = discover(
        response.body,
        response.url,
        endpoint.kind,
        source,
        endpoint.selector,
      );
      stats.discoverySuccesses++;
      for (const item of result.items) {
        if (articles.size >= source.maxReports) {
          stats.bounded = true;
          break;
        }
        articles.set(item.url, item.publishedAt);
      }
      for (const url of result.pages)
        if (!visited.has(url)) queue.push({ ...endpoint, url });
      for (const candidate of result.candidates)
        await options.onCandidate?.(
          candidate.url,
          response.url,
          candidate.reason,
        );
    } catch (error) {
      stats.discoveryFailures++;
      stats.errors.push({
        url: endpoint.url,
        reason: error instanceof Error ? error.message : 'discovery_failed',
      });
    }
  }
  if (queue.length || articles.size > source.maxReports) stats.bounded = true;
  stats.discovered = articles.size;
  for (const [url, published] of [...articles].slice(0, source.maxReports)) {
    options.signal.throwIfAborted();
    try {
      const response = await fetcher(url);
      stats.fetched++;
      if (response.notModified) stats.unchanged++;
      const report = parseReport(
        response.body,
        response.url,
        source,
        response.checkedAt,
        published,
      );
      if (!report.publishedAt) stats.publicationMissing++;
      if (report.metadata['publicationParseFailed'])
        stats.publicationParseFailures++;
      if (
        report.publishedAt &&
        ((options.from &&
          Date.parse(report.publishedAt) < Date.parse(options.from)) ||
          (options.to &&
            Date.parse(report.publishedAt) > Date.parse(options.to)))
      )
        continue;
      for (const candidate of report.metadata['candidateFeeds'] as string[])
        await options.onCandidate?.(candidate, response.url, 'advertised_feed');
      await options.onReport(report);
      stats.parsed++;
    } catch (error) {
      stats.failed++;
      stats.errors.push({
        url,
        reason: error instanceof Error ? error.message : 'report_failed',
      });
    }
  }
  return stats;
}
