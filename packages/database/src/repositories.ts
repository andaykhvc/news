import { z } from 'zod';
import {
  allowedHostSchema,
  crawlRunSchema,
  factEvidenceSchema,
  factSchema,
  sourceEndpointSchema,
  sourceSchema,
  type Fact,
  type FactEvidence,
} from '@sak/domain';
import {
  persistDocumentInputSchema,
  persistDocumentResultSchema,
  type IngestionRepositories,
} from '@sak/ingestion';
import type { DatabaseClient } from './client';

/**
 * `postgres` serializes object parameters as JSON values. Passing a pre-encoded
 * JSON string would instead become a JSON *string* (for example `"{}"`), which
 * violates the object-only JSONB columns in the schema.
 */
const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as unknown;

export interface FactRepository {
  findById(id: string): Promise<Fact | null>;
  listEvidence(factId: string): Promise<FactEvidence[]>;
  saveDraft(fact: Fact): Promise<void>;
  addEvidence(evidence: FactEvidence): Promise<void>;
}

export function createRepositories(
  client: DatabaseClient,
): IngestionRepositories & { facts: FactRepository } {
  return {
    sources: {
      async getRegistry() {
        const [sources, hosts, endpoints] = await Promise.all([
          client.query('select * from sources order by id'),
          client.query('select * from allowed_hosts order by id'),
          client.query('select * from source_endpoints order by id'),
        ]);
        return {
          sources: z.array(sourceSchema).parse(sources),
          hosts: z.array(allowedHostSchema).parse(hosts),
          endpoints: z.array(sourceEndpointSchema).parse(endpoints),
        };
      },
      async markSuccessfulCheck(id, at) {
        // Concurrent older runs may finish last; keep this timestamp monotonic.
        await client.query(
          'update source_endpoints set last_successful_check_at=$2::timestamptz,updated_at=$2::timestamptz where id=$1::uuid and (last_successful_check_at is null or last_successful_check_at<$2::timestamptz)',
          [id, at],
        );
      },
    },
    documents: {
      async persist(input) {
        const payload = persistDocumentInputSchema.parse(input);
        return persistDocumentResultSchema.parse(
          (
            await client.query<{ result: unknown }>(
              'select persist_ingested_document($1::jsonb) result',
              [json(payload)],
            )
          )[0]?.result,
        );
      },
    },
    crawls: {
      async start(endpointId, at) {
        return crawlRunSchema.parse(
          (
            await client.query(
              "insert into crawl_runs(source_endpoint_id,started_at,status) values($1::uuid,$2::timestamptz,'running') returning *",
              [endpointId, at],
            )
          )[0],
        );
      },
      async recordError(error) {
        await client.query(
          'insert into crawl_errors(crawl_run_id,source_endpoint_id,url,error_type,message,retryable,created_at,metadata) values($1::uuid,$2::uuid,$3,$4,$5,$6,$7::timestamptz,$8::jsonb)',
          [
            error.crawl_run_id,
            error.source_endpoint_id,
            error.url,
            error.error_type,
            error.message,
            error.retryable,
            error.created_at,
            json(error.metadata),
          ],
        );
      },
      async finish(id, status, statistics, at) {
        const result = await client.query<{ id: string }>(
          'update crawl_runs set documents_discovered=$2,documents_fetched=$3,documents_changed=$4,errors_count=$5,status=$6,finished_at=$7::timestamptz where id=$1::uuid returning id',
          [
            id,
            statistics.documents_discovered,
            statistics.documents_fetched,
            statistics.documents_changed,
            statistics.errors_count,
            status,
            at,
          ],
        );
        if (!result[0]) throw new Error('Crawl run not found');
      },
    },
    facts: {
      async findById(id) {
        return factSchema
          .nullable()
          .parse(
            (
              await client.query('select * from facts where id=$1::uuid', [id])
            )[0] ?? null,
          );
      },
      async listEvidence(factId) {
        return z
          .array(factEvidenceSchema)
          .parse(
            await client.query(
              'select * from fact_evidence where fact_id=$1::uuid order by id',
              [factId],
            ),
          );
      },
      async saveDraft(input) {
        const fact = factSchema.parse(input);
        if (fact.status !== 'draft')
          throw new Error('Only draft creation is enabled in the foundation');
        await client.query(
          'insert into facts(id,subject_entity_id,predicate,value,unit,authority_source_id,topic_id,status,published_at,effective_at,valid_from,valid_until,verified_at,superseded_at,superseded_by_fact_id,reference_period,created_at,updated_at) values($1::uuid,$2::uuid,$3,$4::jsonb,$5,$6::uuid,$7::uuid,$8,$9::timestamptz,$10::timestamptz,$11::timestamptz,$12::timestamptz,$13::timestamptz,$14::timestamptz,$15::uuid,$16,$17::timestamptz,$18::timestamptz)',
          [
            fact.id,
            fact.subject_entity_id,
            fact.predicate,
            json(fact.value),
            fact.unit,
            fact.authority_source_id,
            fact.topic_id,
            fact.status,
            fact.published_at,
            fact.effective_at,
            fact.valid_from,
            fact.valid_until,
            fact.verified_at,
            fact.superseded_at,
            fact.superseded_by_fact_id,
            fact.reference_period,
            fact.created_at,
            fact.updated_at,
          ],
        );
      },
      async addEvidence(input) {
        const evidence = factEvidenceSchema.parse(input);
        await client.query(
          'insert into fact_evidence(id,fact_id,document_version_id,evidence_text,evidence_locator,created_at) values($1::uuid,$2::uuid,$3::uuid,$4,$5::jsonb,$6::timestamptz)',
          [
            evidence.id,
            evidence.fact_id,
            evidence.document_version_id,
            evidence.evidence_text,
            json(evidence.evidence_locator),
            evidence.created_at,
          ],
        );
      },
    },
  };
}
