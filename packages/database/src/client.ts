import postgres from 'postgres';
import { z } from 'zod';

export const databaseEnvironmentSchema = z.object({
  DATABASE_URL: z
    .string()
    .url()
    .refine((value) => /^postgres(?:ql)?:\/\//.test(value), {
      message: 'DATABASE_URL must be a PostgreSQL connection URL',
    }),
});

type Row = Record<string, unknown>;

function normalize(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        normalize(item),
      ]),
    );
  return value;
}

export interface DatabaseClient {
  query<T extends Row = Row>(
    statement: string,
    parameters?: readonly unknown[],
  ): Promise<T[]>;
  end(): Promise<void>;
}

const clients = new Map<string, DatabaseClient>();

export function createDatabaseClient(environment: unknown) {
  if (typeof window !== 'undefined')
    throw new Error('The database client is server-only');
  const config = databaseEnvironmentSchema.parse(environment);
  const existing = clients.get(config.DATABASE_URL);
  if (existing) return existing;
  // One pooled connection per server instance keeps Vercel function connection
  // counts bounded and works with transaction-pooling providers.
  const sql = postgres(config.DATABASE_URL, {
    max: 1,
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: false,
  });
  const client: DatabaseClient = {
    async query<T extends Row>(
      statement: string,
      parameters: readonly unknown[] = [],
    ) {
      const rows = await sql.unsafe(statement, parameters as never[]);
      return normalize(rows) as T[];
    },
    async end() {
      clients.delete(config.DATABASE_URL);
      await sql.end({ timeout: 5 });
    },
  };
  clients.set(config.DATABASE_URL, client);
  return client;
}
