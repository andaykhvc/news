import Link from 'next/link';
import {
  answerResources,
  currentTurkishYear,
  canonicalPath,
} from '@sak/answers';
import { Search } from '../components/search';
import { NewsDate } from '../components/news-date';
import { newsFeed } from '../lib/product';

export const revalidate = 60;

export default async function Home() {
  const year = currentTurkishYear();
  const announcements = await newsFeed();
  return (
    <>
      <section className="hero">
        <div className="eyebrow">
          <span className="dot" /> Resmî bilgiye kısa yol
        </div>
        <h1>
          Ne öğrenmek
          <br />
          <em>istiyorsun?</em>
        </h1>
        <p>
          Sorunu sor. Doğrulanmış cevabı ve dayandığı resmî kaynağı birlikte
          gör.
        </p>
        <Search />
        <div className="examples">
          <span>Buradan başlayabilirsin</span>
          <Link
            prefetch={false}
            href={canonicalPath(answerResources[0]!, year)}
          >
            YKS ek tercih ↗
          </Link>
          <Link
            prefetch={false}
            href={canonicalPath(answerResources[6]!, year)}
          >
            KYK yurt sonuçları ↗
          </Link>
        </div>
      </section>
      <section className="announcements wrap" aria-labelledby="duyurular">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Doğrudan resmî kaynaklardan</p>
            <h2 id="duyurular">Son haberler</h2>
          </div>
          <span>
            {announcements.length
              ? 'Başlıklar kaynak dokümanlardan alınır.'
              : 'İlk başarılı tarama sonrası burada görünür.'}
          </span>
        </div>
        <Link href="/haberler">Tüm haberler →</Link>
        {announcements.length ? (
          <ol className="announcement-list">
            {announcements.map((announcement) => {
              return (
                <li key={announcement.id}>
                  <a href={'/haber/' + announcement.id}>
                    <span className="announcement-source">
                      {announcement.source_name}
                    </span>
                    <strong>{announcement.title}</strong>
                    <span>{announcement.excerpts[0]?.quote}</span>
                    <NewsDate
                      publishedAt={announcement.published_at}
                      checkedAt={announcement.latest_seen_at}
                    />
                    <span aria-hidden="true">↗</span>
                  </a>
                </li>
              );
            })}
          </ol>
        ) : (
          <p className="announcement-empty">
            Henüz gösterilecek resmî duyuru yok. Kaynak taramaları sürüyor.
          </p>
        )}
      </section>
      <section className="topics wrap" aria-labelledby="topics">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Eğitim gündemi · {year}</p>
            <h2 id="topics">Aklındaki konular</h2>
          </div>
          <span>Her konu, tek cevap sayfası.</span>
        </div>
        <div className="category-nav" aria-label="Kategoriler">
          {['Sınavlar', 'Üniversite', 'MEB/Okul', 'KYK'].map((c, i) => (
            <a href={`#kategori-${i}`} key={c}>
              {c} <span>↘</span>
            </a>
          ))}
        </div>
        <div className="topic-grid">
          {['Sınavlar', 'Üniversite', 'MEB/Okul', 'KYK'].map(
            (category, index) => (
              <section
                className="topic-card"
                key={category}
                id={`kategori-${index}`}
              >
                <span className="card-index">0{index + 1}</span>
                <h3>{category}</h3>
                {answerResources
                  .filter((r) => r.category === category)
                  .map((r) => (
                    <Link
                      key={r.key}
                      prefetch={false}
                      href={canonicalPath(r, year)}
                    >
                      {r.label}
                      <span aria-hidden="true">↗</span>
                    </Link>
                  ))}
              </section>
            ),
          )}
        </div>
      </section>
      <section className="promise wrap">
        <p className="eyebrow">Cevabın arkasında ne var?</p>
        <h2>
          Bir iddia değil,
          <br />
          izini sürebildiğin bilgi.
        </h2>
        <div className="promise-grid">
          <p>
            <strong>01 · Önce cevap</strong>Tarih veya durum doğrulanmışsa ilk
            ekranda. Doğrulanmamışsa bunu açıkça söylüyoruz.
          </p>
          <p>
            <strong>02 · Resmî kanıt</strong>Kurum, belge, ilgili alıntı ve
            doğrudan gov.tr bağlantısı her cevabın yanında.
          </p>
          <p>
            <strong>03 · Güncellik görünür</strong>Son başarılı kontrolü
            gösteriyoruz. Kaynak aksarsa güven mesajımız da değişiyor.
          </p>
        </div>
        <Link href="/nasil-calisir" className="text-link">
          Doğrulama yöntemini incele ↗
        </Link>
      </section>
    </>
  );
}
