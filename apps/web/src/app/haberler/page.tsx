import Link from 'next/link';
import type { Metadata } from 'next';
import { NewsDate } from '../../components/news-date';
import { newsFeed } from '../../lib/product';
export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Resmî kaynaklardan haberler',
  alternates: { canonical: '/haberler' },
};
export default async function News({
  searchParams,
}: {
  searchParams: Promise<{ kaynak?: string }>;
}) {
  const source = (await searchParams).kaynak;
  const allowed = ['osym', 'meb', 'yok', 'gsb', 'yokak'];
  const articles = await newsFeed(
    100,
    source && allowed.includes(source) ? source : undefined,
  );
  return (
    <section className="wrap prose">
      <h1>Resmî kaynaklardan haberler</h1>
      <p>
        ÖSYM, MEB ve diğer kayıtlı resmî kurumların duyurularından hazırlanan
        haberler.
      </p>
      <nav className="category-nav" aria-label="Haber kaynakları">
        <Link href="/haberler">Tümü</Link>
        {allowed.map((s) => (
          <Link key={s} href={'/haberler?kaynak=' + s}>
            {
              {
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
      <ol className="announcement-list">
        {articles.map((a) => (
          <li key={a.id}>
            <Link href={'/haber/' + a.id} prefetch={false}>
              <span className="announcement-source">{a.source_name}</span>
              <strong>{a.title}</strong>
              <span>{a.excerpts[0]?.quote}</span>
              <NewsDate
                publishedAt={a.published_at}
                checkedAt={a.latest_seen_at}
              />
            </Link>
          </li>
        ))}
      </ol>
      {!articles.length && (
        <p>
          Şu anda gösterilecek haber bulunamadı. Kaynak kontrolü tamamlandıkça
          haberler burada görünür.
        </p>
      )}
    </section>
  );
}
