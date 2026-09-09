import type { Metadata } from 'next';
import Link from 'next/link';
import {
  answerResources,
  currentTurkishYear,
  resolveAnswer,
  canonicalPath,
} from '@sak/answers';
import { adminConfigured, isAdmin } from '../../lib/security';
import { database, snapshotForYear } from '../../lib/product';
export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'İşletim paneli',
  robots: { index: false, follow: false },
};
const pretty = (v: unknown) => JSON.stringify(v, null, 2);
export default async function Admin({
  searchParams,
}: {
  searchParams: Promise<{ before?: string; result?: string }>;
}) {
  const params = await searchParams;
  if (!(await isAdmin()))
    return (
      <section className="wrap narrow prose admin">
        <p className="eyebrow">Yetkili erişim</p>
        <h1>İşletim paneli</h1>
        {!adminConfigured() ? (
          <p>Yönetici erişimi sunucu ortamında yapılandırılmamış.</p>
        ) : (
          <form action="/api/admin/login" method="post">
            <label>
              Yönetici parolası
              <input
                name="password"
                type="password"
                autoComplete="current-password"
                maxLength={200}
                required
              />
            </label>
            <button type="submit">Giriş yap</button>
          </form>
        )}
        <p>
          Yalnızca yetkili işletmeciler içindir. Başarısız denemeler
          sınırlandırılır.
        </p>
      </section>
    );
  const client = database()!;
  const before =
    params.before && Number.isFinite(Date.parse(params.before))
      ? new Date(params.before).toISOString()
      : new Date().toISOString();
  const [report, { snapshot, available }] = await Promise.all([
    client
      .rpc('product_admin_snapshot', { p_before: before })
      .abortSignal(AbortSignal.timeout(5000)),
    snapshotForYear(currentTurkishYear()),
  ]);
  if (report.error || !available)
    return (
      <section className="wrap prose">
        <h1>İşletim verisi yüklenemedi</h1>
        <p>Veritabanı bağlantısını ve migration durumunu kontrol edin.</p>
      </section>
    );
  const payload =
    report.data &&
    typeof report.data === 'object' &&
    !Array.isArray(report.data)
      ? report.data
      : {};
  const facts = snapshot.facts;
  const answers = answerResources.map((r) =>
    resolveAnswer(r, currentTurkishYear(), snapshot, new Date().toISOString()),
  );
  return (
    <div className="wrap prose admin">
      <div className="section-heading">
        <h1>İşletim paneli</h1>
        <form action="/api/admin/logout" method="post">
          <button>Çıkış</button>
        </form>
      </div>
      <p>
        Son 50 kayıt gösterilir. Kaynak kontrolü, çıkarım ve yayın birbirinden
        bağımsızdır. Gerekçe ve değişiklik kontrolü olmadan yayın yapılamaz.
      </p>
      {params.result && (
        <p role="status">
          {params.result === 'ok'
            ? 'İşlem kaydedildi.'
            : 'İşlem tamamlanamadı. Kaydı yeniden yükleyip kontrol edin.'}
        </p>
      )}
      <section>
        <h2>Kaynak sağlığı ve kapsam</h2>
        <div className="health-grid">
          {snapshot.endpoints.map((e) => {
            const check = snapshot.checks.find((c) => c.endpoint_id === e.id);
            const stale =
              !check?.successful_at ||
              Date.now() - Date.parse(check.successful_at) >
                Math.max(3600, e.poll_interval_seconds * 3) * 1000;
            return (
              <article className="admin-card" key={e.id}>
                <h3>{e.name}</h3>
                <p>
                  {check?.status ?? 'unknown'} ·{' '}
                  {stale ? 'Gecikmiş / bilinmiyor' : 'Zamanında kontrol'}
                </p>
                <dl>
                  <dt>Son başarılı tarama</dt>
                  <dd>{check?.successful_at ?? 'Yok'}</dd>
                  <dt>Tarama aralığı</dt>
                  <dd>{e.poll_interval_seconds} saniye</dd>
                  <dt>Kapsam</dt>
                  <dd>
                    {check?.scope ?? 'unknown'} ·{' '}
                    {check?.complete ? 'Kapsam tamam' : 'Sınırlı'}
                  </dd>
                  <dt>Uyarılar / parser kayması</dt>
                  <dd>{check?.reasons.join(', ') || 'Yok'}</dd>
                  <dt>Çıkarım kapsamı tamam mı?</dt>
                  <dd>
                    {check?.extraction_complete
                      ? 'Evet'
                      : 'Hayır; yokluk sonucu üretilemez'}
                  </dd>
                </dl>
              </article>
            );
          })}
        </div>
      </section>
      <section>
        <h2>Cevapların güncelliği</h2>
        <ul>
          {answers.map((a) => (
            <li key={a.resource.key}>
              <Link href={canonicalPath(a.resource, a.year)}>
                {a.resource.label}
              </Link>{' '}
              — {a.status}
              {a.stale ? ' · kaynak sağlığı düşük' : ''}
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h2>Yayın ve inceleme</h2>
        {facts.length === 0 && <p>Bu yılın cevap konularında fact yok.</p>}
        {facts.map((f) => (
          <article className="admin-card" key={f.id}>
            <h3>
              {
                snapshot.entities.find((e) => e.id === f.subject_entity_id)
                  ?.name
              }{' '}
              · {f.predicate} · {f.reference_period}
            </h3>
            <p>
              {f.status} · {f.id}
            </p>
            <pre>{pretty(f.value)}</pre>
            <details>
              <summary>Kanıtlar ve karar izleri</summary>
              <pre>
                {pretty({
                  evidence: snapshot.evidence.filter((e) => e.fact_id === f.id),
                  history: snapshot.history.filter((h) => h.fact_id === f.id),
                })}
              </pre>
            </details>
            {['draft', 'verified', 'published', 'needs_review'].includes(
              f.status,
            ) && (
              <form action="/api/admin/review" method="post" className="review">
                <input type="hidden" name="id" value={f.id} />
                <input type="hidden" name="updated_at" value={f.updated_at} />
                <textarea
                  name="reason"
                  aria-label="İnceleme gerekçesi"
                  placeholder="Kamuya açık gerekçe (en az 12 karakter)"
                  minLength={12}
                  maxLength={1000}
                  required
                />
                {f.status === 'verified' && (
                  <button name="action" value="publish">
                    Kontrol et ve yayıma aç
                  </button>
                )}
                <button name="action" value="review">
                  İncelemeye al
                </button>
                <button name="action" value="reject">
                  Reddet / yayından kaldır
                </button>
              </form>
            )}
          </article>
        ))}
      </section>
      <section>
        <h2>Çelişki / düzeltme kararı</h2>
        <p>
          Yalnızca aynı konu, yıl, yetkili kaynak ve predicate için kullanılır.
          Eski kayıt saklanır; yeni fact ayrıca yayın kontrolünden geçer.
        </p>
        <form action="/api/admin/review" method="post">
          <input type="hidden" name="action" value="correct" />
          <label>
            Eski fact UUID
            <input name="id" required />
          </label>
          <label>
            Yeni fact UUID
            <input name="replacement" required />
          </label>
          <label>
            Gerekçe
            <textarea name="reason" required minLength={12} maxLength={1000} />
          </label>
          <button>Düzeltmeyi kaydet</button>
        </form>
      </section>
      {[
        ['documents', 'Yeni / değişen belgeler'],
        ['runs', 'Tarama çalışmaları'],
        ['errors', 'Kaynak hataları ve parser uyarıları'],
        ['extractions', 'Çıkarım çalışmaları'],
        ['candidates', 'Adaylar · rejected / needs_review nedenleri'],
        ['facts', 'Tüm konulardan son fact kayıtları'],
        ['jobs', 'İşler, yeniden denemeler ve kiralar'],
        ['feedback', 'Anonim eksik konular ve cevap faydası'],
      ].map(([key, title]) => (
        <section key={key}>
          <h2>{title}</h2>
          <details>
            <summary>Son kayıtları incele</summary>
            <pre>{pretty(payload[key!])}</pre>
          </details>
        </section>
      ))}
      <form method="get">
        <label>
          Daha eski kayıtlar (ISO tarih)
          <input
            type="datetime-local"
            name="before"
            defaultValue={before.slice(0, 16)}
            required
          />
        </label>
        <button>Kayıtları getir</button>
      </form>
    </div>
  );
}
