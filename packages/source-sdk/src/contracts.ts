import { z } from 'zod';
import {
  httpUrlSchema,
  keySchema,
  metadataSchema,
  parsedAttachmentSchema,
  timestampSchema,
  type Coverage,
  type Source,
  type SourceEndpoint,
} from '@sak/domain';
import type { Logger, Result } from '@sak/shared';

export interface AdapterError {
  type:
    | 'discovery_failed'
    | 'fetch_failed'
    | 'parse_failed'
    | 'invalid_document'
    | 'source_validation_failed';
  message: string;
  retryable: boolean;
  retry_after_ms?: number;
}
export type AdapterResult<T> = Result<T, AdapterError>;
export const discoveredDocumentSchema = z.object({
  url: httpUrlSchema,
  external_identifier: z.string().nullable(),
});
export const fetchedDocumentSchema = z.object({
  requested_url: httpUrlSchema,
  final_url: httpUrlSchema,
  body: z.string().min(1),
  body_base64: z.string().optional(),
  mime_type: z.string().min(1),
  fetched_at: timestampSchema,
});
export const parsedDocumentSchema = z.object({
  canonical_url: httpUrlSchema,
  title: z.string().trim().min(1),
  document_type: keySchema,
  raw_text: z.string().min(1),
  published_at: timestampSchema.nullable(),
  attachments: z.array(parsedAttachmentSchema),
  metadata: metadataSchema,
});
export type DiscoveredDocument = z.infer<typeof discoveredDocumentSchema>;
export type FetchedDocument = z.infer<typeof fetchedDocumentSchema>;
export type ParsedDocument = z.infer<typeof parsedDocumentSchema>;

export interface HttpClient {
  get(
    url: string,
    signal?: AbortSignal,
  ): Promise<AdapterResult<FetchedDocument>>;
}
export interface AdapterContext {
  readonly source: Source;
  readonly endpoint: SourceEndpoint;
  readonly http: HttpClient;
  readonly logger: Logger;
  readonly signal: AbortSignal;
}
export type DiscoveryContext = AdapterContext;
export type FetchContext = AdapterContext;
export type ParseContext = Pick<
  AdapterContext,
  'source' | 'endpoint' | 'logger' | 'signal'
>;

// Adapters are trusted code, but receive no persistence client and own no retries.
// HTML adapters may use Cheerio; a browser transport can implement HttpClient later.
export interface SourceAdapter {
  readonly sourceKey: string;
  getCoverage?(): Coverage | null;
  discover(
    context: DiscoveryContext,
  ): Promise<AdapterResult<DiscoveredDocument[]>>;
  fetch(
    document: DiscoveredDocument,
    context: FetchContext,
  ): Promise<AdapterResult<FetchedDocument>>;
  parse(
    document: FetchedDocument,
    context: ParseContext,
  ): Promise<AdapterResult<ParsedDocument>>;
}
