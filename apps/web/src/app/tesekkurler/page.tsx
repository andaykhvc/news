import Link from 'next/link';
export const metadata = {
  title: 'Geri bildirim alındı',
  robots: { index: false, follow: false },
};
export default function Thanks() {
  return (
    <section className="wrap narrow prose">
      <h1>Geri bildirimin alındı.</h1>
      <p>
        Hangi konuları iyileştirmemiz gerektiğini anlamamıza yardımcı oldun.
      </p>
      <Link href="/">Yeni bir soru sor ↗</Link>
    </section>
  );
}
