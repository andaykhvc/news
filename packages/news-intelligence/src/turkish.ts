import type { NewsEntity } from './model';
export const normalize = (text: string) =>
  text
    .normalize('NFKC')
    .toLocaleLowerCase('tr-TR')
    .replace(/[’'`]/g, ' ')
    .replace(/ı/g, 'i')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
const stop = new Set(
  'bir ve ile de da icin bu olan olarak daha haber son dakika sonra once gore kisi kisinin'.split(
    ' ',
  ),
);
const synonyms: Record<string, string> = {
  carpisti: 'kaza',
  carpismasi: 'kaza',
  kazasi: 'kaza',
  kazada: 'kaza',
  yaralandi: 'yarali',
  yaralanan: 'yarali',
  yaralilar: 'yarali',
  yolunda: 'yol',
  yolu: 'yol',
  karayolu: 'yol',
  karayolunda: 'yol',
  ulasim: 'trafik',
  ulasimi: 'trafik',
  aksatti: 'kapali',
  kapandi: 'kapali',
  yangini: 'yangin',
  depremi: 'deprem',
  gozaltina: 'gozalti',
  gozaltinda: 'gozalti',
  secimleri: 'secim',
  macinda: 'mac',
  macini: 'mac',
};
export const tokens = (text: string) =>
  [
    ...new Set(
      normalize(text)
        .split(' ')
        .filter((t) => t.length > 2 && !stop.has(t))
        .map((t) => synonyms[t] ?? t),
    ),
  ].sort();
export function similarity(a: string[], b: string[]) {
  const x = new Set(a),
    y = new Set(b);
  const common = [...x].filter((t) => y.has(t)).length;
  return common / Math.max(1, new Set([...x, ...y]).size);
}
export const cities =
  'Adana Adıyaman Afyonkarahisar Ağrı Amasya Ankara Antalya Artvin Aydın Balıkesir Bilecik Bingöl Bitlis Bolu Burdur Bursa Çanakkale Çankırı Çorum Denizli Diyarbakır Edirne Elazığ Erzincan Erzurum Eskişehir Gaziantep Giresun Gümüşhane Hakkâri Hatay Isparta Mersin İstanbul İzmir Kars Kastamonu Kayseri Kırklareli Kırşehir Kocaeli Konya Kütahya Malatya Manisa Kahramanmaraş Mardin Muğla Muş Nevşehir Niğde Ordu Rize Sakarya Samsun Siirt Sinop Sivas Tekirdağ Tokat Trabzon Tunceli Şanlıurfa Uşak Van Yozgat Zonguldak Aksaray Bayburt Karaman Kırıkkale Batman Şırnak Bartın Ardahan Iğdır Yalova Karabük Kilis Osmaniye Düzce'.split(
    ' ',
  );
const known: { kind: NewsEntity['kind']; name: string; aliases: string[] }[] = [
  {
    kind: 'road',
    name: 'ankara-eskisehir',
    aliases: [
      'ankara eskişehir yolu',
      'ankara eskişehir yolunda',
      'eskişehir yolu',
      'eskişehir yolunda',
    ],
  },
  { kind: 'road', name: 'tem', aliases: ['tem otoyolu', 'tem otoyolunda'] },
  { kind: 'road', name: 'd-100', aliases: ['d 100', 'e 5 karayolu'] },
  ...[
    'Çankaya',
    'Keçiören',
    'Mamak',
    'Polatlı',
    'Sincan',
    'Kadıköy',
    'Beşiktaş',
    'Bornova',
  ].map((name) => ({
    kind: 'district' as const,
    name: normalize(name),
    aliases: [name],
  })),
  ...[
    'AFAD',
    'KGM',
    'TBMM',
    'ÖSYM',
    'MEB',
    'İçişleri Bakanlığı',
    'Sağlık Bakanlığı',
  ].map((name) => ({
    kind: 'institution' as const,
    name: normalize(name),
    aliases: [name],
  })),
  ...['Galatasaray', 'Fenerbahçe', 'Beşiktaş', 'Trabzonspor'].map((name) => ({
    kind: 'team' as const,
    name: normalize(name),
    aliases: [name],
  })),
];
export function extractEntities(text: string): NewsEntity[] {
  const n = ' ' + normalize(text) + ' ';
  const out: NewsEntity[] = [];
  for (const city of cities)
    if (n.includes(' ' + normalize(city) + ' '))
      out.push({ kind: 'city', value: normalize(city), text: city });
  for (const row of known) {
    const alias = row.aliases.find((a) => n.includes(' ' + normalize(a) + ' '));
    if (alias) out.push({ kind: row.kind, value: row.name, text: alias });
  }
  for (const m of text.matchAll(
    /\b([A-ZÇĞİÖŞÜ][a-zçğıöşü]+(?: [A-ZÇĞİÖŞÜ][a-zçğıöşü]+){1,2})\s+(?:açıkladı|dedi|konuştu|gözaltına)/gu,
  ))
    out.push({ kind: 'person', value: normalize(m[1]!), text: m[1]! });
  for (const m of text.matchAll(
    /\b([A-ZÇĞİÖŞÜ][\p{L}]+(?: [A-ZÇĞİÖŞÜ][\p{L}]+){0,2} (?:Mahallesi|Caddesi|Sokağı|Köprüsü|Stadyumu|Partisi|Holding))/gu,
  ))
    out.push({
      kind:
        m[1]!.endsWith('Partisi') || m[1]!.endsWith('Holding')
          ? 'organization'
          : 'location',
      value: normalize(m[1]!),
      text: m[1]!,
    });
  return [...new Map(out.map((e) => [e.kind + ':' + e.value, e])).values()];
}
const months = [
  'ocak',
  'subat',
  'mart',
  'nisan',
  'mayis',
  'haziran',
  'temmuz',
  'agustos',
  'eylul',
  'ekim',
  'kasim',
  'aralik',
];
/** Explicit source dates only. Offsetless Turkish source clocks mean Europe/Istanbul (+03 since 2016). */
export function parseNewsDate(input: string | null): string | null {
  if (!input) return null;
  const value = input.trim();
  if (
    /^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d(?:\.\d+)?)?(?:Z|[+-]\d\d:\d\d)$/i.test(
      value,
    )
  ) {
    const day = value.slice(0, 10);
    const check = new Date(day + 'T12:00:00Z');
    if (
      !Number.isFinite(check.valueOf()) ||
      !check.toISOString().startsWith(day)
    )
      return null;
    const t = Date.parse(value);
    return Number.isFinite(t) ? new Date(t).toISOString() : null;
  }
  if (/^[A-Za-z]{3}, .*\d{4} .* (?:GMT|[+-]\d{4})$/.test(value)) {
    const t = Date.parse(value);
    return Number.isFinite(t) ? new Date(t).toISOString() : null;
  }
  const n = normalize(value);
  let year: string | undefined,
    month: string | undefined,
    day: string | undefined,
    hour = '00',
    minute = '00',
    second = '00',
    fraction = '000';
  const tr = n.match(
    /^(\d{1,2}) ([a-z]+) (\d{4})(?: (\d{1,2}) (\d{2})(?: (\d{2}))?)?$/,
  );
  const numeric = value.match(
    /^(?:(\d{4})-(\d{2})-(\d{2})|(\d{2})[./](\d{2})[./](\d{4}))(?:[ T](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?)?$/,
  );
  if (tr) {
    year = tr[3];
    month = String(months.indexOf(tr[2]!) + 1);
    day = tr[1];
    hour = tr[4] ?? hour;
    minute = tr[5] ?? minute;
    second = tr[6] ?? second;
  } else if (numeric) {
    year = numeric[1] ?? numeric[6];
    month = numeric[2] ?? numeric[5];
    day = numeric[3] ?? numeric[4];
    hour = numeric[7] ?? hour;
    minute = numeric[8] ?? minute;
    second = numeric[9] ?? second;
    fraction = (numeric[10] ?? '000').slice(0, 3).padEnd(3, '0');
  }
  if (
    !year ||
    !month ||
    !day ||
    +year < 2016 ||
    +month < 1 ||
    +month > 12 ||
    +hour > 23 ||
    +minute > 59 ||
    +second > 59
  )
    return null;
  const date = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  const check = new Date(date + 'T12:00:00Z');
  if (
    !Number.isFinite(check.valueOf()) ||
    !check.toISOString().startsWith(date)
  )
    return null;
  return new Date(
    `${date}T${hour.padStart(2, '0')}:${minute}:${second}.${fraction}+03:00`,
  ).toISOString();
}
export const numberWords: Record<string, number> = {
  sifir: 0,
  bir: 1,
  iki: 2,
  uc: 3,
  dort: 4,
  bes: 5,
  alti: 6,
  yedi: 7,
  sekiz: 8,
  dokuz: 9,
  on: 10,
};
export const readNumber = (text: string) =>
  /^\d+(?:[.,]\d+)?$/.test(text)
    ? Number(text.replace(',', '.'))
    : numberWords[normalize(text)];
