import { sourceRegistrySchema } from '@sak/domain';
import registry from '../../../sources/registry.json';

/** Candidate bootstrap data; live worker jobs always reload the database registry. */
export const initialSourceRegistry = sourceRegistrySchema.parse(registry);
