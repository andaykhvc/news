import type { DocumentVersion, FactCandidate } from '@sak/domain';
import type { ExtractionProvider } from './extractor';

/**
 * This provider intentionally handles only exact, official ÖSYM result-title
 * forms. It never infers a result from prose, a date, or a similar heading.
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

function candidateFor(document: DocumentVersion): FactCandidate | null {
  const title = document.title.replace(/\s+/gu, ' ').trim();
  const rule = rules.find((item) => item.title.test(title));
  const match = rule?.title.exec(title);
  if (!rule || !match?.groups?.['year']) return null;
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
