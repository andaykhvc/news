import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { Database } from './types';

export const databaseEnvironmentSchema = z.object({
  SUPABASE_URL: z.url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
});
export function createDatabaseClient(environment: unknown) {
  if (typeof window !== 'undefined')
    throw new Error('The database client is server-only');
  const config = databaseEnvironmentSchema.parse(environment);
  return createClient<Database>(
    config.SUPABASE_URL,
    config.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    },
  );
}
export type DatabaseClient = ReturnType<typeof createDatabaseClient>;
