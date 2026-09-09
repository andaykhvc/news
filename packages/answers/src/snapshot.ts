import { z } from 'zod';
import {
  sourceSchema,
  factCandidateSchema,
  validationDecisionSchema,
  allowedHostSchema,
  sourceEndpointSchema,
  factSchema,
  documentSchema,
  documentVersionSchema,
  factEvidenceSchema,
  authorityRuleSchema,
  entitySchema,
  topicSchema,
} from '@sak/domain';
export const sourceCheckSchema = z.object({
  endpoint_id: z.string().uuid(),
  checked_at: z.string().nullable(),
  successful_at: z.string().nullable(),
  status: z.string(),
  scope: z.string(),
  complete: z.boolean(),
  pages: z.array(z.string()),
  reasons: z.array(z.string()),
  extraction_complete: z.boolean(),
});
export const answerSnapshotSchema = z.object({
  sources: z.array(sourceSchema),
  hosts: z.array(allowedHostSchema),
  endpoints: z.array(sourceEndpointSchema),
  entities: z.array(entitySchema),
  topics: z.array(topicSchema),
  rules: z.array(authorityRuleSchema),
  facts: z.array(factSchema),
  documents: z.array(documentSchema),
  versions: z.array(documentVersionSchema),
  evidence: z.array(factEvidenceSchema),
  checks: z.array(sourceCheckSchema),
  validations: z.array(
    z.object({
      fact_id: z.string().uuid(),
      version_id: z.string().uuid(),
      candidate: factCandidateSchema,
      decision: validationDecisionSchema,
    }),
  ),
  history: z.array(
    z.object({
      fact_id: z.string().uuid(),
      at: z.string(),
      action: z.string(),
      reason: z.string(),
    }),
  ),
});
export type AnswerSnapshot = z.infer<typeof answerSnapshotSchema>;
export function emptySnapshot(): AnswerSnapshot {
  return {
    sources: [],
    hosts: [],
    endpoints: [],
    entities: [],
    topics: [],
    rules: [],
    facts: [],
    documents: [],
    versions: [],
    evidence: [],
    checks: [],
    validations: [],
    history: [],
  };
}
