import { createRequire } from 'node:module';
import { afterEach, expect, it, vi } from 'vitest';
import { load } from '../packages/source-sdk/node_modules/cheerio/dist/esm/index.js';
import Home from '../apps/web/src/app/page';
import News from '../apps/web/src/app/haberler/page';
import { parseStructuredHtml } from '../packages/source-sdk/src/index';
import { educationProfiles } from '../sources/education/src/index';
import { formatDate } from '../packages/answers/src/index';
const { articles } = vi.hoisted(() => ({
  articles: [] as {
    id: string;
    published_at: string | null;
    latest_seen_at: string;
    title: string;
    source_name: string;
    excerpts: [];
  }[],
}));
vi.mock('../apps/web/src/lib/product', () => ({
  newsFeed: async () => articles,
}));
const requireWeb = createRequire(
  new URL('../apps/web/package.json', import.meta.url),
);
const { renderToStaticMarkup } = requireWeb('react-dom/server') as {
  renderToStaticMarkup: (element: unknown) => string;
};
afterEach(() => {
  articles.length = 0;
  vi.unstubAllEnvs();
});

it.each([
  'UTC',
  'Europe/Istanbul',
  'America/Los_Angeles',
  'Pacific/Kiritimati',
])(
  'renders the same official date on both actual feeds with server TZ=%s',
  async (timezone) => {
    vi.stubEnv('TZ', timezone);
    articles.push(
      {
        id: 'kpss',
        title: '2026-KPSS: Alan Bilgisi Oturumları',
        source_name: 'ÖSYM',
        published_at: '2026-09-09T21:00:00.000Z',
        latest_seen_at: '2026-09-12T08:37:26.562Z',
        excerpts: [],
      },
      {
        id: 'ozyes',
        title: '2026-ÖZYES: Sınav Sonuçları Açıklandı',
        source_name: 'ÖSYM',
        published_at: '2026-09-08T21:00:00.000Z',
        latest_seen_at: '2026-09-12T08:37:31.482Z',
        excerpts: [],
      },
      {
        id: 'meb',
        title: 'Ülke geneli ortak yazılı sınav takvimi',
        source_name: 'MEB',
        published_at: '2026-09-10T17:05:00.000Z',
        latest_seen_at: '2026-09-12T08:35:02.451Z',
        excerpts: [],
      },
      {
        id: 'unknown',
        title: 'Tarihsiz duyuru',
        source_name: 'MEB',
        published_at: null,
        latest_seen_at: '2026-09-11T21:15:00.000Z',
        excerpts: [],
      },
    );
    const home = load(renderToStaticMarkup(await Home()));
    const feed = load(
      renderToStaticMarkup(await News({ searchParams: Promise.resolve({}) })),
    );
    const dates = (doc: ReturnType<typeof load>) =>
      doc('.announcement-date')
        .map((_, e) => doc(e).text())
        .get();
    expect(dates(home)).toEqual(dates(feed));
    expect(dates(home)).toEqual([
      'Yayın tarihi · 10 Eylül 2026',
      'Yayın tarihi · 9 Eylül 2026',
      'Yayın tarihi · 10 Eylül 2026',
      'Yayın tarihi belirlenemedi · Son kontrol: 12 Eylül 2026',
    ]);
    expect(home('.announcement-date time').first().attr('datetime')).toBe(
      articles[0]!.published_at,
    );
  },
);

function parsePublication(source: 'osym' | 'meb', date: string, meta?: string) {
  const content =
    '<p>Bu sentetik metin yalnızca yayın tarihi ayrıştırmasını test eder.</p>';
  const body =
    (meta ? `<meta property="article:published_time" content="${meta}">` : '') +
    (source === 'osym'
      ? `<div class="row title"><h3>Test duyurusu</h3></div><div class="row content"><div class="col-sm-9"><p>DUYURU (${date})</p>${content}</div></div>`
      : `<h2 class="main-title">Test duyurusu</h2><div class="content article-detay"><div class="content-image"><div class="date">${date}</div></div>${content}</div>`);
  return parseStructuredHtml(
    {
      body,
      requested_url: 'https://www.' + source + '.gov.tr/test',
      final_url: 'https://www.' + source + '.gov.tr/test',
      mime_type: 'text/html',
      fetched_at: '2030-12-31T23:30:00Z',
    },
    educationProfiles[source],
  ).published_at;
}
it.each([
  ['osym', '10 Eylül 2026', '2026-09-09T21:00:00.000Z', '10 Eylül 2026'],
  ['osym', '09 Eylül 2026', '2026-09-08T21:00:00.000Z', '9 Eylül 2026'],
  ['osym', '1 Ocak 2026', '2025-12-31T21:00:00.000Z', '1 Ocak 2026'],
  ['osym', '1 Mart 2026', '2026-02-28T21:00:00.000Z', '1 Mart 2026'],
  ['osym', '29 Şubat 2024', '2024-02-28T21:00:00.000Z', '29 Şubat 2024'],
  ['meb', '10 Eylül 2026 20:05', '2026-09-10T17:05:00.000Z', '10 Eylül 2026'],
  ['meb', '10 Eylül 2026 00:01', '2026-09-09T21:01:00.000Z', '10 Eylül 2026'],
  ['meb', '10 Eylül 2026 23:59', '2026-09-10T20:59:00.000Z', '10 Eylül 2026'],
] as const)(
  'preserves source local date/time: %s %s',
  (source, date, instant, display) => {
    const parsed = parsePublication(source, date);
    expect(parsed).toBe(instant);
    expect(formatDate(parsed!)).toBe(display);
  },
);
it.each(['2026-09-09T21:30:00Z', '2026-09-10T00:30:00+03:00'])(
  'preserves an explicitly offset metadata timestamp %s',
  (meta) => {
    const parsed = parsePublication('meb', '', meta);
    expect(parsed).toBe('2026-09-09T21:30:00.000Z');
    expect(formatDate(parsed!)).toBe('10 Eylül 2026');
  },
);
it('never promotes the crawl timestamp into a missing source publication date', () => {
  expect(parsePublication('meb', '')).toBeNull();
});
