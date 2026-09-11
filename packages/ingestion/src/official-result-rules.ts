import type { DocumentVersion, FactCandidate } from '@sak/domain';
import type { ExtractionProvider } from './extractor';

/**
 * This provider intentionally handles only exact, official ÖSYM YKS title
 * forms. It never infers a result or a preference period from a similar
 * heading, an unscoped date, or prose alone.
 */
export const OFFICIAL_RESULT_TITLE_PROVIDER = 'official-result-title-rules';

const rules = [
  {
    title: /^(?<year>\d{4})-YKS:\s*Sınav Sonuçları Açıklandı$/u,
    entity: 'yks',
  },
  {
    title: /^(?<year>\d{4})-YKS:\s*Yerleştirme Sonuçları Açıklandı$/u,
    entity: 'yks_yerlestirme',
  },
] as const;

const preferenceTitle = /^(?<year>\d{4})-YKS:\s*Tercihlerin Alınması$/u;
const preferenceRange =
  /Adaylar tercihlerini,\s+(?<range>(?<startDay>\d{1,2})\s+(?<startMonth>Ocak|Şubat|Mart|Nisan|Mayıs|Haziran|Temmuz|Ağustos|Eylül|Ekim|Kasım|Aralık)\s+(?<startYear>\d{4})\s*-\s*(?<endDay>\d{1,2})\s+(?<endMonth>Ocak|Şubat|Mart|Nisan|Mayıs|Haziran|Temmuz|Ağustos|Eylül|Ekim|Kasım|Aralık)\s+(?<endYear>\d{4}))\s+tarihleri arasında/u;
const months = new Map([
  ['Ocak', 1],
  ['Şubat', 2],
  ['Mart', 3],
  ['Nisan', 4],
  ['Mayıs', 5],
  ['Haziran', 6],
  ['Temmuz', 7],
  ['Ağustos', 8],
  ['Eylül', 9],
  ['Ekim', 10],
  ['Kasım', 11],
  ['Aralık', 12],
]);

function date(year: string, month: string, day: string): string | null {
  const monthNumber = months.get(month);
  if (!monthNumber) return null;
  const value = `${year}-${String(monthNumber).padStart(2, '0')}-${day.padStart(2, '0')}`;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.valueOf()) &&
    parsed.toISOString().startsWith(value)
    ? value
    : null;
}

function preferenceCandidate(
  document: DocumentVersion,
  title: string,
): FactCandidate | null {
  const titleMatch = preferenceTitle.exec(title);
  const referencePeriod = titleMatch?.groups?.['year'];
  const match = preferenceRange.exec(document.raw_text);
  const groups = match?.groups;
  const startDay = groups?.['startDay'];
  const startMonth = groups?.['startMonth'];
  const startYear = groups?.['startYear'];
  const endDay = groups?.['endDay'];
  const endMonth = groups?.['endMonth'];
  const endYear = groups?.['endYear'];
  const range = groups?.['range'];
  if (
    !match ||
    !referencePeriod ||
    !startDay ||
    !startMonth ||
    !startYear ||
    !endDay ||
    !endMonth ||
    !endYear ||
    !range ||
    startYear !== referencePeriod
  )
    return null;
  const start = date(startYear, startMonth, startDay);
  const end = date(endYear, endMonth, endDay);
  if (!start || !end || start > end) return null;
  const quote = match[0];
  const offset = document.raw_text.indexOf(quote);
  if (offset < 0) return null;
  return {
    entity_key: 'yks',
    topic_key: 'education.exams',
    predicate: 'preference_period',
    value: { type: 'date_range', start, end },
    value_text: range,
    unit: null,
    reference_period: referencePeriod,
    correction_of: null,
    evidence: {
      quote,
      start: offset,
      end: offset + quote.length,
      page: null,
    },
  };
}

function candidateFor(document: DocumentVersion): FactCandidate | null {
  const title = document.title.replace(/\s+/gu, ' ').trim();
  const rule = rules.find((item) => item.title.test(title));
  const match = rule?.title.exec(title);
  if (!rule || !match?.groups?.['year'])
    return preferenceCandidate(document, title);
  const start = document.raw_text.indexOf(title);
  if (start < 0) return null;
  const valueText = 'Açıklandı';
  const valueStart = title.lastIndexOf(valueText);
  if (valueStart < 0) return null;
  return {
    entity_key: rule.entity,
    topic_key: 'education.exams',
    predicate: 'results_status',
    value: { type: 'status', value: 'announced' },
    value_text: valueText,
    unit: null,
    reference_period: match.groups['year'],
    correction_of: null,
    evidence: {
      quote: title,
      start,
      end: start + title.length,
      page: null,
    },
  };
}

export function isOfficialResultTitle(title: string): boolean {
  const normalized = title.replace(/\s+/gu, ' ').trim();
  return rules.some((rule) => rule.title.test(normalized));
}

export function isOfficialYksAnnouncementTitle(title: string): boolean {
  const normalized = title.replace(/\s+/gu, ' ').trim();
  return isOfficialResultTitle(normalized) || preferenceTitle.test(normalized);
}

export function createOfficialResultTitleProvider(): ExtractionProvider {
  return {
    name: OFFICIAL_RESULT_TITLE_PROVIDER,
    model: 'deterministic-v1',
    maxInputChars: 200000,
    async extract({ document, signal }) {
      signal.throwIfAborted();
      const candidate = candidateFor(document);
      return { candidates: candidate ? [candidate] : [] };
    },
  };
}
