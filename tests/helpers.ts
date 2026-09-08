import { sourceRegistrySchema } from '../packages/domain/src/index';
import { createJsonLogger } from '../packages/shared/src/index';
import fixture from '../sources/fixtures/offline-demo.json';

export const registry = sourceRegistrySchema.parse(fixture.registry);
export const source = registry.sources[0]!;
export const endpoint = registry.endpoints[0]!;
export const host = registry.hosts[0]!;
export const documentFixture = fixture.document;
export const silentLogger = createJsonLogger(() => {});
export const offlineHttp = {
  async get(): Promise<never> {
    throw new Error('Unexpected HTTP in fixture test');
  },
};
