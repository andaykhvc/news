import { load } from 'cheerio';
import { allowedUrl } from './network';
import { hash, reportSchema, type NewsSource, type NewsReport } from './model';
import { parseNewsDate } from './turkish';
export type DiscoveryItem = { url: string; publishedAt: string | null };
export function discover(
  body: string,
  url: string,
  kind: NewsSource['discovery'][number]['kind'],
  source: NewsSource,
  selector?: string,
) {
  const $ = load(body, { xml: kind !== 'index' });
  const items: DiscoveryItem[] = [];
  const pages: string[] = [];
  const candidates: { url: string; reason: string }[] = [];
  const add = (raw: string | undefined, date: string | null = null) => {
    if (!raw) return;
    try {
      items.push({
        url: allowedUrl(raw.trim(), source, url),
        publishedAt: date,
      });
    } catch {
      /* unrelated domains are not silently activated */
    }
  };
  if (kind === 'rss' || kind === 'atom')
    $('item, entry').each((_, el) => {
      const item = $(el);
      const link = item
        .find('link')
        .filter((_, a) => !$(a).attr('rel') || $(a).attr('rel') === 'alternate')
        .first();
      add(
        link.attr('href') ?? link.text(),
        parseNewsDate(item.find('pubDate, published').first().text()),
      );
    });
  else if (kind === 'sitemap' || kind === 'news_sitemap') {
    $('sitemap > loc').each((_, e) => {
      try {
        pages.push(allowedUrl($(e).text().trim(), source, url));
      } catch {
        /* restricted sitemap */
      }
    });
    $('url').each((_, el) => {
      const item = $(el);
      add(
        item.children('loc').text(),
        parseNewsDate(item.find('news\\:publication_date').first().text()),
      );
    }); // lastmod is not publication.
  } else {
    $(selector ?? 'article a[href]').each((_, e) => add($(e).attr('href')));
    $('a[rel="next"]').each((_, e) => {
      try {
        pages.push(allowedUrl($(e).attr('href')!, source, url));
      } catch {
        /* invalid next */
      }
    });
    $('link[rel="alternate"]').each((_, e) => {
      if (/rss|atom/.test($(e).attr('type') ?? '')) {
        try {
          candidates.push({
            url: new URL($(e).attr('href')!, url).href,
            reason: 'advertised_feed',
          });
        } catch {
          /* malformed */
        }
      }
    });
  }
  if (!items.length && !pages.length) throw new Error('discovery_parser_drift');
  return {
    items: [...new Map(items.map((i) => [i.url, i])).values()],
    pages,
    candidates,
  };
}
export function parseReport(
  body: string,
  url: string,
  source: NewsSource,
  discoveredAt: string,
  feedDate: string | null = null,
): NewsReport {
  const $ = load(body);
  // Do not extract full text from structured data hidden behind a paywall.
  if (
    /"isAccessibleForFree"\s*:\s*(?:false|"false")/i.test(body) ||
    $('[data-paywall],.paywall,.g-recaptcha').length
  )
    throw new Error('source_access_control');
  const title = $(source.titleSelector)
    .first()
    .text()
    .replace(/\s+/g, ' ')
    .trim();
  const root = $(source.articleSelector).first();
  root
    .find(
      'script,style,noscript,iframe,form,nav,aside,[hidden],[aria-hidden="true"]',
    )
    .remove();
  const paragraphs = root
    .find('p')
    .map((_, e) => $(e).text().replace(/\s+/g, ' ').trim())
    .get()
    .filter(Boolean);
  const text = paragraphs.length
    ? paragraphs.join('\n')
    : root.text().replace(/\s+/g, ' ').trim();
  if (!title || !root.length || text.length < 40)
    throw new Error('article_parser_drift');
  if (text.length > source.maxTextChars) throw new Error('article_text_limit');
  const canonical = allowedUrl(
    $('link[rel="canonical"]').attr('href') ?? url,
    source,
    url,
  );
  const dateText =
    $('meta[property="article:published_time"]').attr('content') ??
    root.find('time[datetime]').first().attr('datetime') ??
    (source.publicationSelector
      ? $(source.publicationSelector).first().text()
      : null);
  const publishedAt = parseNewsDate(dateText) ?? feedDate;
  const modifiedAt = parseNewsDate(
    $('meta[property="article:modified_time"]').attr('content') ?? null,
  );
  const contentHash = hash([title, text, publishedAt, modifiedAt]);
  const key = hash([source.id, canonical]);
  return reportSchema.parse({
    id: hash([key, contentHash]),
    key,
    sourceId: source.id,
    sourceFamily: source.family,
    sourceReliability: source.reliability,
    canonicalUrl: canonical,
    title,
    text,
    contentHash,
    publishedAt,
    modifiedAt,
    discoveredAt,
    officialVersionId: null,
    metadata: {
      candidateFeeds: $('link[rel="alternate"]')
        .toArray()
        .filter((e) => /rss|atom/.test($(e).attr('type') ?? ''))
        .flatMap((e) => {
          try {
            return [new URL($(e).attr('href')!, url).href];
          } catch {
            return [];
          }
        }),
      publicationInput: dateText,
      publicationOrigin: parseNewsDate(dateText)
        ? 'article'
        : feedDate
          ? 'feed'
          : 'unknown',
      publicationParseFailed: !!dateText && !parseNewsDate(dateText),
    },
  });
}
