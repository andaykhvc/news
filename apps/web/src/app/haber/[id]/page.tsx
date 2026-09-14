import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { newsArticle } from '../../../lib/product';
import { LinkedText } from '../../../components/linked-text';
import { formatDate } from '@sak/answers';
import {
  articleMetadata,
  articleStructuredData,
  serializeJsonLd,
} from '../../../lib/seo';

export const dynamic = 'force-dynamic';
type Props = { params: Promise<{ id: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const article = await newsArticle(id);
  if (!article) return { title: 'Haber bulunamadı', robots: { index: false } };
  return articleMetadata(article);
}
export default async function Article({ params }: Props) {
  const { id } = await params;
  const article = await newsArticle(id);
  if (!article) notFound();
  return (
    <article className="wrap narrow prose news-article">
      <nav className="breadcrumb" aria-label="Konum">
        <Link href="/">Ana sayfa</Link>
        <span aria-hidden="true">/</span>
        <Link href="/haberler">Haberler</Link>
        <span aria-hidden="true">/</span>
        <span aria-current="page">{article.title}</span>
      </nav>
      <header>
        <p className="eyebrow">{article.source_name} · Resmî duyuru</p>
        <h1>{article.title}</h1>
        <p className="muted">
          {article.published_at ? (
            <>
              Kurumun yayın tarihi:{' '}
              <time dateTime={article.published_at}>
                {formatDate(article.published_at)}
              </time>
            </>
          ) : (
            'Kurumun yayın tarihi belirlenemedi.'
          )}
          {' · '}Son belge kontrolü:{' '}
          <time dateTime={article.latest_seen_at}>
            {new Date(article.latest_seen_at).toLocaleString('tr-TR', {
              timeZone: 'Europe/Istanbul',
            })}
          </time>
        </p>
      </header>
      {article.stale && (
        <p role="status">
          Kaynak kontrolü gecikmiş veya tamamlanamamış. Bu metin son kaydedilen
          resmî duyuruya dayanır; güncel durum için resmî bağlantıyı kontrol
          edin.
        </p>
      )}
      <section aria-label="Kaynak ve referanslar">
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
              <LinkedText text={e.quote} links={article.links} />
            </p>
          ))}
        </section>
        <p className="muted">
          Haber içeriğindeki cümleler resmî duyurudan doğrudan alınmıştır.
          Duyurunun tam metnine ve eklerine aşağıdaki bağlantıdan
          ulaşabilirsiniz.
        </p>
        <a
          className="text-link"
          href={article.canonical_url}
          rel="external noreferrer"
        >
          Resmî duyurunun tamamını oku ↗
        </a>
      </section>
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
          __html: serializeJsonLd(articleStructuredData(article)),
        }}
      />
    </article>
  );
}
