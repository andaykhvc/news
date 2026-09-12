import type { Metadata } from 'next';
import Link from 'next/link';
import { siteUrl } from '../lib/product';
import './globals.css';
export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: {
    default: 'Şak Haber — Sorunun cevabı, resmî kaynağıyla.',
    template: '%s | Şak Haber',
  },
  description:
    'Sınav, üniversite, okul ve KYK sorularına doğrulanmış bilgiler ve açık resmî kaynaklarla cevap.',
  robots: { index: !!process.env['PUBLIC_SITE_URL'], follow: true },
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="tr">
      <body>
        <a className="skip" href="#icerik">
          İçeriğe geç
        </a>
        <header className="header">
          <Link href="/" className="logo" aria-label="Şak Haber ana sayfa">
            şak<span>haber</span>
            <i aria-hidden="true">.</i>
          </Link>
          <nav aria-label="Ana gezinme">
            <Link href="/">Cevabı bul</Link>
            <Link href="/haberler">Haberler</Link>
            <Link href="/nasil-calisir">Nasıl doğruluyoruz?</Link>
          </nav>
          <span className="header-note">Bilgi, kaynağından.</span>
        </header>
        <main id="icerik">{children}</main>
        <footer className="footer">
          <div className="logo">
            şak<span>haber</span>.
          </div>
          <p>Doğrudan cevap. Açık kaynak. Sorumlu belirsizlik.</p>
          <nav aria-label="Alt gezinme">
            <Link href="/nasil-calisir">Yöntemimiz</Link>
            <Link href="/gizlilik">Gizlilik</Link>
          </nav>
          <small>
            Şak Haber bağımsız bir bilgi hizmetidir; resmî kurum sitesi
            değildir.
          </small>
        </footer>
      </body>
    </html>
  );
}
