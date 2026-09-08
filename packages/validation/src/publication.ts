import {
  factEvidenceSchema,
  type DocumentVersion,
  type Fact,
  type FactEvidence,
  type Source,
} from '@sak/domain';

export function validateEvidence(
  evidence: FactEvidence,
  version: DocumentVersion,
): string[] {
  const parsed = factEvidenceSchema.safeParse(evidence);
  if (!parsed.success) return ['invalid_evidence'];
  if (evidence.document_version_id !== version.id) return ['version_mismatch'];
  const { character_start: start, character_end: end } =
    evidence.evidence_locator;
  const matches =
    start !== undefined && end !== undefined
      ? version.raw_text.slice(start, end) === evidence.evidence_text &&
        end <= version.raw_text.length
      : version.raw_text.includes(evidence.evidence_text);
  return matches ? [] : ['evidence_not_found_in_raw_text'];
}

// Fail closed: this is a publication prerequisite, not an automatic verification engine.
export function validateFactPublication(input: {
  fact: Fact;
  source: Source;
  asOf: string;
  expectedReferencePeriod: string | null;
  evidence: readonly {
    evidence: FactEvidence;
    version: DocumentVersion;
    documentSourceId: string;
  }[];
}): string[] {
  const { fact, source } = input;
  const errors: string[] = [];
  const asOf = Date.parse(input.asOf);
  if (!Number.isFinite(asOf)) errors.push('invalid_as_of');
  if (!['verified', 'published'].includes(fact.status) || !fact.verified_at)
    errors.push('fact_not_verified');
  if (fact.verified_at && Date.parse(fact.verified_at) > asOf)
    errors.push('verification_in_future');
  if (source.status !== 'active' || source.id !== fact.authority_source_id)
    errors.push('authority_not_active');
  if (fact.valid_from && asOf < Date.parse(fact.valid_from))
    errors.push('not_yet_valid');
  if (fact.valid_until && asOf >= Date.parse(fact.valid_until))
    errors.push('validity_expired');
  if (fact.effective_at && asOf < Date.parse(fact.effective_at))
    errors.push('not_yet_effective');
  if (fact.reference_period !== input.expectedReferencePeriod)
    errors.push('reference_period_mismatch');
  if (input.evidence.length === 0) errors.push('missing_evidence');
  for (const item of input.evidence) {
    if (
      item.evidence.fact_id !== fact.id ||
      item.documentSourceId !== fact.authority_source_id
    )
      errors.push('evidence_authority_or_fact_mismatch');
    errors.push(...validateEvidence(item.evidence, item.version));
  }
  return [...new Set(errors)];
}
