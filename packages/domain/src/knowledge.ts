import { z } from 'zod';
import { idSchema, keySchema, timestampSchema, timestamps } from './common';

export const topicSchema = z.object({
  id: idSchema,
  key: keySchema,
  name: z.string().min(1),
  parent_id: idSchema.nullable(),
  ...timestamps,
});
export const entitySchema = z.object({
  id: idSchema,
  key: keySchema,
  name: z.string().min(1),
  entity_type: keySchema,
  ...timestamps,
});
export const authorityRuleSchema = z.object({
  id: idSchema,
  topic_id: idSchema,
  predicate: keySchema,
  subject_entity_id: idSchema.nullable(),
  source_id: idSchema,
  valid_from: timestampSchema.nullable(),
  valid_until: timestampSchema.nullable(),
  status: z.enum(['candidate', 'active', 'disabled']),
  ...timestamps,
});
export const answerStatusSchema = z.enum([
  'unverified',
  'verified',
  'uncertain',
  'outdated',
  'withdrawn',
]);
export const answerPageSchema = z.object({
  id: idSchema,
  slug: keySchema,
  topic_id: idSchema.nullable(),
  canonical_question: z.string().min(1),
  answer_status: answerStatusSchema,
  last_verified_at: timestampSchema.nullable(),
  ...timestamps,
});
export const answerFactSchema = z.object({
  answer_page_id: idSchema,
  fact_id: idSchema,
  position: z.number().int().nonnegative(),
});
export const answerSourceSchema = z.object({
  answer_page_id: idSchema,
  source_id: idSchema,
});
export type Topic = z.infer<typeof topicSchema>;
export type Entity = z.infer<typeof entitySchema>;
export type AuthorityRule = z.infer<typeof authorityRuleSchema>;
export type AnswerPage = z.infer<typeof answerPageSchema>;
