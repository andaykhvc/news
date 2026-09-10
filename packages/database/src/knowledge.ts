import { documentSchema, documentVersionSchema, type Json } from '@sak/domain';
import type { KnowledgeRepository } from '@sak/ingestion';
import type { DatabaseClient } from './client';
const json = (value: unknown): Json =>
  JSON.parse(JSON.stringify(value)) as Json;
export function createKnowledgeRepository(
  client: DatabaseClient,
): KnowledgeRepository {
  return {
    async getVersion(id) {
      const version = documentVersionSchema.parse(
        (
          await client.query(
            'select * from document_versions where id=$1::uuid',
            [id],
          )
        )[0],
      );
      const document = documentSchema.parse(
        (
          await client.query('select * from documents where id=$1::uuid', [
            version.document_id,
          ])
        )[0],
      );
      return { document, version };
    },
    async hasExtraction(key) {
      return (
        (
          await client.query(
            "select id from extraction_attempts where idempotency_key=$1 and status='completed' limit 1",
            [key],
          )
        ).length > 0
      );
    },
    async recordExtraction(record) {
      try {
        await client.query('select record_extraction($1::jsonb)', [
          json(record),
        ]);
      } catch (cause) {
        const error =
          'database_validation_failed: ' +
          (cause instanceof Error ? cause.message : 'unknown');
        await client.query('select record_extraction($1::jsonb)', [
          json({
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
        ]);
        throw new Error(error, { cause });
      }
    },
    async archive(input) {
      await client.query('select archive_source_response($1::jsonb)', [
        json(input),
      ]);
    },
    async recordCoverage(runId, coverage) {
      await client.query(
        'insert into source_coverage(crawl_run_id,checked_at,scope,complete,pages,discovered,reasons) values($1::uuid,$2::timestamptz,$3,$4,$5::jsonb,$6,$7::jsonb)',
        [
          runId,
          coverage.checked_at,
          coverage.scope,
          coverage.complete,
          json(coverage.pages),
          coverage.discovered,
          json(coverage.reasons),
        ],
      );
    },
    async recentCoverage(endpointId) {
      return (
        await client.query<{
          documents_discovered: number;
          status: string;
        }>(
          'select documents_discovered,status from crawl_runs where source_endpoint_id=$1::uuid order by started_at desc limit 10',
          [endpointId],
        )
      ).map((r) => ({ count: r.documents_discovered, status: r.status }));
    },
  };
}
