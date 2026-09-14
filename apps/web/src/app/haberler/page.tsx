import Link from 'next/link';
import type { Metadata } from 'next';
import { NewsDate } from '../../components/news-date';
import { newsFeed } from '../../lib/product';
import {
  PUBLICATION_NAME,
  SITE_DESCRIPTION,
  publicArticlePath,
  publicSiteConfigured,
} from '../../lib/seo';
export const dynamic = 'force-dynamic';

type SearchParams = Record<string, string | string[] | undefined>;

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}): Promise<Metadata> {
  const params = await searchParams;
  const hasQuery = Object.keys(params).length > 0;
  const title = 'Resmî kaynaklardan haberler';
  const description = `${SITE_DESCRIPTION} ÖSYM, MEB ve diğer kayıtlı resmî kurumların duyurularından hazırlanan haberler.`;
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
            <Link href={publicArticlePath(a.id)} prefetch={false}>
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
