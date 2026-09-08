import { z } from 'zod';
import {
  contentHashSchema,
  idSchema,
  persistedOutcomeSchema,
  timestampSchema,
  type CrawlError,
  type CrawlRun,
  type CrawlStatistics,
  type SourceRegistry,
} from '@sak/domain';
import { parsedDocumentSchema } from '@sak/source-sdk';

export const persistDocumentInputSchema = z.object({
  source_id: idSchema,
  source_endpoint_id: idSchema,
  crawl_run_id: idSchema,
  external_identifier: z.string().nullable(),
  fetched_at: timestampSchema,
  mime_type: z.string().min(1),
  parsed: parsedDocumentSchema,
  normalized_text: z.string().min(1),
  content_hash: contentHashSchema,
  normalization_version: z.literal('v1'),
});
export const persistDocumentResultSchema = z.object({
  outcome: persistedOutcomeSchema,
  document_id: idSchema,
  version_id: idSchema,
});
export type PersistDocumentInput = z.infer<typeof persistDocumentInputSchema>;
export type PersistDocumentResult = z.infer<typeof persistDocumentResultSchema>;
export interface SourceRepository {
  getRegistry(): Promise<SourceRegistry>;
  markSuccessfulCheck(endpointId: string, checkedAt: string): Promise<void>;
}
export interface DocumentRepository {
  /** Atomically compares the CURRENT version, saves immutable content, and records an observation. */
  persist(input: PersistDocumentInput): Promise<PersistDocumentResult>;
}
export interface CrawlRepository {
  start(endpointId: string, startedAt: string): Promise<CrawlRun>;
  recordError(error: Omit<CrawlError, 'id'>): Promise<void>;
  finish(
    id: string,
    status: 'success' | 'partial' | 'failed',
    statistics: CrawlStatistics,
    finishedAt: string,
  ): Promise<void>;
}
export interface IngestionRepositories {
  sources: SourceRepository;
  documents: DocumentRepository;
  crawls: CrawlRepository;
}
