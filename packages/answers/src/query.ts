import { foldTurkish } from '@sak/validation';
import {
  answerResources,
  currentTurkishYear,
  type AnswerResource,
} from './catalog';
export interface QueryIntent {
  resource: AnswerResource;
  year: number;
  explicitYear: boolean;
  intent: 'date' | 'status' | 'requirements' | 'value' | 'information';
  normalized: string;
  method: 'alias' | 'spelling';
}
export interface QueryResult {
  intent: QueryIntent | null;
  normalized: string;
  suggestions: AnswerResource[];
  reason: string | null;
}
export function normalizeQuery(query: string): string {
  return foldTurkish(query.slice(0, 240))
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
function distance(a: string, b: string): number {
  let row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 0; i < a.length; i++) {
    const next = [i + 1];
    for (let j = 0; j < b.length; j++)
      next.push(
        Math.min(
          next[j]! + 1,
          row[j + 1]! + 1,
          row[j]! + (a[i] === b[j] ? 0 : 1),
        ),
      );
    row = next;
  }
  return row[b.length]!;
}
const stop = new Set([
  'ne',
  'zaman',
  'mi',
  'mu',
  'aciklandi',
  'aciklandimi',
  'aciklanacak',
  'tarihi',
  'tarihleri',
  'nedir',
  'icin',
  'bu',
  'yil',
  'basliyor',
  'baslayacak',
]);
export function resolveQuery(
  query: string,
  year = currentTurkishYear(),
): QueryResult {
  const normalized = normalizeQuery(query).replace(/\bzamam\b/g, 'zaman');
  const years = [...new Set(normalized.match(/\b(?:19|20|21)\d{2}\b/g) ?? [])];
  if (
    !normalized ||
    query.length > 240 ||
    years.length > 1 ||
    /\b(gecen|gelecek|onceki|sonraki)\b/.test(normalized)
  )
    return {
      intent: null,
      normalized,
      suggestions: [],
      reason: 'Lütfen konuyu ve tek bir yılı açıkça yaz.',
    };
  const tokens = normalized
    .split(' ')
    .filter((t) => !stop.has(t) && !years.includes(t));
  const phrase = tokens.join(' ');
  const ranked = answerResources
    .map((resource) => {
      let score = 0;
      let exact = false;
      for (const alias of resource.aliases) {
        const candidate = normalizeQuery(alias);
        if (phrase === candidate) {
          score = 1;
          exact = true;
          break;
        }
        // Compare whole phrases. Extra event words cannot disappear in a substring match.
        const a = candidate.split(' ');
        if (
          a.length !== tokens.length ||
          a.some((t, i) => t.length <= 3 && t !== tokens[i])
        )
          continue;
        const edits = distance(phrase, candidate);
        if (edits <= 2 && phrase.length >= 8)
          score = Math.max(
            score,
            1 - edits / Math.max(phrase.length, candidate.length),
          );
      }
      return { resource, score, exact };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score);
  const best = ranked[0];
  if (
    !best ||
    best.score < 0.8 ||
    (ranked[1] && best.score - ranked[1].score < 0.08)
  )
    return {
      intent: null,
      normalized,
      suggestions: ranked.slice(0, 3).map((r) => r.resource),
      reason: 'Bu aramayı henüz tek bir konuya bağlayamadık.',
    };
  // Do not answer a fee/result/requirements question with preference dates.
  const requestedPredicate = /\b(ucret|ucreti|para|kac tl)\b/.test(normalized)
    ? 'application_fee'
    : /\b(sart|sartlari|kosul|kosullari)\b/.test(normalized)
      ? 'conditions'
      : null;
  if (requestedPredicate && best.resource.predicate !== requestedPredicate)
    return {
      intent: null,
      normalized,
      suggestions: [best.resource],
      reason: 'Bu bilgi türü için henüz bir cevap kaynağımız yok.',
    };
  return {
    normalized,
    reason: null,
    suggestions: [],
    intent: {
      resource: best.resource,
      year: years[0] ? Number(years[0]) : year,
      explicitYear: years.length > 0,
      normalized,
      method: best.exact ? 'alias' : 'spelling',
      intent: /aciklan|sonuc/.test(normalized)
        ? 'status'
        : /ne zaman|tarih/.test(normalized)
          ? 'date'
          : 'information',
    },
  };
}
/** Store only catalog vocabulary. Unknown words (including names) never reach analytics. */
export function privateQuerySummary(query: string): string | null {
  if (query.length > 240 || /@|https?:|\d{5,}/i.test(query)) return null;
  const vocabulary = new Set(
    answerResources
      .flatMap((r) => r.aliases.flatMap((a) => normalizeQuery(a).split(' ')))
      .concat([
        'sonuc',
        'ucret',
        'sart',
        'tarih',
        'kilavuz',
        'basvuru',
        'burs',
        'sinav',
      ]),
  );
  const words = normalizeQuery(query)
    .split(' ')
    .filter((w) => vocabulary.has(w) || /^(19|20|21)\d{2}$/.test(w));
  return words.length ? [...new Set(words)].sort().join(' ') : null;
}
