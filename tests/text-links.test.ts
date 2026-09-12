import { expect, it } from 'vitest';
import { textLinks } from '../apps/web/src/lib/text-links';
it('links multiple addresses without changing the original evidence text or punctuation', () => {
  const text =
    'Sonuçlar https://ykssonuc.osym.gov.tr adresinden; başvuru www.meb.gov.tr üzerinden. (https://ais.osym.gov.tr/).';
  const parts = textLinks(text);
  expect(parts.map((p) => p.text).join('')).toBe(text);
  expect(parts.filter((p) => p.href).map((p) => p.href)).toEqual([
    'https://ykssonuc.osym.gov.tr/',
    'https://www.meb.gov.tr/',
    'https://ais.osym.gov.tr/',
  ]);
});
it('uses the actual official href when displayed text names a general portal', () => {
  const parts = textLinks('https://ykssonuc.osym.gov.tr adresinden.', [
    {
      text: 'https://ykssonuc.osym.gov.tr',
      url: 'https://sonuc.osym.gov.tr/Sorgu.aspx?SonucID=10331',
    },
  ]);
  expect(parts[0]?.href).toBe(
    'https://sonuc.osym.gov.tr/Sorgu.aspx?SonucID=10331',
  );
});
it('preserves query parameters and balanced path punctuation, excluding Turkish suffixes', () => {
  const text =
    "https://www.meb.gov.tr/a(b)?x=1&y=2’den veya https://ais.osym.gov.tr'den.";
  expect(
    textLinks(text)
      .map((p) => p.text)
      .join(''),
  ).toBe(text);
  expect(
    textLinks(text)
      .filter((p) => p.href)
      .map((p) => p.href),
  ).toEqual([
    'https://www.meb.gov.tr/a(b)?x=1&y=2',
    'https://ais.osym.gov.tr/',
  ]);
});
it('does not make email, credential URLs, custom schemes or unsafe mapped targets actionable', () => {
  expect(
    textLinks(
      'mail@www.meb.gov.tr javascript:https://bad.example https://user:pass@host.example',
    ).some((p) => p.href),
  ).toBe(false);
  expect(
    textLinks('https://meb.gov.tr', [
      { text: 'https://meb.gov.tr', url: 'javascript:alert(1)' },
    ])[0]?.href,
  ).toBe('https://meb.gov.tr/');
});
