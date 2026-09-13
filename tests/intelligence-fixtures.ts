import {
  hash,
  reportSchema,
  sourceSchema,
  type NewsReport,
} from '../packages/news-intelligence/src/index';
export const fixtureSource = sourceSchema.parse({
  id: 'fixture-a',
  name: 'Synthetic test source',
  status: 'active',
  hosts: ['fixture.example'],
  family: 'family-a',
  discovery: [{ kind: 'rss', url: 'https://fixture.example/feed' }],
  delayMs: 1500,
});
export function report(
  source: string,
  title: string,
  text: string,
  at = '2026-09-10T09:00:00.000Z',
  url?: string,
): NewsReport {
  const canonicalUrl =
      url ??
      'https://fixture.example/' + source + '/' + hash(title).slice(0, 10),
    key = hash([source, canonicalUrl]),
    contentHash = hash([title, text, at]);
  return reportSchema.parse({
    id: hash([key, contentHash]),
    key,
    sourceId: source,
    sourceFamily: source,
    sourceReliability: 0.5,
    canonicalUrl,
    title,
    text,
    contentHash,
    publishedAt: at,
    modifiedAt: null,
    discoveredAt: at,
    officialVersionId: null,
    metadata: { fixture: true },
  });
}
export const scenario = () => [
  report(
    'source-a',
    'Ankara-Eskişehir yolunda zincirleme kaza',
    'Ankara-Eskişehir yolunda 3 araç çarpıştı. Kazada 2 kişi yaralandı. Yol trafiğe kapatıldı. Kaynak: Anadolu Ajansı.',
  ),
  report(
    'source-b',
    'Eskişehir yolunda üç araç çarpıştı',
    'Ankara-Eskişehir yolunda 3 araç çarpıştı. Kazada 2 kişi yaralandı. Yol trafiğe kapatıldı. Kaynak: Anadolu Ajansı.',
    '2026-09-10T09:05:00.000Z',
  ),
  report(
    'source-c',
    'Ankara’da kaza ulaşımı aksattı',
    'Ankara Eskişehir yolunda trafik kazası meydana geldi. Üç araç kazaya karıştı. Kazada 4 kişi yaralandı. Sağlık ekipleri yaralıları hastaneye götürdü.',
    '2026-09-10T09:10:00.000Z',
  ),
  report(
    'source-a',
    'Ankara-Eskişehir yolundaki kazada yeni bilgi',
    'Ankara Eskişehir yolunda zincirleme kaza yaşandı. Güncelleme: yaralı sayısı 4 olarak açıklandı. Kaynak: Anadolu Ajansı.',
    '2026-09-10T10:00:00.000Z',
  ),
];
