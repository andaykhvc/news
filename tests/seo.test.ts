import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  articleMetadata,
  articleStructuredData,
  renderArticleMarkdown,
  renderLlmsText,
  renderNewsSitemap,
  serializeJsonLd,
  type PublicArticle,
} from '../apps/web/src/lib/seo';

const article: PublicArticle = {
  id: '00000000-0000-4000-8000-000000000001',
  title: 'Başlık & güncelleme <test>',
  canonical_url: 'https://www.osym.gov.tr/duyuru?a=1&b=2',
  source_name: 'Ölçme, Seçme ve Yerleştirme Merkezi',
  published_at: '2026-09-14T08:00:00.000Z',
  stale: false,
  excerpts: [
    {
      id: '00000000-0000-4000-8000-000000000002',
      quote: 'Bu, resmî duyurudaki gerçek cümledir.',
      character_start: 0,
      character_end: 44,
    },
  ],
  actions: [
    {
      label: 'Sonuç ekranı',
      url: 'https://sonuc.osym.gov.tr/?a=1&b=2',
    },
  ],
};

afterEach(() => vi.unstubAllEnvs());

describe('public news SEO representations', () => {
  it('uses the canonical HTML article URL and does not promote verification time to modification time', () => {
    vi.stubEnv('PUBLIC_SITE_URL', 'https://haber.example');
    const metadata = articleMetadata(article);
    expect(metadata.alternates?.canonical).toBe(
      'https://haber.example/haber/00000000-0000-4000-8000-000000000001',
    );
    expect(metadata.alternates?.types?.['text/markdown']).toBe(
      'https://haber.example/haber/00000000-0000-4000-8000-000000000001.md',
    );
    expect(metadata.openGraph).toMatchObject({
      type: 'article',
      siteName: 'Şak Haber',
      publishedTime: article.published_at,
    });
    expect(metadata.openGraph).not.toHaveProperty('modifiedTime');
    expect(metadata.openGraph).not.toHaveProperty('images');
    expect(metadata.twitter).toMatchObject({ card: 'summary' });
  });

  it('emits parseable JSON-LD with visible content, source citation and no fake author/date', () => {
    vi.stubEnv('PUBLIC_SITE_URL', 'https://haber.example');
    const data = JSON.parse(
      serializeJsonLd(articleStructuredData(article)),
    ) as {
      '@graph': Array<Record<string, unknown>>;
    };
    const news = data['@graph'][0]!;
    expect(news).toMatchObject({
      '@type': 'NewsArticle',
      headline: article.title,
      datePublished: article.published_at,
      citation: article.canonical_url,
      mainEntityOfPage: {
        '@id':
          'https://haber.example/haber/00000000-0000-4000-8000-000000000001',
      },
    });
    expect(news).not.toHaveProperty('dateModified');
    expect(news).not.toHaveProperty('author');
    expect(news).not.toHaveProperty('image');
    expect(data['@graph'][1]).toMatchObject({ '@type': 'BreadcrumbList' });
  });

  it('keeps only healthy articles published within the two-day News sitemap window and escapes XML', () => {
    vi.stubEnv('PUBLIC_SITE_URL', 'https://haber.example');
    const now = new Date('2026-09-14T12:00:00.000Z');
    const xml = renderNewsSitemap(
      [
        article,
        { ...article, id: 'old', published_at: '2026-09-11T11:59:59.000Z' },
        { ...article, id: 'stale', stale: true },
        { ...article, id: 'undated', published_at: null },
        { ...article, id: 'future', published_at: '2026-09-15T00:00:00.000Z' },
      ],
      now,
    );
    expect(xml).toContain('<news:name>Şak Haber</news:name>');
    expect(xml).toContain(
      '<news:title>Başlık &amp; güncelleme &lt;test&gt;</news:title>',
    );
    expect(xml).toContain('/haber/00000000-0000-4000-8000-000000000001</loc>');
    expect(xml).not.toContain('/haber/old</loc>');
    expect(xml).not.toContain('/haber/stale</loc>');
    expect(xml).not.toContain('/haber/undated</loc>');
    expect(xml).not.toContain('/haber/future</loc>');
  });

  it('renders the same public article data as Markdown without exposing internal identifiers', () => {
    vi.stubEnv('PUBLIC_SITE_URL', 'https://haber.example');
    const markdown = renderArticleMarkdown(article);
    expect(markdown).toContain('# Başlık \\& güncelleme \\<test\\>');
    expect(markdown).toContain('- Publication: Şak Haber');
    expect(markdown).toContain(
      '- Original publication date: 2026-09-14T08:00:00.000Z',
    );
    expect(markdown).toContain('Bu, resmî duyurudaki gerçek cümledir\\.');
    expect(markdown).toContain(
      '[Orijinal resmî duyuru](<https://www.osym.gov.tr/duyuru?a=1&b=2>)',
    );
    expect(markdown).not.toContain('version_id');
    expect(markdown).not.toContain('character_start');
  });

  it('keeps llms.txt concise and links only public resources', () => {
    vi.stubEnv('PUBLIC_SITE_URL', 'https://haber.example');
    const llms = renderLlmsText([article]);
    expect(llms).toContain('# Şak Haber');
    expect(llms).toContain('> Şak Haber');
    expect(llms).toContain('## Recent news');
    expect(llms).toContain('/haber/00000000-0000-4000-8000-000000000001.md');
    expect(llms).toContain('/sitemap.xml');
    expect(llms).not.toContain('/admin');
    expect(llms).not.toContain('/api');
  });
});
