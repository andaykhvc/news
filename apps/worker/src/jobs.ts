import { z } from 'zod';
import { idSchema } from '@sak/domain';
import { ingestEndpoint, type IngestionRepositories } from '@sak/ingestion';
import type { Logger } from '@sak/shared';
import type { HttpClient, SourceAdapter } from '@sak/source-sdk';
import { validateSourceRegistry } from '@sak/validation';

export const ingestionJobSchema = z.object({
  type: z.literal('ingest_endpoint'),
  endpointId: idSchema,
});
export async function executeJob(
  input: unknown,
  dependencies: {
    repositories: IngestionRepositories;
    adapters: ReadonlyMap<string, SourceAdapter>;
    httpForSource: (sourceId: string) => HttpClient;
    logger: Logger;
    signal?: AbortSignal;
  },
) {
  const job = ingestionJobSchema.parse(input);
  const registry = validateSourceRegistry(
    await dependencies.repositories.sources.getRegistry(),
  );
  const endpoint = registry.endpoints.find((e) => e.id === job.endpointId);
  const source = registry.sources.find((s) => s.id === endpoint?.source_id);
  if (!endpoint || !source)
    throw new Error('Source endpoint is not registered');
  const adapter = dependencies.adapters.get(source.slug);
  if (!adapter)
    throw new Error(`No adapter installed for source: ${source.slug}`);
  return ingestEndpoint({
    source,
    endpoint,
    hosts: registry.hosts.filter((h) => h.source_id === source.id),
    adapter,
    http: dependencies.httpForSource(source.id),
    repositories: dependencies.repositories,
    logger: dependencies.logger,
    ...(dependencies.signal ? { signal: dependencies.signal } : {}),
  });
}
