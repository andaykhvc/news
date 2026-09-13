import type { PublicNewsEvent } from '@sak/database';

export const newsFilters = [
  { key: 'son-dakika', label: 'Son Dakika' },
  { key: 'gundem', label: 'Gündem' },
  { key: 'spor', label: 'Spor' },
  { key: 'yasam', label: 'Yaşam' },
  { key: 'egitim', label: 'Eğitim' },
  { key: 'ekonomi', label: 'Ekonomi' },
  { key: 'dunya', label: 'Dünya' },
] as const;

export type NewsFilter = (typeof newsFilters)[number]['key'];
export type NewsTopicCategory = Exclude<NewsFilter, 'son-dakika'>;

export const newsCategoryLabels: Record<NewsTopicCategory, string> = {
  gundem: 'Gündem',
  spor: 'Spor',
  yasam: 'Yaşam',
  egitim: 'Eğitim',
  ekonomi: 'Ekonomi',
  dunya: 'Dünya',
};

const normalize = (value: string) =>
  value
    .normalize('NFKC')
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9]+/g, ' ');

const rules: [NewsTopicCategory, RegExp][] = [
  [
    'spor',
    /\b(spor|futbol|basketbol|voleybol|hentbol|tenis|judo|gures|milli takim|super lig|sampiyon|turnuva|grand prix|formula 1|mac|gol|transfer)\b/,
  ],
  [
    'egitim',
    /\b(egitim|okul|universite|sinav|ogrenci|ogretmen|atama|tercih|yerlestirme|yks|lgs|kpss|dgs|osym|meb|yok|burs|yurt)\b/,
  ],
  [
    'ekonomi',
    /\b(ekonomi|enflasyon|ihracat|ithalat|borsa|dolar|euro|faiz|vergi|butce|ticaret|piyasa|mukellef|yatirim|istihdam|maas|ucret)\b/,
  ],
  [
    'yasam',
    /\b(yasam|saglik|kultur|sanat|muzik|sinema|festival|teknoloji|bilim|cevre|turizm|seyahat|hava durumu|yemek|hastane|dogal hayat)\b/,
  ],
  [
    'dunya',
    /\b(rusya|ukrayna|abd|amerika|iran|israil|filistin|suriye|avrupa|almanya|fransa|ingiltere|italya|ispanya|cin|japonya|hindistan|nato|birlesmis milletler)\b/,
  ],
];

export function inferNewsCategory(input: {
  title: string;
  excerpt: string;
  eventKind?: string;
  sourceSlug?: string;
}): NewsTopicCategory {
  if (input.eventKind === 'sports') return 'spor';
  // Headlines carry the editorial subject. The excerpt is only a fallback so an
  // incidental word such as "sağlık ekipleri" cannot turn an accident into Yaşam.
  const title = normalize(input.title);
  const matched = rules.find(([, rule]) => rule.test(title));
  if (matched) return matched[0];
  if (
    ['politics', 'crime', 'fire', 'earthquake', 'traffic_accident'].includes(
      input.eventKind ?? '',
    )
  )
    return 'gundem';
  if (['osym', 'meb', 'yok', 'yokak', 'gsb'].includes(input.sourceSlug ?? ''))
    return 'egitim';
  const excerptMatch = rules.find(([, rule]) =>
    rule.test(normalize(input.excerpt)),
  );
  if (excerptMatch) return excerptMatch[0];
  return 'gundem';
}

export function eventCategory(event: PublicNewsEvent) {
  return inferNewsCategory({
    title: event.title,
    excerpt: event.sources[0]?.excerpt ?? '',
    eventKind: event.eventKind,
  });
}

export function isBreakingNews(publishedAt: string | null, now: string) {
  if (!publishedAt) return false;
  const age = Date.parse(now) - Date.parse(publishedAt);
  return age >= 0 && age <= 24 * 60 * 60 * 1000;
}
