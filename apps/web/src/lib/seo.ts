import type { Metadata } from 'next';
import type { NewsArticle } from '@sak/database';
import { siteUrl } from './site-url';

export const PUBLICATION_NAME = 'Şak Haber';
export const PUBLICATION_LANGUAGE = 'tr';
export const SITE_DESCRIPTION =
  'Sınav, üniversite, okul ve KYK sorularına doğrulanmış bilgiler ve açık resmî kaynaklarla cevap.';

export type PublicArticle = Pick<
  NewsArticle,
  | 'id'
  | 'title'
  | 'canonical_url'
  | 'source_name'
  | 'published_at'
  | 'stale'
  | 'excerpts'
  | 'actions'
>;

export function publicArticlePath(id: string) {
  return `/haber/${encodeURIComponent(id)}`;
}

export function publicArticleUrl(id: string) {
  return new URL(publicArticlePath(id), siteUrl()).toString();
}

export function markdownArticleUrl(id: string) {
  return `${publicArticleUrl(id)}.md`;
}

export function llmsTxtUrl() {
  return `${siteUrl()}/llms.txt`;
}

export function publicSiteConfigured() {
  return Boolean(
    process.env['PUBLIC_SITE_URL'] ||
    process.env['VERCEL_PROJECT_PRODUCTION_URL'],
  );
}

function normalizeText(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

export function truncateText(value: string, maximum = 180) {
  const text = normalizeText(value);
  if (text.length <= maximum) return text;
  return `${text.slice(0, maximum - 1).trimEnd()}…`;
}

export function articleBody(article: Pick<NewsArticle, 'excerpts'>) {
  return article.excerpts
    .map((excerpt) => normalizeText(excerpt.quote))
    .join('\n\n');
}

export function articleDescription(article: Pick<NewsArticle, 'excerpts'>) {
  return (
    truncateText(article.excerpts.map((excerpt) => excerpt.quote).join(' ')) ||
    SITE_DESCRIPTION
  );
}

export function publisherEntity() {
  return {
    '@type': 'Organization',
    '@id': `${siteUrl()}#organization`,
    name: PUBLICATION_NAME,
    url: siteUrl(),
  };
}

export function siteStructuredData() {
  const origin = siteUrl();
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': `${origin}#organization`,
        name: PUBLICATION_NAME,
        url: origin,
        description: SITE_DESCRIPTION,
      },
      {
        '@type': 'WebSite',
        '@id': `${origin}#website`,
        url: origin,
        name: PUBLICATION_NAME,
        description: SITE_DESCRIPTION,
        inLanguage: 'tr-TR',
        publisher: { '@id': `${origin}#organization` },
      },
    ],
  };
}

export function articleStructuredData(article: PublicArticle) {
  const url = publicArticleUrl(article.id);
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'NewsArticle',
        '@id': `${url}#article`,
        headline: article.title,
        description: articleDescription(article),
        url,
        mainEntityOfPage: { '@type': 'WebPage', '@id': url },
        publisher: publisherEntity(),
        inLanguage: 'tr-TR',
        articleBody: articleBody(article),
        citation: article.canonical_url,
        ...(article.published_at
          ? { datePublished: article.published_at }
          : {}),
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          {
            '@type': 'ListItem',
            position: 1,
            name: 'Ana sayfa',
            item: siteUrl(),
          },
          {
            '@type': 'ListItem',
            position: 2,
            name: 'Haberler',
            item: `${siteUrl()}/haberler`,
          },
          {
            '@type': 'ListItem',
            position: 3,
            name: article.title,
          },
        ],
      },
    ],
  };
}

export function articleMetadata(article: PublicArticle): Metadata {
  const url = publicArticleUrl(article.id);
  const description = articleDescription(article);
  return {
    title: article.title,
    description,
    alternates: {
      canonical: url,
      types: { 'text/markdown': markdownArticleUrl(article.id) },
    },
    robots: {
      index: publicSiteConfigured() && !article.stale,
      follow: true,
      'max-image-preview': 'large',
    },
    openGraph: {
      type: 'article',
      locale: 'tr_TR',
      siteName: PUBLICATION_NAME,
      title: article.title,
      description,
      url,
      ...(article.published_at ? { publishedTime: article.published_at } : {}),
    },
    twitter: {
      card: 'summary',
      title: article.title,
      description,
    },
  };
}

export function serializeJsonLd(value: unknown) {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

function escapeXml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function escapeMarkdownText(value: string) {
  return normalizeText(value)
    .replaceAll('\\', '\\\\')
    .replace(/[\\`*_{}[\]#+\-.!|>&<]/g, '\\$&');
}

function markdownDestination(value: string) {
  return value.replaceAll('\\', '%5C').replaceAll('>', '%3E');
}

function sourceLinks(article: PublicArticle) {
  const links = [
    { label: 'Orijinal resmî duyuru', url: article.canonical_url },
    ...article.actions.map((action) => ({
      label: action.label,
      url: action.url,
    })),
  ];
  return links.filter(
    (link, index) =>
      links.findIndex((candidate) => candidate.url === link.url) === index,
  );
}

export function renderArticleMarkdown(article: PublicArticle) {
  const url = publicArticleUrl(article.id);
  const lines = [
    `# ${escapeMarkdownText(article.title)}`,
    '',
    `> ${escapeMarkdownText(articleDescription(article))}`,
    '',
    `- Publication: ${escapeMarkdownText(PUBLICATION_NAME)}`,
    `- Original source: ${escapeMarkdownText(article.source_name)}`,
    ...(article.published_at
      ? [`- Original publication date: ${article.published_at}`]
      : []),
    `- Canonical URL: ${url}`,
    '',
    '## Article body',
    '',
    ...article.excerpts.flatMap((excerpt) => [
      escapeMarkdownText(excerpt.quote),
      '',
    ]),
    '## Sources / References',
    '',
    ...sourceLinks(article).map(
      (link) =>
        `- [${escapeMarkdownText(link.label)}](<${markdownDestination(link.url)}>)`,
    ),
  ];
  return `${lines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()}\n`;
}

export function isRecentNewsArticle(
  article: Pick<NewsArticle, 'published_at' | 'stale'>,
  now = new Date(),
) {
  if (article.stale || !article.published_at) return false;
  const published = Date.parse(article.published_at);
  const current = now.getTime();
  return (
    Number.isFinite(published) &&
    published <= current &&
    published >= current - 2 * 24 * 60 * 60 * 1000
  );
}

export function renderNewsSitemap(
  articles: readonly PublicArticle[],
  now = new Date(),
) {
  const urls = articles
    .filter((article) => isRecentNewsArticle(article, now))
    .map((article) => {
      const url = publicArticleUrl(article.id);
      return `  <url>\n    <loc>${escapeXml(url)}</loc>\n    <news:news>\n      <news:publication>\n        <news:name>${escapeXml(PUBLICATION_NAME)}</news:name>\n        <news:language>${PUBLICATION_LANGUAGE}</news:language>\n      </news:publication>\n      <news:publication_date>${escapeXml(article.published_at!)}</news:publication_date>\n      <news:title>${escapeXml(article.title)}</news:title>\n    </news:news>\n  </url>`;
    });
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">',
    ...urls,
    '</urlset>',
    '',
  ].join('\n');
}

export function renderLlmsText(articles: readonly PublicArticle[] = []) {
  const origin = siteUrl();
  const currentArticles = articles.filter((article) => !article.stale);
  const lines = [
    '# Şak Haber',
    '',
    "> Şak Haber, Türkiye'de sınav, üniversite, okul ve KYK gündemini resmî kaynaklara dayalı olarak aktaran bağımsız bir bilgi hizmetidir.",
    '',
    'Haber metinleri, ilgili kurumun yayımladığı belgelerdeki doğrulanmış alıntılara dayanır. Kaynak kurum ile Şak Haber yayını birbirinden ayrı tutulur. Ana sayfadaki cevap konuları Sınavlar, Üniversite, MEB/Okul ve KYK gruplarında yer alır.',
    '',
    'Her public article has a human-readable HTML URL and a clean Markdown representation at the same path with `.md` appended. Markdown representations are complementary agent resources; the HTML URL remains canonical for Search.',
    '',
    '## Site and publication',
    '',
    `- [Ana sayfa](${origin}): Cevap araması ve konu grupları.`,
    `- [Haberler](${origin}/haberler): Kayıtlı resmî kurumlardan yayımlanan haberler.`,
    `- [Nasıl doğruluyoruz?](${origin}/nasil-calisir): Kaynak, kanıt ve güncellik yönteminin açıklaması.`,
    `- [Gizlilik](${origin}/gizlilik): Arama, geri bildirim ve teknik kayıtlar hakkında bilgi.`,
    '',
    ...(currentArticles.length
      ? [
          '',
          '## Recent news',
          '',
          ...currentArticles
            .slice(0, 5)
            .map(
              (article) =>
                `- [${escapeMarkdownText(article.title)}](${markdownArticleUrl(article.id)}): Public article in Markdown format.`,
            ),
          '',
        ]
      : []),
    '## Machine-readable resources',
    '',
    `- [XML sitemap](${origin}/sitemap.xml): Canonical public indexable URLs.`,
    `- [Google News sitemap](${origin}/news-sitemap.xml): Recent eligible news URLs only.`,
    `- [This llms.txt file](${origin}/llms.txt): Curated agent-discovery index.`,
    '',
  ];
  return lines.join('\n');
}
