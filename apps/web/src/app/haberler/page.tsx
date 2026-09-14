import Link from 'next/link';
import type { Metadata } from 'next';
import { NewsList } from '../../components/news-list';
import { newsFeed } from '../../lib/product';
import {
  PUBLICATION_NAME,
  SITE_DESCRIPTION,
  publicSiteConfigured,
} from '../../lib/seo';
import { newsFilters, type NewsFilter } from '../../lib/news-categories';
export const dynamic = 'force-dynamic';

type SearchParams = Record<string, string | string[] | undefined>;

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}): Promise<Metadata> {
  const params = await searchParams;
  const hasQuery = Object.keys(params).length > 0;
  const title = 'Gündem ve haberler';
  const description = `${SITE_DESCRIPTION} TRT Haber, Anadolu Ajansı ve kayıtlı resmî kurum kaynaklarından haberler.`;
  return {
    title,
    description,
    alternates: { canonical: '/haberler' },
    robots: { index: publicSiteConfigured() && !hasQuery, follow: true },
    openGraph: {
      type: 'website',
      locale: 'tr_TR',
      siteName: PUBLICATION_NAME,
      title,
      description,
      url: '/haberler',
    },
  };
}
export default async function News({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const source = typeof params.kaynak === 'string' ? params.kaynak : undefined;
  const allowed = [
    'trt-haber',
    'anadolu-ajansi',
    'osym',
    'meb',
    'yok',
    'gsb',
    'yokak',
  ];
  const categoryParam =
    typeof params.kategori === 'string' ? params.kategori : undefined;
  const category = newsFilters.some((item) => item.key === categoryParam)
    ? (categoryParam as NewsFilter)
    : undefined;
  const articles = await newsFeed(
    100,
    source && allowed.includes(source) ? source : undefined,
    category,
  );
  const href = (next: {
    kaynak?: string | undefined;
    kategori?: NewsFilter | undefined;
  }) => {
    const query = new URLSearchParams();
    if (next.kaynak) query.set('kaynak', next.kaynak);
    if (next.kategori) query.set('kategori', next.kategori);
    return '/haberler' + (query.size ? '?' + query : '');
  };
  return (
    <section className="wrap prose">
      <h1>Gündem ve haberler</h1>
      <p>
        TRT Haber ve Anadolu Ajansı kaynaklı gelişmeler ile resmî kurum
        duyuruları. Her haberin kaynağına doğrudan ulaşabilirsin.
      </p>
      <nav className="category-nav" aria-label="Haber kategorileri">
        <Link
          href={href({ kaynak: source })}
          aria-current={!category ? 'page' : undefined}
        >
          Tümü
        </Link>
        {newsFilters.map((item) => (
          <Link
            key={item.key}
            href={href({ kaynak: source, kategori: item.key })}
            aria-current={category === item.key ? 'page' : undefined}
          >
            {item.label}
          </Link>
        ))}
      </nav>
      <nav
        className="category-nav source-filters"
        aria-label="Haber kaynakları"
      >
        <Link
          href={href({ kategori: category })}
          aria-current={!source ? 'page' : undefined}
        >
          Tüm kaynaklar
        </Link>
        {allowed.map((s) => (
          <Link
            key={s}
            href={href({ kaynak: s, kategori: category })}
            aria-current={source === s ? 'page' : undefined}
          >
            {
              {
                'trt-haber': 'TRT Haber',
                'anadolu-ajansi': 'Anadolu Ajansı',
                osym: 'ÖSYM',
                meb: 'MEB',
                yok: 'YÖK',
                gsb: 'GSB',
                yokak: 'YÖKAK',
              }[s]
            }
          </Link>
        ))}
      </nav>
      <NewsList items={articles} />
      {!articles.length && (
        <p>
          Şu anda gösterilecek haber bulunamadı. Kaynak kontrolü tamamlandıkça
          haberler burada görünür.
        </p>
      )}
    </section>
  );
}
