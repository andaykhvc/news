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
      source_artifacts: Table<{
        hash: string;
        bytes: string;
        byte_length: number;
        created_at: string;
      }>;
      source_responses: Table<{
        id: string;
        source_id: string;
        document_version_id: string | null;
        parent_version_id: string | null;
        artifact_hash: string;
        requested_url: string;
        final_url: string;
        mime_type: string;
        fetched_at: string;
        status: string;
        reasons: Json;
      }>;
      extraction_attempts: Table<{
        id: string;
        idempotency_key: string;
        document_version_id: string;
        provider: string;
        model: string;
        ontology_version: string;
        status: string;
        error: string | null;
        created_at: string;
      }>;
      candidate_validations: Table<{
        id: string;
        attempt_id: string;
        candidate_index: number;
        candidate: Json;
        decision: Json;
        fact_id: string | null;
        created_at: string;
      }>;
      source_coverage: Table<{
        crawl_run_id: string;
        checked_at: string;
        scope: string;
        complete: boolean;
        pages: Json;
        discovered: number;
        reasons: Json;
      }>;
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
      product_admin_snapshot: { Args: { p_before: string }; Returns: Json };
      product_snapshot: {
        Args: { p_entities: string[]; p_year: string };
        Returns: Json;
      };
      search_answer_resources: { Args: { p_query: string }; Returns: Json };
      consume_product_limit: {
        Args: { p_key: string; p_limit: number; p_seconds: number };
        Returns: boolean;
      };
      record_product_event: {
        Args: { p_kind: string; p_key: string };
        Returns: undefined;
      };
      claim_endpoint_job: { Args: Record<string, never>; Returns: Json };
      finish_endpoint_job: {
        Args: {
          p_endpoint: string;
          p_token: string;
          p_success: boolean;
          p_error: string;
        };
        Returns: boolean;
      };
      product_maintenance: { Args: Record<string, never>; Returns: undefined };
      review_product_fact: {
        Args: {
          p_id: string;
          p_expected_updated_at: string;
          p_action: string;
          p_reason: string;
          p_reviewer: string;
        };
        Returns: undefined;
      };
      archive_source_response: { Args: { p_input: Json }; Returns: undefined };
      record_extraction: { Args: { p_input: Json }; Returns: undefined };
      resolve_fact_correction: {
        Args: {
          p_old: string;
          p_new: string;
          p_reason: string;
          p_reviewer: string;
        };
        Returns: undefined;
      };
      persist_ingested_document: { Args: { p_input: Json }; Returns: Json };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
