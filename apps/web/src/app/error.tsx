'use client';
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <section className="wrap narrow prose">
      <h1>Sayfayı açamadık.</h1>
      <p>Doğrulanamayan bilgi yerine güvenli bir hata ekranı gösteriyoruz.</p>
      <button onClick={reset}>Yeniden dene</button>
    </section>
  );
}
