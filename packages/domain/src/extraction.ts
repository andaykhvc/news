import { z } from 'zod';
import { idSchema, keySchema, timestampSchema } from './common';
import { factValueSchema } from './fact';

export const textBlockSchema = z.strictObject({
  kind: z.enum(['heading', 'paragraph', 'list_item', 'table_row', 'page']),
  start: z.number().int().nonnegative(),
  end: z.number().int().positive(),
  selector: z.string().nullable(),
  heading: z.string().nullable(),
  page: z.number().int().positive().nullable(),
});
export const structureSchema = z.strictObject({
  parser: z.string().min(1),
  blocks: z.array(textBlockSchema),
  warnings: z.array(z.string()),
  publication_date: z.string().nullable(),
});
export type TextStructure = z.infer<typeof structureSchema>;
// Models propose claims only. Authority, verification and publication are never model fields.
export const factCandidateSchema = z.strictObject({
  entity_key: keySchema,
  topic_key: keySchema,
  predicate: keySchema,
  value: factValueSchema,
  value_text: z.string().min(1).max(2000),
  unit: z.string().nullable(),
  reference_period: z.string().min(1).nullable(),
  evidence: z.strictObject({
    quote: z.string().min(1).max(12000),
    start: z.number().int().nonnegative(),
    end: z.number().int().positive(),
    page: z.number().int().positive().nullable(),
  }),
  correction_of: idSchema.nullable(),
});
export const extractionOutputSchema = z.strictObject({
  candidates: z.array(factCandidateSchema).max(100),
});
export type FactCandidate = z.infer<typeof factCandidateSchema>;
export const ontologySchema = z.strictObject({
  version: z.string(),
  entities: z.array(
    z.strictObject({
      key: keySchema,
      name: z.string(),
      aliases: z.array(z.string().min(1)),
      ambiguous_when: z.array(z.string()),
    }),
  ),
  topics: z.array(
    z.strictObject({
      key: keySchema,
      name: z.string(),
      parent: keySchema.nullable(),
    }),
  ),
  predicates: z.array(
    z.strictObject({
      key: keySchema,
      value_types: z.array(z.string()),
      cues: z.array(z.string().min(1)),
      unit: z.string().nullable(),
      lexicon: z.record(z.string(), z.array(z.string())),
    }),
  ),
  authorities: z.array(
    z.strictObject({
      source: keySchema,
      topic: keySchema,
      entity: keySchema,
      predicates: z.array(keySchema),
    }),
  ),
});
export type Ontology = z.infer<typeof ontologySchema>;
export const validationDecisionSchema = z.strictObject({
  status: z.enum(['verified', 'needs_review', 'rejected']),
  reasons: z.array(z.string()).min(1),
  validator_version: z.literal('grounding-v1'),
});
export type ValidationDecision = z.infer<typeof validationDecisionSchema>;
export const coverageSchema = z.strictObject({
  checked_at: timestampSchema,
  pages: z.array(z.string()),
  discovered: z.number().int().nonnegative(),
  scope: z.enum(['rolling_window', 'paginated_archive']),
  complete: z.boolean(),
  reasons: z.array(z.string()),
});
export type Coverage = z.infer<typeof coverageSchema>;
