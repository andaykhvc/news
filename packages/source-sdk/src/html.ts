import { load, type CheerioAPI } from 'cheerio';
import type { TextStructure, Coverage } from '@sak/domain';
import type {
  FetchedDocument,
  ParsedDocument,
  SourceAdapter,
  AdapterResult,
  DiscoveredDocument,
} from './contracts';
export interface HtmlProfile {
  sourceKey: string;
  title: string;
  body: string;
  listing: string;
  next: string;
  documentPattern: RegExp;
  scope: Coverage['scope'];
  publication?: string;
  attachmentPattern?: RegExp;
}
const clean = (s: string) => s.replace(/\s+/gu, ' ').trim();
export function parseStructuredHtml(
  doc: FetchedDocument,
  profile: HtmlProfile,
): ParsedDocument {
  const $ = load(doc.body);
  const title = clean($(profile.title).first().text());
  const root = $(profile.body).first();
  if (!title || root.length !== 1)
    throw new Error('parser_drift: required title/body missing');
  root
    .find(
      'script,style,noscript,iframe,form,nav,aside,[hidden],[aria-hidden="true"]',
    )
    .remove();
  const structure: TextStructure = {
    parser: `html-${profile.sourceKey}-v1`,
    blocks: [],
    warnings: [],
    publication_date: null,
  };
  let raw = '';
  let heading: string | null = title;
  // Walk nested blocks; table rows and list items remain indivisible evidence units.
  function visit(node: Parameters<CheerioAPI>[0], selector: string) {
    const el = $(node);
    const tag = el.prop('tagName')?.toLowerCase();
    const block = tag && /^(h[1-6]|p|li|tr|div)$/.test(tag);
    const nested =
      el.children('h1,h2,h3,h4,h5,h6,p,div,ul,ol,table,section').length > 0;
    if ((block && !nested) || tag === 'tr' || tag === 'li') {
      const text =
        tag === 'tr'
          ? el
              .children('th,td')
              .map((_, c) => clean($(c).text()))
              .get()
              .join(' | ')
          : clean(el.text());
      if (!text) return;
      if (tag?.startsWith('h')) heading = text;
      const start = raw.length;
      raw += text + '\n';
      structure.blocks.push({
        kind:
          tag === 'tr'
            ? 'table_row'
            : tag === 'li'
              ? 'list_item'
              : tag?.startsWith('h')
                ? 'heading'
                : 'paragraph',
        start,
        end: raw.length - 1,
        selector,
        heading,
        page: null,
      });
      if (tag === 'tr' && el.find('[rowspan],[colspan]').length)
        structure.warnings.push('complex_table_requires_review');
    } else {
      let inline = '';
      const flush = () => {
        const text = clean(inline);
        inline = '';
        if (!text) return;
        const start = raw.length;
        raw += text + '\n';
        structure.blocks.push({
          kind: 'paragraph',
          start,
          end: raw.length - 1,
          selector,
          heading,
          page: null,
        });
      };
      el.contents().each((_, c) => {
        if (c.type === 'text') {
          inline += $(c).text();
        } else if (c.type === 'tag') {
          if (/^(span|a|strong|em|b|i|br)$/.test(c.name)) {
            inline += $(c).text() + ' ';
          } else {
            flush();
            visit(
              c,
              `${selector} > ${c.name}:nth-child(${el.children().index(c) + 1})`,
            );
          }
        }
      });
      flush();
    }
  }
  visit(root, profile.body);
  if (raw.trim().length < 40 || !structure.blocks.length)
    throw new Error('parser_drift: body unexpectedly empty');
  const pub =
    $('meta[property="article:published_time"]').attr('content') ?? null;
  let published =
    pub &&
    /^\d{4}-\d\d-\d\dT.*(?:Z|[+-]\d\d:\d\d)$/.test(pub) &&
    Number.isFinite(Date.parse(pub))
      ? new Date(pub).toISOString()
      : null;
  if (profile.publication)
    structure.publication_date =
      clean($(profile.publication).first().text()) || null;
  // Read the institution's explicit publication date, never infer it from the crawl clock.
  if (!published) {
    const dateText =
      profile.sourceKey === 'osym'
        ? raw.match(/^DUYURU\s*\(([^)]+)\)/u)?.[1]
        : structure.publication_date;
    const dated = dateText?.match(
      /^(\d{1,2}) (Ocak|Şubat|Mart|Nisan|Mayıs|Haziran|Temmuz|Ağustos|Eylül|Ekim|Kasım|Aralık) (\d{4})(?: (\d{2}:\d{2}))?$/u,
    );
    if (dated) {
      const month =
        [
          'Ocak',
          'Şubat',
          'Mart',
          'Nisan',
          'Mayıs',
          'Haziran',
          'Temmuz',
          'Ağustos',
          'Eylül',
          'Ekim',
          'Kasım',
          'Aralık',
        ].indexOf(dated[2]!) + 1;
      const day =
        dated[3] +
        '-' +
        String(month).padStart(2, '0') +
        '-' +
        dated[1]!.padStart(2, '0');
      const instant = new Date(day + 'T' + (dated[4] ?? '00:00') + ':00+03:00');
      if (
        Number.isFinite(instant.valueOf()) &&
        new Date(day + 'T12:00:00Z').toISOString().startsWith(day)
      ) {
        published = instant.toISOString();
        structure.publication_date = dated[0];
      }
    }
  }
  const officialLinks = root
    .find('a[href]')
    .toArray()
    .flatMap((a) => {
      try {
        const url = new URL($(a).attr('href')!, doc.final_url);
        if (url.protocol !== 'https:' || url.username || url.password)
          return [];
        return [{ url: url.href, text: clean($(a).text()) }];
      } catch {
        return [];
      }
    });
  const canonical = $('link[rel="canonical"]').attr('href');
  const attachments = root
    .find('a[href]')
    .toArray()
    .flatMap((a) => {
      const href = $(a).attr('href');
      if (!href) return [];
      let url;
      try {
        url = new URL(href, doc.final_url);
      } catch {
        return [];
      }
      if (
        !/^https?:$/.test(url.protocol) ||
        !(
          /\.pdf(?:$|[?#])/i.test(url.href) ||
          profile.attachmentPattern?.test(url.href)
        )
      )
        return [];
      return [
        {
          url: url.href,
          mime_type: /\.pdf(?:$|[?#])/i.test(url.href)
            ? 'application/pdf'
            : null,
          filename: url.pathname.split('/').pop() ?? null,
        },
      ];
    });
  return {
    canonical_url: canonical
      ? new URL(canonical, doc.final_url).href
      : doc.final_url,
    title,
    document_type: 'announcement',
    raw_text: raw.trimEnd(),
    published_at: published,
    attachments,
    metadata: {
      structure,
      parser_profile: profile.sourceKey,
      official_links: officialLinks,
    },
  };
}
export interface ListingPage {
  documents: DiscoveredDocument[];
  next: string | null;
}
export function parseHtmlListing(
  doc: FetchedDocument,
  profile: HtmlProfile,
): ListingPage {
  const $ = load(doc.body);
  const urls = new Set<string>();
  $(profile.listing).each((_, a) => {
    const href = $(a).attr('href');
    if (!href) return;
    try {
      const u = new URL(href, doc.final_url);
      if (profile.documentPattern.test(u.pathname)) urls.add(u.href);
    } catch {
      /* malformed source link is not a document */
    }
  });
  if (!urls.size)
    throw new Error('parser_drift: no documents matched registered listing');
  const href = profile.next ? $(profile.next).first().attr('href') : null;
  return {
    documents: [...urls].map((url) => ({ url, external_identifier: null })),
    next: href ? new URL(href, doc.final_url).href : null,
  };
}
export function createHtmlAdapter(
  profile: HtmlProfile,
  options: {
    maxPages?: number;
    maxDocuments?: number;
    onCoverage?: (coverage: Coverage) => void;
  } = {},
): SourceAdapter {
  const fail = <T>(e: unknown): AdapterResult<T> => ({
    ok: false,
    error: {
      type: 'parse_failed',
      message: e instanceof Error ? e.message : 'Parser failed',
      retryable: false,
    },
  });
  let lastCoverage: Coverage | null = null;
  return {
    sourceKey: profile.sourceKey,
    getCoverage: () => lastCoverage,
    async discover(ctx) {
      const pages: string[] = [];
      const docs = new Map<string, DiscoveredDocument>();
      const reasons: string[] = [];
      let next: string | null = ctx.endpoint.base_url;
      try {
        while (
          next &&
          pages.length < (options.maxPages ?? 3) &&
          docs.size < (options.maxDocuments ?? 50)
        ) {
          ctx.signal.throwIfAborted();
          if (pages.includes(next)) {
            reasons.push('pagination_loop');
            break;
          }
          const response = await ctx.http.get(next, ctx.signal);
          if (!response.ok) {
            reasons.push(response.error.message);
            break;
          }
          pages.push(next);
          const parsed = parseHtmlListing(response.value, profile);
          for (const d of parsed.documents) {
            if (docs.size >= (options.maxDocuments ?? 50)) {
              reasons.push('document_limit');
              break;
            }
            docs.set(d.url, d);
          }
          next = parsed.next;
        }
      } catch (e) {
        reasons.push(e instanceof Error ? e.message : 'discovery_failed');
      }
      if (next) reasons.push('bounded_or_incomplete_discovery');
      lastCoverage = {
        checked_at: new Date().toISOString(),
        pages,
        discovered: docs.size,
        scope: profile.scope,
        complete:
          !next && !reasons.length && profile.scope === 'paginated_archive',
        reasons,
      };
      options.onCoverage?.(lastCoverage);
      if (!docs.size)
        return fail(new Error(reasons.join('; ') || 'empty_discovery'));
      return { ok: true, value: [...docs.values()] };
    },
    fetch: (doc, ctx) => ctx.http.get(doc.url, ctx.signal),
    async parse(doc) {
      try {
        return { ok: true, value: parseStructuredHtml(doc, profile) };
      } catch (e) {
        return fail(e);
      }
    },
  };
}
