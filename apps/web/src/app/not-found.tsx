import Link from 'next/link';
export default function NotFound() {
  return (
    <section className="wrap narrow prose">
      <h1>Bu sayfa yok.</h1>
      <p>
        Aradığın içerik kaldırılmış, taşınmış veya hiç yayımlanmamış olabilir.
      </p>
      <Link href="/">Ana sayfaya dön ↗</Link>
    </section>
  );
}
