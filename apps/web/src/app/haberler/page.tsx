import Link from 'next/link';
import type { Metadata } from 'next';
import { NewsList } from '../../components/news-list';
import { newsFeed } from '../../lib/product';
export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Gündem ve haberler',
  alternates: { canonical: '/haberler' },
};
export default async function News({
  searchParams,
}: {
  searchParams: Promise<{ kaynak?: string }>;
}) {
  const source = (await searchParams).kaynak;
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
  );
  return (
    <section className="wrap prose">
      <h1>Gündem ve haberler</h1>
      <p>
        TRT Haber ve Anadolu Ajansı kaynaklı gelişmeler ile resmî kurum
        duyuruları. Her haberin kaynağına doğrudan ulaşabilirsin.
      </p>
      <nav className="category-nav" aria-label="Haber kaynakları">
        <Link href="/haberler">Tümü</Link>
        {allowed.map((s) => (
          <Link key={s} href={'/haberler?kaynak=' + s}>
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
