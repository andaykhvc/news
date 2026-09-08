import type { z } from 'zod';
import type {
  sourceSchema,
  sourceEndpointSchema,
  allowedHostSchema,
  crawlRunSchema,
  crawlErrorSchema,
  documentSchema,
  documentVersionSchema,
  documentAttachmentSchema,
  documentObservationSchema,
  factSchema,
  factEvidenceSchema,
  topicSchema,
  entitySchema,
  authorityRuleSchema,
  answerPageSchema,
  answerFactSchema,
  answerSourceSchema,
  Json,
} from '@sak/domain';

// Explicit mapping layer: selected rows are also Zod-validated at runtime.
// Repository methods are the only public write surface; app code never receives this client.
type Table<Row> = {
  Row: Row;
  Insert: Partial<Row>;
  Update: Partial<Row>;
  Relationships: [];
};
export interface Database {
  public: {
    Tables: {
      sources: Table<z.infer<typeof sourceSchema>>;
      source_endpoints: Table<z.infer<typeof sourceEndpointSchema>>;
      allowed_hosts: Table<z.infer<typeof allowedHostSchema>>;
      crawl_runs: Table<z.infer<typeof crawlRunSchema>>;
      crawl_errors: Table<z.infer<typeof crawlErrorSchema>>;
      documents: Table<z.infer<typeof documentSchema>>;
      document_versions: Table<z.infer<typeof documentVersionSchema>>;
      document_attachments: Table<z.infer<typeof documentAttachmentSchema>>;
      document_observations: Table<z.infer<typeof documentObservationSchema>>;
      facts: Table<z.infer<typeof factSchema>>;
      fact_evidence: Table<z.infer<typeof factEvidenceSchema>>;
      topics: Table<z.infer<typeof topicSchema>>;
      entities: Table<z.infer<typeof entitySchema>>;
      authority_rules: Table<z.infer<typeof authorityRuleSchema>>;
      answer_pages: Table<z.infer<typeof answerPageSchema>>;
      answer_facts: Table<z.infer<typeof answerFactSchema>>;
      answer_sources: Table<z.infer<typeof answerSourceSchema>>;
    };
    Views: Record<string, never>;
    Functions: {
      persist_ingested_document: { Args: { p_input: Json }; Returns: Json };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
