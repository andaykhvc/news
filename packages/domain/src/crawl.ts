import { z } from 'zod';
import { idSchema, keySchema, metadataSchema, timestampSchema } from './common';

export const crawlStatusSchema = z.enum([
  'queued',
  'running',
  'success',
  'partial',
  'failed',
]);
export const crawlStatisticsSchema = z.object({
  documents_discovered: z.number().int().nonnegative(),
  documents_fetched: z.number().int().nonnegative(),
  documents_changed: z.number().int().nonnegative(),
  errors_count: z.number().int().nonnegative(),
});
export const crawlRunSchema = crawlStatisticsSchema.extend({
  id: idSchema,
  source_endpoint_id: idSchema,
  started_at: timestampSchema,
  finished_at: timestampSchema.nullable(),
  status: crawlStatusSchema,
  metadata: metadataSchema,
});
export const crawlErrorSchema = z.object({
  id: idSchema,
  crawl_run_id: idSchema,
  source_endpoint_id: idSchema,
  url: z.string().nullable(),
  error_type: keySchema,
  message: z.string().min(1),
  retryable: z.boolean(),
  created_at: timestampSchema,
  metadata: metadataSchema,
});
export type CrawlRun = z.infer<typeof crawlRunSchema>;
export type CrawlError = z.infer<typeof crawlErrorSchema>;
export type CrawlStatistics = z.infer<typeof crawlStatisticsSchema>;
