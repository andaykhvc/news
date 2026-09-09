import { documentSchema, documentVersionSchema, type Json } from '@sak/domain';
import type { KnowledgeRepository } from '@sak/ingestion';
import type { DatabaseClient } from './client';
function check<T>(result: { data: T; error: { message: string } | null }): T {
  if (result.error) throw new Error(result.error.message);
  return result.data;
}
const json = (value: unknown): Json =>
  JSON.parse(JSON.stringify(value)) as Json;
export function createKnowledgeRepository(
  client: DatabaseClient,
): KnowledgeRepository {
  return {
    async getVersion(id) {
      const version = documentVersionSchema.parse(
        check(
          await client
            .from('document_versions')
            .select('*')
            .eq('id', id)
            .single(),
        ),
      );
      const document = documentSchema.parse(
        check(
          await client
            .from('documents')
            .select('*')
            .eq('id', version.document_id)
            .single(),
        ),
      );
      return { document, version };
    },
    async hasExtraction(key) {
      return (
        (
          check(
            await client
              .from('extraction_attempts')
              .select('id')
              .eq('idempotency_key', key)
              .eq('status', 'completed')
              .limit(1),
          ) ?? []
        ).length > 0
      );
    },
    async recordExtraction(record) {
      const result = await client.rpc('record_extraction', {
        p_input: json(record),
      });
      if (result.error) {
        const error = 'database_validation_failed: ' + result.error.message;
        check(
          await client.rpc('record_extraction', {
            p_input: json({
              ...record,
              status: 'failed',
              error,
              results: record.results.map((r) => ({
                ...r,
                decision: {
                  status: 'needs_review',
                  validator_version: 'grounding-v1',
                  reasons: [error],
                },
              })),
            }),
          }),
        );
        throw new Error(error);
      }
    },
    async archive(input) {
      check(
        await client.rpc('archive_source_response', { p_input: json(input) }),
      );
    },
    async recordCoverage(runId, coverage) {
      check(
        await client.from('source_coverage').insert({
          crawl_run_id: runId,
          ...coverage,
          pages: json(coverage.pages),
          reasons: json(coverage.reasons),
        }),
      );
    },
    async recentCoverage(endpointId) {
      return (
        check(
          await client
            .from('crawl_runs')
            .select('documents_discovered,status')
            .eq('source_endpoint_id', endpointId)
            .order('started_at', { ascending: false })
            .limit(10),
        ) ?? []
      ).map((r) => ({ count: r.documents_discovered, status: r.status }));
    },
  };
}
