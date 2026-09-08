import { sourceRegistrySchema, type SourceRegistry } from '@sak/domain';
import { isGovernmentHostname, validateSourceUrl } from './url';

export function validateSourceRegistry(input: unknown): SourceRegistry {
  const registry = sourceRegistrySchema.parse(input);
  const assertUnique = (values: string[], label: string) => {
    if (new Set(values).size !== values.length)
      throw new Error(`Duplicate registry ${label}`);
  };
  assertUnique(
    registry.sources.map((s) => s.id),
    'source id',
  );
  assertUnique(
    registry.sources.map((s) => s.slug),
    'source slug',
  );
  assertUnique(
    registry.hosts.map((h) => h.id),
    'host id',
  );
  assertUnique(
    registry.hosts.map((h) => `${h.source_id}:${h.hostname}`),
    'hostname',
  );
  assertUnique(
    registry.endpoints.map((e) => e.id),
    'endpoint id',
  );
  assertUnique(
    registry.endpoints.map((e) => `${e.source_id}:${e.slug}`),
    'endpoint slug',
  );
  const sources = new Map(registry.sources.map((s) => [s.id, s]));
  for (const host of registry.hosts) {
    if (!sources.has(host.source_id)) throw new Error('Orphaned allowed host');
    if (!isGovernmentHostname(host.hostname))
      throw new Error('Only gov.tr hosts can be registered');
  }
  for (const endpoint of registry.endpoints) {
    const source = sources.get(endpoint.source_id);
    if (!source) throw new Error('Orphaned source endpoint');
    // Even candidate endpoints must name a registered host; they remain unusable until activated.
    const hosts = registry.hosts.map((h) => ({
      ...h,
      status: 'active' as const,
    }));
    if (!validateSourceUrl(endpoint.base_url, endpoint.source_id, hosts).ok)
      throw new Error('Endpoint URL is outside the source host registry');
    if (
      endpoint.status === 'active' &&
      (source.status !== 'active' ||
        !validateSourceUrl(
          endpoint.base_url,
          endpoint.source_id,
          registry.hosts,
        ).ok)
    )
      throw new Error('Active endpoint requires an active source and host');
  }
  return registry;
}
