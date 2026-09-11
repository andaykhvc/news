import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  canonicalPath,
  resourceForRoute,
  formatDate,
  answerResources,
  relatedAnswers,
} from '@sak/answers';
import {
  answerFor,
  snapshotForGroup,
  siteUrl,
  newsArticle,
} from '../../../../lib/product';
import { Search } from '../../../../components/search';
type Props = {
  params: Promise<{ group: string; year: string; event: string }>;
};
export const dynamic = 'force-dynamic';
async function load(params: Props['params']) {
  const p = await params;
  const resource = resourceForRoute(p.group, p.year, p.event);
  if (!resource) notFound();
  return {
    resource,
    year: Number(p.year),
    answer: await answerFor(resource, Number(p.year)),
  };
}
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { resource, year, answer } = await load(params);
  const path = canonicalPath(resource, year);
  return {
    title: `${year} ${resource.question}`,
    description: answer.text,
    alternates: { canonical: path },
    robots: {
      index:
        answer.factId !== null &&
        !answer.stale &&
        !!process.env['PUBLIC_SITE_URL'],
      follow: true,
    },
    openGraph: {
      type: 'website',
      locale: 'tr_TR',
      url: path,
      title: `${year} ${resource.question}`,
      description: answer.text,
    },
  };
}
const stamp = (at: string | null) =>
  at
    ? new Intl.DateTimeFormat('tr-TR', {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: 'Europe/Istanbul',
      }).format(new Date(at)) + ' TSİ'
    : 'Henüz başarılı kontrol kaydı yok';
export default async function AnswerPage({ params }: Props) {
  const { resource, year, answer } = await load(params);
  const { snapshot } = await snapshotForGroup(resource.group, year);
  const related = relatedAnswers(
    resource,
    year,
    snapshot,
    new Date().toISOString(),
    answerResources,
  );
  const news = answer.factId
    ? (
        await Promise.all(
          answer.evidence.map(async (e) => {
            const article = await newsArticle(e.documentId);
            return article?.version_id === e.versionId ? article : null;
          }),
        )
      ).find((a) => a !== null)
    : null;
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: `${year} ${resource.question}`,
    description: answer.text,
    url: siteUrl() + canonicalPath(resource, year),
    ...(answer.verifiedAt ? { dateModified: answer.verifiedAt } : {}),
    citation: answer.evidence.map((e) => ({
      '@type': 'CreativeWork',
      name: e.title,
      url: e.url,
      publisher: { '@type': 'Organization', name: e.institution },
    })),
  };
  return (
    <article className="wrap answer-page">
      <nav className="breadcrumb" aria-label="Konum">
        <Link href="/">Ana sayfa</Link>
        <span>/</span>
        <span>{resource.category}</span>
        <span>/</span>
        <span>{year}</span>
      </nav>
      <div className="answer-layout">
        <div>
          <p className="eyebrow">
            {resource.label} · {year}
          </p>
          <h1>{resource.question}</h1>
          <section
            className={`answer-box ${answer.stale || !answer.factId ? 'uncertain' : ''}`}
            aria-labelledby="answer-status"
          >
            <span id="answer-status" className="status">
              <span className="dot" />
              {answer.status}
            </span>
            {answer.value && <p className="answer-value">{answer.value}</p>}
            <p className="direct-answer" data-testid="direct-answer">
              {answer.text}
            </p>
            {news && (
              <div className="news-actions">
                {news.actions.map((a) => (
                  <a
                    key={a.url}
                    href={a.url}
                    className="official-action"
                    rel="external noreferrer"
                  >
                    {a.label} ↗
                  </a>
                ))}
              </div>
            )}
            {answer.warnings.map((w) => (
              <p className="warning" key={w}>
                {w}
              </p>
            ))}
            <dl className="verification">
              <div>
                <dt>Yetkili kurum</dt>
                <dd>
                  {answer.authority.join(', ') || 'Kaynak kaydı yüklenemedi'}
                </dd>
              </div>
              <div>
                <dt>Son başarılı kaynak kontrolü</dt>
                <dd>{stamp(answer.checkedAt)}</dd>
              </div>
              {answer.verifiedAt && (
                <div>
                  <dt>Bilginin doğrulandığı zaman</dt>
                  <dd>{stamp(answer.verifiedAt)}</dd>
                </div>
              )}
            </dl>
            {answer.evidence.length > 0 && (
              <a className="text-link" href="#kanit">
                Resmî kanıtı gör ↓
              </a>
            )}
          </section>
        </div>
        <aside className="answer-aside">
          <span className="eyebrow">Bilginin kaynağı belli.</span>
          <p>
            Her cevap resmî belgeye dayanır. Kontrol edemediğimiz bilgiyi
            kesinleştirmeyiz.
          </p>
          <Link href="/nasil-calisir">Yöntemimiz ↗</Link>
        </aside>
      </div>
      {news && (
        <section className="prose">
          <h2>Resmî duyurunun içeriği</h2>
          <p>{news.source_name} tarafından yayımlanan duyurudan:</p>
          {news.excerpts.map((e) => (
            <p key={e.id}>{e.quote}</p>
          ))}
          <Link href={'/haber/' + news.id}>Haber ve kaynak geçmişi →</Link>
        </section>
      )}
      <section id="kanit" className="evidence-section">
        <div className="section-heading">
          <h2>Resmî kaynak ve kanıt</h2>
          <span>
            {answer.evidence.length
              ? `${answer.evidence.length} kanıt`
              : 'Kanıt durumu'}
          </span>
        </div>
        {answer.evidence.length ? (
          answer.evidence.map((e, i) => (
            <article
              className="evidence-card"
              key={`${e.versionId}-${i}`}
              data-testid="evidence"
            >
              <div className="eyebrow">
                {e.institution} · Orijinal resmî belge
              </div>
              <h3>
                <a href={e.url} rel="external noopener noreferrer">
                  {e.title} ↗
                </a>
              </h3>
              <p className="muted">
                Yayın tarihi:{' '}
                {e.publishedAt
                  ? formatDate(e.publishedAt)
                  : 'Belgede doğrulanamadı'}{' '}
                · {e.locator}
              </p>
              <blockquote>{e.excerpt}</blockquote>
              <p className="muted">
                Yukarıdaki alıntı resmî belgedendir. Cevap, bu belgeden
                çıkarılan doğrulanmış bilgiyi Şak Haber’in Türkçe şablonuyla
                gösterir.
              </p>
              <details>
                <summary>Belge → sürüm → fact izini göster</summary>
                <dl className="ids">
                  <dt>Belge</dt>
                  <dd>{e.documentId}</dd>
                  <dt>Sürüm</dt>
                  <dd>{e.versionId}</dd>
                  <dt>Fact</dt>
                  <dd>{e.factId}</dd>
                </dl>
              </details>
            </article>
          ))
        ) : (
          <p>
            Bu soruya ait yayıma açık, doğrulanmış bir kanıt gösteremiyoruz.
            Aşağıdaki izleme bağlantıları bir duyurunun kanıtı değildir.
          </p>
        )}
        {answer.coverage.length > 0 && (
          <details className="coverage">
            <summary>İzlenen resmî kaynaklar ve kapsam</summary>
            <ul>
              {answer.coverage.map((c) => (
                <li key={c.url}>
                  <a href={c.url} rel="external noreferrer">
                    {c.name} ↗
                  </a>
                  <p>
                    {c.scope === 'rolling_window'
                      ? 'Güncel duyuru penceresi; tüm arşiv değil.'
                      : c.scope === 'paginated_archive'
                        ? 'Sayfalanmış arşiv; tarama sınırları geçerlidir.'
                        : 'Tarama kapsamı doğrulanamadı.'}{' '}
                    Son başarılı kontrol: {stamp(c.checkedAt)}
                  </p>
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>
      {related.length > 0 && (
        <section className="timeline">
          <h2>Aynı süreçteki diğer bilgiler</h2>
          {related.map((a) => (
            <Link href={canonicalPath(a.resource, year)} key={a.resource.key}>
              <span>{a.resource.label}</span>
              <strong>{a.value}</strong>
              <small>{a.status}</small>
            </Link>
          ))}
        </section>
      )}
      <section className="history">
        <h2>Güncelleme geçmişi</h2>
        {answer.history.length ? (
          <ol>
            {answer.history.map((h, i) => (
              <li key={`${h.fact_id}-${h.at}-${i}`}>
                <time dateTime={h.at}>{stamp(h.at)}</time>
                <p>{h.reason}</p>
              </li>
            ))}
          </ol>
        ) : (
          <p>Bu cevap için henüz doğrulanmış bilgi güncellemesi yok.</p>
        )}
      </section>
      <form action="/api/feedback" method="post" className="feedback">
        <input type="hidden" name="resource" value={resource.key} />
        <input type="hidden" name="year" value={year} />
        <p>
          <strong>Bu cevap işine yaradı mı?</strong>
          <br />
          <small>
            Yanıtın anonim olarak sayılır; kişisel arama profili oluşturulmaz.
          </small>
        </p>
        <button name="kind" value="helpful">
          Evet
        </button>
        <button name="kind" value="unhelpful">
          Hayır
        </button>
      </form>
      <section className="another-search">
        <h2>Başka bir sorun mu var?</h2>
        <Search compact />
      </section>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(schema).replace(/</g, '\\u003c'),
        }}
      />
    </article>
  );
}
