import {
  factCandidateSchema,
  structureSchema,
  type FactCandidate,
  type Ontology,
  type ValidationDecision,
  type Document,
  type DocumentVersion,
  type AllowedHost,
} from '@sak/domain';
import { validateSourceUrl } from './url';
export const foldTurkish = (s: string) =>
  s
    .toLocaleLowerCase('tr-TR')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replaceAll('ı', 'i')
    .replace(/\s+/gu, ' ')
    .trim();
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
function iso(y: string, m: number, d: string): string | null {
  const s = `${y}-${String(m).padStart(2, '0')}-${d.padStart(2, '0')}`;
  const t = Date.parse(s);
  return Number.isFinite(t) && new Date(t).toISOString().startsWith(s)
    ? s
    : null;
}
/** Only explicit years. Shared-year ranges are handled as a grammar, never with the crawl year. */
export function parseTurkishDates(text: string): string[] {
  const s = foldTurkish(text).trim().replace(/[–—]/g, '-');
  const range = s.match(
    /^(\d{1,2})\s+([a-z]+)\s*-\s*(\d{1,2})\s+([a-z]+)\s+(\d{4})$/,
  );
  if (range) {
    const a = iso(range[5]!, months.indexOf(range[2]!) + 1, range[1]!);
    const b = iso(range[5]!, months.indexOf(range[4]!) + 1, range[3]!);
    return a && b && a <= b ? [a, b] : [];
  }
  const same = s.match(/^(\d{1,2})\s*-\s*(\d{1,2})\s+([a-z]+)\s+(\d{4})$/);
  if (same) {
    const a = iso(same[4]!, months.indexOf(same[3]!) + 1, same[1]!);
    const b = iso(same[4]!, months.indexOf(same[3]!) + 1, same[2]!);
    return a && b && a <= b ? [a, b] : [];
  }
  const result: string[] = [];
  for (const m of s.matchAll(
    /(?<!\d)(\d{1,2})[./](\d{1,2})[./](\d{4})(?!\d)|(?<!\d)(\d{1,2})\s+([a-z]+)\s+(\d{4})(?!\d)/g,
  )) {
    const value = m[1]
      ? iso(m[3]!, Number(m[2]), m[1])
      : iso(m[6]!, months.indexOf(m[5]!) + 1, m[4]!);
    if (value) result.push(value);
  }
  if (
    /^\d{4}-\d{2}-\d{2}$/.test(s) &&
    Number.isFinite(Date.parse(s)) &&
    new Date(s).toISOString().startsWith(s)
  )
    result.push(s);
  return result;
}
function mentions(text: string, needle: string) {
  const escaped = foldTurkish(needle).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(
    `(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`,
    'u',
  ).test(foldTurkish(text));
}
export function validateCandidate(input: {
  candidate: unknown;
  document: Document;
  version: DocumentVersion;
  sourceKey: string;
  sourceActive: boolean;
  hosts: AllowedHost[];
  ontology: Ontology;
  asOf: string;
  expectedPeriod?: string;
}): ValidationDecision {
  const decision = (
    status: ValidationDecision['status'],
    ...reasons: string[]
  ): ValidationDecision => ({
    status,
    reasons,
    validator_version: 'grounding-v1',
  });
  const parsed = factCandidateSchema.safeParse(input.candidate);
  if (!parsed.success) return decision('rejected', 'candidate_schema_invalid');
  const c = parsed.data,
    v = input.version,
    d = input.document;
  if (
    !input.sourceActive ||
    !validateSourceUrl(d.canonical_url, d.source_id, input.hosts).ok
  )
    return decision('rejected', 'source_not_trusted');
  if (v.document_id !== d.id)
    return decision('rejected', 'version_document_mismatch');
  if (d.current_version_id !== v.id || d.status !== 'active')
    return decision('needs_review', 'historical_document_version');
  if (
    !Number.isFinite(Date.parse(input.asOf)) ||
    Date.parse(v.fetched_at) > Date.parse(input.asOf) ||
    (v.published_at && Date.parse(v.published_at) > Date.parse(input.asOf))
  )
    return decision('needs_review', 'future_or_invalid_document_time');
  const e = c.evidence;
  if (e.end <= e.start || v.raw_text.slice(e.start, e.end) !== e.quote)
    return decision('rejected', 'evidence_not_exact');
  if (!e.quote.includes(c.value_text))
    return decision('rejected', 'value_text_not_in_evidence');
  const structure = structureSchema.safeParse(v.metadata['structure']);
  if (!structure.success) return decision('needs_review', 'missing_structure');
  if (structure.data.warnings.length)
    return decision('needs_review', ...structure.data.warnings);
  const block = structure.data.blocks.find(
    (b) => b.start <= e.start && b.end >= e.end && b.page === e.page,
  );
  if (!block) return decision('rejected', 'locator_outside_block_or_page');
  const entity = input.ontology.entities.find((x) => x.key === c.entity_key);
  const pred = input.ontology.predicates.find((x) => x.key === c.predicate);
  if (
    !entity ||
    !pred ||
    !input.ontology.topics.some((t) => t.key === c.topic_key)
  )
    return decision('rejected', 'unknown_ontology_key');
  if (
    !input.ontology.authorities.some(
      (a) =>
        a.source === input.sourceKey &&
        a.topic === c.topic_key &&
        a.entity === c.entity_key &&
        a.predicates.includes(c.predicate),
    )
  )
    return decision('needs_review', 'no_contextual_authority');
  // Headings establish document scope; the selected block must establish claim semantics.
  if (
    !entity.aliases.some(
      (alias) =>
        mentions(e.quote, alias) ||
        mentions(v.title, alias) ||
        mentions(block.heading ?? '', alias),
    )
  )
    return decision('needs_review', 'entity_not_grounded');
  if (
    entity.ambiguous_when.some((term) =>
      mentions(v.title + ' ' + e.quote, term),
    )
  )
    return decision('needs_review', 'entity_requires_more_specific_scope');
  if (
    e.page !== null &&
    !entity.aliases.some((alias) => mentions(e.quote, alias))
  )
    return decision('needs_review', 'pdf_entity_not_in_evidence');
  if (!pred.cues.some((cue) => foldTurkish(e.quote).includes(foldTurkish(cue))))
    return decision('rejected', 'predicate_not_grounded');
  // Bind the selected value to its label; a real date elsewhere in the same block is insufficient.
  const valuePosition = e.quote.indexOf(c.value_text);
  const beforeValue = foldTurkish(e.quote.slice(0, valuePosition));
  const label = pred.cues
    .map((cue) => ({
      cue: foldTurkish(cue),
      position: beforeValue.lastIndexOf(foldTurkish(cue)),
    }))
    .filter((x) => x.position >= 0)
    .sort((a, b) => b.position - a.position)[0];
  if (!label) return decision('needs_review', 'value_label_relation_ambiguous');
  const between = beforeValue.slice(label.position + label.cue.length);
  if (
    between.length > 80 ||
    parseTurkishDates(between).length ||
    input.ontology.predicates.some(
      (other) =>
        other.key !== pred.key &&
        other.cues.some((cue) => between.includes(foldTurkish(cue))),
    )
  )
    return decision('needs_review', 'value_label_relation_ambiguous');
  if (c.unit !== pred.unit || !pred.value_types.includes(c.value.type))
    return decision('rejected', 'type_or_unit_mismatch');
  if (!c.reference_period)
    return decision('needs_review', 'reference_period_missing');
  if (input.expectedPeriod && input.expectedPeriod !== c.reference_period)
    return decision('rejected', 'reference_period_mismatch');
  if (
    !mentions(e.quote, c.reference_period) &&
    !mentions(v.title, c.reference_period) &&
    !mentions(block.heading ?? '', c.reference_period)
  )
    return decision('needs_review', 'reference_period_not_grounded');
  const valueYears =
    c.value.type === 'date'
      ? [c.value.value.slice(0, 4)]
      : c.value.type === 'date_range'
        ? [c.value.start.slice(0, 4), c.value.end.slice(0, 4)]
        : c.value.type === 'datetime'
          ? [c.value.value.slice(0, 4)]
          : [];
  const periodYears: string[] =
    c.reference_period.match(/(?<!\d)\d{4}(?!\d)/g) ?? [];
  if (
    valueYears.length &&
    (!periodYears.length ||
      valueYears.some((year) => !periodYears.includes(year)))
  )
    return decision('needs_review', 'value_year_differs_from_reference_period');
  if (c.correction_of)
    return decision('needs_review', 'explicit_correction_requires_resolution');
  const value = c.value;
  let matches = false;
  const dates = parseTurkishDates(c.value_text);
  switch (value.type) {
    case 'date':
      matches = dates.length === 1 && dates[0] === value.value;
      break;
    case 'date_range':
      matches =
        dates.length === 2 &&
        dates[0] === value.start &&
        dates[1] === value.end;
      break;
    case 'datetime': {
      // An offset must be present in the source. Local "23.59" is not silently assigned a timezone.
      matches =
        c.value_text === value.value &&
        /(?:Z|[+-]\d{2}:\d{2})$/.test(c.value_text);
      break;
    }
    case 'number': {
      const n = c.value_text.trim();
      matches =
        /^-?\d+(?:,\d+)?$/.test(n) &&
        Number(n.replace(',', '.')) === value.value;
      break;
    }
    case 'money': {
      const m = c.value_text.match(
        /^((?:0|[1-9]\d*)(?:,\d{1,2})?|[1-9]\d{0,2}(?:\.\d{3})+(?:,\d{1,2})?)\s*(TL|TRY|₺)$/,
      );
      matches =
        !!m &&
        value.currency === 'TRY' &&
        m[1]!.replaceAll('.', '').replace(',', '.') === value.amount;
      break;
    }
    case 'boolean':
    case 'status':
      matches = (pred.lexicon[String(value.value)] ?? []).some(
        (s) => foldTurkish(s) === foldTurkish(c.value_text),
      );
      break;
    case 'string':
      matches = c.value_text === value.value;
      break;
    case 'url':
      matches =
        c.value_text === value.value &&
        validateSourceUrl(value.value, d.source_id, input.hosts).ok;
      break;
    case 'json':
      return decision(
        'needs_review',
        'json_requires_registered_semantic_validator',
      );
  }
  if (!matches)
    return decision(
      dates.length === 0 &&
        ['date', 'date_range', 'datetime'].includes(value.type)
        ? 'needs_review'
        : 'rejected',
      'value_not_deterministically_grounded',
    );
  // Multiple alternatives, negation and correction language require human resolution.
  if (
    /\b(iptal|duzelt|degistiril|ertelen|onceki|degil)\p{L}*/u.test(
      foldTurkish(
        block.kind === 'page'
          ? e.quote
          : v.raw_text.slice(block.start, block.end),
      ),
    )
  )
    return decision('needs_review', 'negation_or_correction_context');
  return decision(
    'verified',
    'official_source',
    'exact_evidence',
    'structured_locator',
    'contextual_authority',
    'typed_value',
    'explicit_period',
  );
}
export function candidateIdentity(c: FactCandidate) {
  return [c.entity_key, c.topic_key, c.predicate, c.reference_period, c.unit];
}
