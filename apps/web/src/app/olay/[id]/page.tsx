import Link from 'next/link';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { formatDate } from '@sak/answers';
import { eventArticle } from '../../../lib/product';
import { NewsDate } from '../../../components/news-date';
import {
  eventCategory,
  newsCategoryLabels,
} from '../../../lib/news-categories';
export const dynamic = 'force-dynamic';
type Props = { params: Promise<{ id: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params,
    event = await eventArticle(id);
  return {
    title: event?.title ?? 'Haber bulunamadı',
    alternates: { canonical: '/olay/' + id },
    robots: { index: false, follow: true },
  };
}
const labels: Record<string, string> = {
  vehicle_count: 'Araç sayısı',
  injury_count: 'Yaralı sayısı',
  death_count: 'Can kaybı',
  detention_count: 'Gözaltına alınan kişi sayısı',
  earthquake_magnitude: 'Depremin büyüklüğü',
  road_closed: 'Yol kapalı mı?',
  event_ended: 'Olay sona erdi mi?',
};
export default async function EventPage({ params }: Props) {
  const { id } = await params,
    event = await eventArticle(id);
  if (!event) notFound();
  const claims = event.claims.filter((c) => labels[c.predicate]);
  return (
    <article className="wrap narrow prose news-article">
      <Link href="/haberler">← Haberler</Link>
      <p className="eyebrow">
        {newsCategoryLabels[eventCategory(event)]} ·{' '}
        {[...new Set(event.sources.map((s) => s.name))].join(' · ')}
      </p>
      <h1>{event.title}</h1>
      <NewsDate publishedAt={event.publishedAt} checkedAt={event.checkedAt} />
      <p role="status">
        {event.conflicts
          ? 'Kaynaklarda farklı bilgiler var. Çelişen değerleri aşağıda ayrı ayrı gösteriyoruz.'
          : 'Bu sayfa, aşağıdaki haber kaynaklarının aktardığı bilgilere dayanır.'}
      </p>
      {event.stale && (
        <p className="coverage" role="status">
          Kaynak kontrolü gecikmiş veya tamamlanamamış. Son alınan haber
          gösteriliyor; sonrasında yeni bir gelişme olmuş olabilir.
        </p>
      )}
      <div className="news-actions">
        {event.sources.map((s) => (
          <a
            key={s.id}
            className="official-action"
            href={s.url}
            rel="external noreferrer"
          >
            {s.name} haberini oku ↗
          </a>
        ))}
      </div>
      <p>{event.sources[0]!.excerpt}</p>
      {event.checkedAt && (
        <p className="muted">
          Son kaynak kontrolü:{' '}
          {new Date(event.checkedAt).toLocaleString('tr-TR', {
            timeZone: 'Europe/Istanbul',
          })}
        </p>
      )}
      {claims.length > 0 && (
        <section aria-labelledby="aktarilan-bilgiler">
          <h2 id="aktarilan-bilgiler">Kaynakların aktardığı bilgiler</h2>
          <ul>
            {claims.map((c) => (
              <li key={c.id}>
                <strong>
                  {labels[c.predicate]}:{' '}
                  {c.value.type === 'boolean'
                    ? c.value.value
                      ? 'Evet'
                      : 'Hayır'
                    : String(c.value.value)}
                </strong>
                {' · '}
                {c.status === 'conflicting'
                  ? 'Kaynaklar arasında çelişki var'
                  : c.status === 'supported'
                    ? 'Birden fazla kaynak ailesi aktarıyor'
                    : 'Tek kaynak ailesinin aktarımı'}
                <ul>
                  {c.evidence
                    .filter((e) => e.active)
                    .map((e) => {
                      const source = event.sources.find(
                        (s) => s.id === e.reportId,
                      )!;
                      return (
                        <li key={e.reportId + ':' + e.start}>
                          <a href={source.url} rel="external noreferrer">
                            {source.name} ↗
                          </a>
                          <details>
                            <summary>Kaynak cümlesini göster</summary>
                            <blockquote>{e.quote}</blockquote>
                          </details>
                        </li>
                      );
                    })}
                </ul>
              </li>
            ))}
          </ul>
        </section>
      )}
      <section aria-labelledby="haber-kaynaklari">
        <h2 id="haber-kaynaklari">Haberin kaynakları</h2>
        {event.sources.map((s) => (
          <section key={s.id}>
            <h3>
              <a href={s.url} rel="external noreferrer">
                {s.name}: {s.title} ↗
              </a>
            </h3>
            <NewsDate publishedAt={s.publishedAt} checkedAt={s.checkedAt} />
            {s.id !== event.sources[0]!.id && <p>{s.excerpt}</p>}
          </section>
        ))}
      </section>
      <details className="coverage">
        <summary>Güncelleme geçmişi</summary>
        <p>
          Aşağıdaki tarihler haberin yayın tarihi değil, kaynak raporlarının bu
          sayfaya işlendiği zamanlardır.
        </p>
        <ol>
          {event.history.map((h) => (
            <li key={h.id}>
              {formatDate(h.at)} ·{' '}
              {h.kind === 'created'
                ? 'İlk kaynak raporu kaydedildi'
                : 'Kaynak raporu eklendi veya güncellendi'}
            </li>
          ))}
        </ol>
      </details>
    </article>
  );
}
