import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { newsArticle, siteUrl } from '../../../lib/product';
import { formatDate } from '@sak/answers';

export const dynamic = 'force-dynamic';
type Props = { params: Promise<{ id: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const article = await newsArticle(id);
  if (!article) return { title: 'Haber bulunamadı', robots: { index: false } };
  const url = siteUrl() + '/haber/' + id;
  return {
    title: article.title,
    description: article.excerpts[0]?.quote.slice(0, 180),
    alternates: { canonical: url },
    robots: { index: !article.stale, follow: true },
    openGraph: { type: 'article', title: article.title, url },
  };
}
export default async function Article({ params }: Props) {
  const { id } = await params;
  const article = await newsArticle(id);
  if (!article) notFound();
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'NewsArticle',
    headline: article.title,
    url: siteUrl() + '/haber/' + id,
    ...(article.published_at ? { datePublished: article.published_at } : {}),
    dateModified: article.verified_at,
    publisher: { '@type': 'Organization', name: 'Şak Haber' },
    citation: article.canonical_url,
    articleBody: article.excerpts.map((e) => e.quote).join(' '),
  };
  return (
    <article className="wrap narrow prose news-article">
      <Link href="/haberler">← Haberler</Link>
      <p className="eyebrow">{article.source_name} · Resmî duyuru</p>
      <h1>{article.title}</h1>
      <p className="muted">
        {article.published_at
          ? 'Kurumun yayın tarihi: ' + formatDate(article.published_at)
          : 'Kurumun yayın tarihi belirlenemedi.'}
        {' · '}Son belge kontrolü:{' '}
        {new Date(article.latest_seen_at).toLocaleString('tr-TR', {
          timeZone: 'Europe/Istanbul',
        })}
      </p>
      {article.stale && (
        <p role="status">
          Kaynak kontrolü gecikmiş veya tamamlanamamış. Bu metin son kaydedilen
          resmî duyuruya dayanır; güncel durum için resmî bağlantıyı kontrol
          edin.
        </p>
      )}
      <div className="news-actions">
        {article.actions.map((a) => (
          <a
            key={a.url}
            className="official-action"
            href={a.url}
            rel="external noreferrer"
          >
            {a.label} ↗
          </a>
        ))}
      </div>
      <p>
        {article.source_name}, aşağıdaki bilgileri resmî duyurusunda paylaştı.
      </p>
      <section aria-label="Resmî duyurudan haber içeriği">
        {article.excerpts.map((e) => (
          <p key={e.id} data-evidence-id={e.id}>
            {e.quote}
          </p>
        ))}
      </section>
      <p className="muted">
        Haber içeriğindeki cümleler resmî duyurudan doğrudan alınmıştır.
        Duyurunun tam metnine ve eklerine aşağıdaki bağlantıdan ulaşabilirsiniz.
      </p>
      <a
        className="text-link"
        href={article.canonical_url}
        rel="external noreferrer"
      >
        Resmî duyurunun tamamını oku ↗
      </a>
      <details className="coverage">
        <summary>Kaynak, kanıt ve güncelleme geçmişi</summary>
        <p>
          {article.source_name} — {article.title}
        </p>
        <p>
          Belge kimliği: {article.id}
          <br />
          Belge sürümü: {article.version_id}
        </p>
        <ol>
          {article.excerpts.map((e) => (
            <li key={e.id}>
              Doğrulanmış alıntı {e.id}: belgenin {e.character_start}–
              {e.character_end} karakterleri.
            </li>
          ))}
        </ol>
        <ul>
          {article.history.map((h) => (
            <li key={h.version_id}>
              {new Date(h.at).toLocaleString('tr-TR', {
                timeZone: 'Europe/Istanbul',
              })}{' '}
              — {h.title}
            </li>
          ))}
        </ul>
      </details>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(schema).replace(/</g, '\\u003c'),
        }}
      />
    </article>
  );
}
