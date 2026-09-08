import { describe, expect, it } from 'vitest';
import {
  factSchema,
  factValueSchema,
  evidenceLocatorSchema,
  documentVersionSchema,
  type Fact,
} from '../packages/domain/src/index';
import {
  validateEvidence,
  validateFactPublication,
} from '../packages/validation/src/index';
import { source } from './helpers';

export const fact: Fact = {
  id: crypto.randomUUID(),
  subject_entity_id: crypto.randomUUID(),
  predicate: 'application.deadline',
  value: { type: 'date', value: '2026-09-12' },
  unit: null,
  authority_source_id: source.id,
  topic_id: null,
  status: 'verified',
  published_at: null,
  effective_at: null,
  valid_from: '2026-01-01T00:00:00Z',
  valid_until: '2027-01-01T00:00:00Z',
  verified_at: '2026-09-08T00:00:00Z',
  superseded_at: null,
  superseded_by_fact_id: null,
  reference_period: '2026',
  created_at: '2026-09-08T00:00:00Z',
  updated_at: '2026-09-08T00:00:00Z',
};
describe('typed fact values and temporal truth', () => {
  it.each([
    { type: 'date', value: '2026-09-12' },
    { type: 'date_range', start: '2026-09-10', end: '2026-09-12' },
    { type: 'money', amount: '1234.50', currency: 'TRY' },
    { type: 'number', value: 12.5 },
    { type: 'boolean', value: true },
    { type: 'status', value: 'open' },
    { type: 'string', value: 'Example' },
    { type: 'url', value: 'https://fixture.gov.tr/' },
    {
      type: 'json',
      schema_key: 'requirements.v1',
      value: { required: ['test'] },
    },
  ])('accepts $type', (value) =>
    expect(factValueSchema.safeParse(value).success).toBe(true),
  );
  it.each([
    { type: 'date', value: '2026-02-30' },
    { type: 'date_range', start: '2026-09-12', end: '2026-09-10' },
    { type: 'money', amount: 12.5, currency: 'TRY' },
    { type: 'money', amount: '12,50', currency: 'TRY' },
    { type: 'boolean', value: 'true' },
    { type: 'number', value: Infinity },
    { type: 'date', value: '2026-09-12', surprise: true },
  ])('rejects malformed value %#', (value) =>
    expect(factValueSchema.safeParse(value).success).toBe(false),
  );
  it('accepts a complete fact', () =>
    expect(factSchema.safeParse(fact).success).toBe(true));
  it('rejects reversed validity and unverified publication', () => {
    expect(
      factSchema.safeParse({ ...fact, valid_until: fact.valid_from }).success,
    ).toBe(false);
    expect(
      factSchema.safeParse({ ...fact, status: 'published', verified_at: null })
        .success,
    ).toBe(false);
  });
  it('requires a timestamp for supersession and rejects self replacement', () => {
    expect(
      factSchema.safeParse({ ...fact, status: 'superseded' }).success,
    ).toBe(false);
    expect(
      factSchema.safeParse({ ...fact, superseded_by_fact_id: fact.id }).success,
    ).toBe(false);
  });
});

describe('evidence and publication prerequisites', () => {
  const version = documentVersionSchema.parse({
    id: crypto.randomUUID(),
    document_id: crypto.randomUUID(),
    content_hash: 'a'.repeat(64),
    normalization_version: 'v1',
    title: 'Synthetic',
    raw_text: 'Prefix: deadline 12 September.',
    normalized_text: 'Prefix: deadline 12 September.',
    mime_type: 'text/plain',
    fetched_at: fact.created_at,
    published_at: null,
    metadata: {},
  });
  const evidence = {
    id: crypto.randomUUID(),
    fact_id: fact.id,
    document_version_id: version.id,
    evidence_text: 'deadline 12 September',
    evidence_locator: {
      representation: 'raw_text' as const,
      character_start: 8,
      character_end: 29,
    },
    created_at: fact.created_at,
  };
  // JS offsets are UTF-16 code units, end-exclusive, and always target preserved raw_text.
  evidence.evidence_locator.character_end = 8 + evidence.evidence_text.length;
  const input = {
    fact,
    source,
    asOf: '2026-09-08T12:00:00Z',
    expectedReferencePeriod: '2026',
    evidence: [{ evidence, version, documentSourceId: source.id }],
  };
  it('checks exact quotes and offsets', () => {
    expect(validateEvidence(evidence, version)).toEqual([]);
    expect(
      validateEvidence({ ...evidence, evidence_text: 'invented' }, version),
    ).toContain('evidence_not_found_in_raw_text');
  });
  it('rejects incomplete offsets', () =>
    expect(
      evidenceLocatorSchema.safeParse({
        representation: 'raw_text',
        character_start: 1,
      }).success,
    ).toBe(false));
  it('allows verified evidence with explicit temporal scope', () =>
    expect(validateFactPublication(input)).toEqual([]));
  it('blocks prior-year facts, missing evidence and expired claims', () => {
    expect(
      validateFactPublication({ ...input, expectedReferencePeriod: '2027' }),
    ).toContain('reference_period_mismatch');
    expect(validateFactPublication({ ...input, evidence: [] })).toContain(
      'missing_evidence',
    );
    expect(
      validateFactPublication({ ...input, asOf: '2027-01-01T00:00:00Z' }),
    ).toContain('validity_expired');
  });
  it('blocks future effectiveness and revoked facts', () => {
    expect(
      validateFactPublication({
        ...input,
        fact: { ...fact, effective_at: '2026-10-01T00:00:00Z' },
      }),
    ).toContain('not_yet_effective');
    expect(
      validateFactPublication({
        ...input,
        fact: { ...fact, status: 'revoked' },
      }),
    ).toContain('fact_not_verified');
  });
});
