import { z } from 'zod';
import {
  dateSchema,
  httpUrlSchema,
  idSchema,
  keySchema,
  timestampSchema,
  timestamps,
} from './common';

// Decimal strings preserve exact monetary values across JSON and PostgreSQL.
const decimalSchema = z.string().regex(/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/);
export const factValueSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('date'), value: dateSchema }),
  z.strictObject({ type: z.literal('datetime'), value: timestampSchema }),
  z
    .strictObject({
      type: z.literal('date_range'),
      start: dateSchema,
      end: dateSchema,
    })
    .refine((v) => v.start <= v.end, 'Date range is reversed'),
  z.strictObject({
    type: z.literal('money'),
    amount: decimalSchema,
    currency: z.string().regex(/^[A-Z]{3}$/),
  }),
  z.strictObject({ type: z.literal('number'), value: z.number().finite() }),
  z.strictObject({ type: z.literal('boolean'), value: z.boolean() }),
  z.strictObject({ type: z.literal('status'), value: keySchema }),
  z.strictObject({ type: z.literal('string'), value: z.string().min(1) }),
  z.strictObject({ type: z.literal('url'), value: httpUrlSchema }),
  z.strictObject({
    type: z.literal('json'),
    schema_key: keySchema,
    value: z.record(z.string(), z.json()),
  }),
]);
export const factStatusSchema = z.enum([
  'draft',
  'verified',
  'published',
  'superseded',
  'expired',
  'revoked',
  'needs_review',
]);
export const factSchema = z
  .object({
    id: idSchema,
    subject_entity_id: idSchema,
    predicate: keySchema,
    value: factValueSchema,
    unit: z.string().nullable(),
    authority_source_id: idSchema,
    topic_id: idSchema.nullable(),
    status: factStatusSchema,
    published_at: timestampSchema.nullable(),
    effective_at: timestampSchema.nullable(),
    valid_from: timestampSchema.nullable(),
    valid_until: timestampSchema.nullable(),
    verified_at: timestampSchema.nullable(),
    superseded_at: timestampSchema.nullable(),
    superseded_by_fact_id: idSchema.nullable(),
    // Explicit cycle label prevents a previous year's announcement being treated as current.
    reference_period: z.string().min(1).nullable(),
    ...timestamps,
  })
  .superRefine((fact, ctx) => {
    if (
      fact.valid_from &&
      fact.valid_until &&
      Date.parse(fact.valid_from) >= Date.parse(fact.valid_until)
    )
      ctx.addIssue({
        code: 'custom',
        message: 'Validity is a half-open interval [from, until)',
        path: ['valid_until'],
      });
    if (fact.superseded_by_fact_id === fact.id)
      ctx.addIssue({
        code: 'custom',
        message: 'A fact cannot supersede itself',
      });
    if (fact.status === 'superseded' && !fact.superseded_at)
      ctx.addIssue({
        code: 'custom',
        message: 'Superseded facts require superseded_at',
      });
    if (['verified', 'published'].includes(fact.status) && !fact.verified_at)
      ctx.addIssue({
        code: 'custom',
        message: 'Verification timestamp is required',
      });
  });
export const evidenceLocatorSchema = z
  .object({
    representation: z.literal('raw_text'),
    character_start: z.number().int().nonnegative().optional(),
    character_end: z.number().int().positive().optional(),
    page_number: z.number().int().positive().optional(),
    section_heading: z.string().min(1).optional(),
    dom_selector: z.string().min(1).optional(),
  })
  .superRefine((v, ctx) => {
    if (
      (v.character_start === undefined) !== (v.character_end === undefined) ||
      (v.character_start !== undefined &&
        v.character_end !== undefined &&
        v.character_end <= v.character_start)
    ) {
      ctx.addIssue({
        code: 'custom',
        message: 'Offsets must form a complete nonempty range',
      });
    }
  });
export const factEvidenceSchema = z.object({
  id: idSchema,
  fact_id: idSchema,
  document_version_id: idSchema,
  evidence_text: z.string().min(1),
  evidence_locator: evidenceLocatorSchema,
  created_at: timestampSchema,
});
export type FactValue = z.infer<typeof factValueSchema>;
export type Fact = z.infer<typeof factSchema>;
export type FactEvidence = z.infer<typeof factEvidenceSchema>;
