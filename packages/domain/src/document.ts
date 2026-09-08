import { z } from 'zod';
import {
  httpUrlSchema,
  idSchema,
  keySchema,
  metadataSchema,
  timestampSchema,
} from './common';

export const contentHashSchema = z.string().regex(/^[a-f0-9]{64}$/);
export const documentSchema = z.object({
  id: idSchema,
  source_id: idSchema,
  source_endpoint_id: idSchema,
  canonical_url: httpUrlSchema,
  external_identifier: z.string().nullable(),
  title: z.string().min(1),
  document_type: keySchema,
  first_seen_at: timestampSchema,
  latest_seen_at: timestampSchema,
  published_at: timestampSchema.nullable(),
  current_version_id: idSchema.nullable(),
  status: z.enum(['active', 'withdrawn', 'archived']),
});
export const documentVersionSchema = z.object({
  id: idSchema,
  document_id: idSchema,
  content_hash: contentHashSchema,
  normalization_version: z.literal('v1'),
  title: z.string().min(1),
  raw_text: z.string().min(1),
  normalized_text: z.string().min(1),
  mime_type: z.string().min(1),
  fetched_at: timestampSchema,
  published_at: timestampSchema.nullable(),
  metadata: metadataSchema,
});
export const parsedAttachmentSchema = z.object({
  url: httpUrlSchema,
  mime_type: z.string().nullable(),
  filename: z.string().nullable(),
});
export const documentAttachmentSchema = parsedAttachmentSchema.extend({
  id: idSchema,
  document_id: idSchema,
  parent_document_version_id: idSchema,
  content_hash: contentHashSchema.nullable(),
  status: z.enum(['discovered', 'fetched', 'parsed', 'failed', 'unsupported']),
  metadata: metadataSchema,
});
export const persistedOutcomeSchema = z.enum([
  'new_document',
  'new_version',
  'unchanged',
]);
export const documentObservationSchema = z.object({
  id: idSchema,
  document_id: idSchema,
  document_version_id: idSchema,
  crawl_run_id: idSchema,
  source_endpoint_id: idSchema,
  observed_at: timestampSchema,
  outcome: persistedOutcomeSchema,
});
export type Document = z.infer<typeof documentSchema>;
export type DocumentVersion = z.infer<typeof documentVersionSchema>;
export type DocumentAttachment = z.infer<typeof documentAttachmentSchema>;
export type DocumentObservation = z.infer<typeof documentObservationSchema>;
export type PersistedOutcome = z.infer<typeof persistedOutcomeSchema>;
