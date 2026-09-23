import type { Metadata } from 'next';
import Link from 'next/link';
import { Analytics } from '@vercel/analytics/next';
import {
  PUBLICATION_NAME,
  SITE_DESCRIPTION,
  llmsTxtUrl,
  serializeJsonLd,
  siteStructuredData,
  publicSiteConfigured,
} from '../lib/seo';
import { siteUrl } from '../lib/product';
import './globals.css';
export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: {
    default: `${PUBLICATION_NAME} — Sorunun cevabı, resmî kaynağıyla.`,
    template: '%s | Şak Haber',
  },
  description: SITE_DESCRIPTION,
  alternates: { canonical: '/' },
  robots: {
    index: publicSiteConfigured(),
    follow: true,
    'max-image-preview': 'large',
  },
  openGraph: {
    type: 'website',
    locale: 'tr_TR',
    siteName: PUBLICATION_NAME,
    title: `${PUBLICATION_NAME} — Sorunun cevabı, resmî kaynağıyla.`,
    description: SITE_DESCRIPTION,
    url: siteUrl(),
  },
  twitter: {
    card: 'summary',
    title: `${PUBLICATION_NAME} — Sorunun cevabı, resmî kaynağıyla.`,
    description: SITE_DESCRIPTION,
  },
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="tr">
      <head>
        <link rel="describedby" type="text/plain" href={llmsTxtUrl()} />
      </head>
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
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: serializeJsonLd(siteStructuredData()),
          }}
        />
        <Analytics />
      </body>
    </html>
  );
}
