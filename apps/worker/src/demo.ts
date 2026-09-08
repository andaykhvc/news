import { sourceRegistrySchema } from '@sak/domain';
import { createMemoryRepositories } from '@sak/database/testing';
import { createFixtureAdapter } from '@sak/source-sdk/testing';
import { createJsonLogger } from '@sak/shared';
import fixture from '../../../sources/fixtures/offline-demo.json';
import { executeJob } from './jobs';

export async function runDemo() {
  const registry = sourceRegistrySchema.parse(fixture.registry);
  const memory = createMemoryRepositories(registry);
  const logger = createJsonLogger();
  const endpoint = registry.endpoints[0];
  const source = registry.sources[0];
  if (!endpoint || !source) throw new Error('Missing demo fixture');
  for (const text of [
    fixture.document.parsed.raw_text,
    fixture.document.parsed.raw_text,
    'SYNTHETIC TEST ONLY — revised text.',
  ]) {
    const document = {
      ...fixture.document,
      parsed: { ...fixture.document.parsed, raw_text: text },
    };
    const report = await executeJob(
      { type: 'ingest_endpoint', endpointId: endpoint.id },
      {
        repositories: memory.repositories,
        adapters: new Map([
          [source.slug, createFixtureAdapter(source.slug, [document])],
        ]),
        httpForSource: () => ({
          async get() {
            throw new Error('Network is disabled in the offline demo');
          },
        }),
        logger,
      },
    );
    console.log(
      JSON.stringify({
        demo: true,
        outcomes: report.outcomes.map((o) => o.outcome),
        versions: memory.state.versions.size,
      }),
    );
  }
}
