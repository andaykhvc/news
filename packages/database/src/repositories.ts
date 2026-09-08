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

function checked<T>(result: { data: T; error: { message: string } | null }): T {
  if (result.error)
    throw new Error(`Database operation failed: ${result.error.message}`);
  return result.data;
}

export interface FactRepository {
  findById(id: string): Promise<Fact | null>;
  listEvidence(factId: string): Promise<FactEvidence[]>;
  saveDraft(fact: Fact): Promise<void>;
  addEvidence(evidence: FactEvidence): Promise<void>;
}

export function createRepositories(
  client: DatabaseClient,
): IngestionRepositories & { facts: FactRepository } {
  // Paginate explicitly: the Data API normally caps responses at 1,000 rows.
  async function loadPages<T>(
    load: (from: number, to: number) => Promise<T[]>,
  ): Promise<T[]> {
    const rows: T[] = [];
    for (let offset = 0; ; offset += 500) {
      const page = await load(offset, offset + 499);
      rows.push(...page);
      if (page.length < 500) return rows;
    }
  }
  return {
    sources: {
      async getRegistry() {
        const [sources, hosts, endpoints] = await Promise.all([
          loadPages(async (from, to) =>
            z
              .array(sourceSchema)
              .parse(
                checked(
                  await client
                    .from('sources')
                    .select('*')
                    .order('id')
                    .range(from, to),
                ),
              ),
          ),
          loadPages(async (from, to) =>
            z
              .array(allowedHostSchema)
              .parse(
                checked(
                  await client
                    .from('allowed_hosts')
                    .select('*')
                    .order('id')
                    .range(from, to),
                ),
              ),
          ),
          loadPages(async (from, to) =>
            z
              .array(sourceEndpointSchema)
              .parse(
                checked(
                  await client
                    .from('source_endpoints')
                    .select('*')
                    .order('id')
                    .range(from, to),
                ),
              ),
          ),
        ]);
        return { sources, hosts, endpoints };
      },
      async markSuccessfulCheck(id, at) {
        // Concurrent older runs may finish last; keep this timestamp monotonic.
        checked(
          await client
            .from('source_endpoints')
            .update({ last_successful_check_at: at, updated_at: at })
            .eq('id', id)
            .or(
              `last_successful_check_at.is.null,last_successful_check_at.lt.${at}`,
            ),
        );
      },
    },
    documents: {
      async persist(input) {
        const payload = persistDocumentInputSchema.parse(input);
        return persistDocumentResultSchema.parse(
          checked(
            await client.rpc('persist_ingested_document', { p_input: payload }),
          ),
        );
      },
    },
    crawls: {
      async start(endpointId, at) {
        return crawlRunSchema.parse(
          checked(
            await client
              .from('crawl_runs')
              .insert({
                source_endpoint_id: endpointId,
                started_at: at,
                status: 'running',
              })
              .select('*')
              .single(),
          ),
        );
      },
      async recordError(error) {
        checked(await client.from('crawl_errors').insert(error));
      },
      async finish(id, status, statistics, at) {
        checked(
          await client
            .from('crawl_runs')
            .update({ ...statistics, status, finished_at: at })
            .eq('id', id)
            .select('id')
            .single(),
        );
      },
    },
    facts: {
      async findById(id) {
        return factSchema
          .nullable()
          .parse(
            checked(
              await client.from('facts').select('*').eq('id', id).maybeSingle(),
            ),
          );
      },
      async listEvidence(factId) {
        return loadPages(async (from, to) =>
          z
            .array(factEvidenceSchema)
            .parse(
              checked(
                await client
                  .from('fact_evidence')
                  .select('*')
                  .eq('fact_id', factId)
                  .order('id')
                  .range(from, to),
              ),
            ),
        );
      },
      async saveDraft(input) {
        const fact = factSchema.parse(input);
        if (fact.status !== 'draft')
          throw new Error('Only draft creation is enabled in the foundation');
        checked(await client.from('facts').insert(fact));
      },
      async addEvidence(input) {
        checked(
          await client
            .from('fact_evidence')
            .insert(factEvidenceSchema.parse(input)),
        );
      },
    },
  };
}
