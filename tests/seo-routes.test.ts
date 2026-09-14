import { expect, it, vi } from 'vitest';
import type { PublicArticle } from '../apps/web/src/lib/seo';

const { article } = vi.hoisted(() => ({
  article: {
    id: '00000000-0000-4000-8000-000000000011',
    title: 'Test duyurusu',
    canonical_url: 'https://www.osym.gov.tr/test-duyurusu',
    source_name: 'ÖSYM',
    published_at: '2026-09-14T08:00:00.000Z',
    stale: false,
    excerpts: [
      {
        id: '00000000-0000-4000-8000-000000000012',
        quote: 'Resmî duyurunun doğrulanmış cümlesi.',
        character_start: 0,
        character_end: 42,
      },
    ],
    actions: [],
  } satisfies PublicArticle,
}));

vi.mock('../apps/web/src/lib/product', () => ({
  newsArticle: async () => article,
}));

const { GET } = await import('../apps/web/src/app/haber-markdown/[id]/route');

it('serves a public article Markdown representation with duplicate protection headers', async () => {
  vi.stubEnv('PUBLIC_SITE_URL', 'https://haber.example');
  const response = await GET(
    new Request('https://haber.example/haber/test.md'),
    {
      params: Promise.resolve({ id: article.id }),
    },
  );
  expect(response.status).toBe(200);
  expect(response.headers.get('content-type')).toBe(
    'text/markdown; charset=utf-8',
  );
  expect(response.headers.get('x-robots-tag')).toBe('noindex, follow');
  expect(response.headers.get('link')).toContain(
    '<https://haber.example/haber/00000000-0000-4000-8000-000000000011>; rel="canonical"',
  );
  expect(response.headers.get('link')).toContain(
    '<https://haber.example/llms.txt>; rel="describedby"',
  );
  expect(await response.text()).toContain(
    'Resmî duyurunun doğrulanmış cümlesi',
  );
});
