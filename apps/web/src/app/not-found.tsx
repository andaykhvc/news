import Link from 'next/link';
export default function NotFound() {
  return (
    <section className="wrap narrow prose">
      <h1>Bu cevap sayfası yok.</h1>
      <p>Bir konu ve yıl seçerek yeniden arayabilirsin.</p>
      <Link href="/">Ana sayfaya dön ↗</Link>
    </section>
  );
}
