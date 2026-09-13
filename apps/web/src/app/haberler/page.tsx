import Link from 'next/link';
import type { Metadata } from 'next';
import { NewsList } from '../../components/news-list';
import { newsFeed } from '../../lib/product';
import { newsFilters, type NewsFilter } from '../../lib/news-categories';
export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Gündem ve haberler',
  alternates: { canonical: '/haberler' },
};
export default async function News({
  searchParams,
}: {
  searchParams: Promise<{ kaynak?: string; kategori?: string }>;
}) {
  const parameters = await searchParams;
  const source = parameters.kaynak;
  const category = newsFilters.some((item) => item.key === parameters.kategori)
    ? (parameters.kategori as NewsFilter)
    : undefined;
  const allowed = [
    'trt-haber',
    'anadolu-ajansi',
    'osym',
    'meb',
    'yok',
    'gsb',
    'yokak',
  ];
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
