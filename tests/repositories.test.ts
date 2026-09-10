import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createRepositories } from '../packages/database/src/repositories';
import type { DatabaseClient } from '../packages/database/src/client';

describe('PostgreSQL repositories', () => {
  it('passes crawl error metadata as a JSON object, not a JSON-encoded string', async () => {
    let parameters: readonly unknown[] | undefined;
    const client: DatabaseClient = {
      async query(_statement, input = []) {
        parameters = input;
        return [];
      },
      async end() {},
    };

    await createRepositories(client).crawls.recordError({
      crawl_run_id: randomUUID(),
      source_endpoint_id: randomUUID(),
      url: null,
      error_type: 'parse_failed',
      message: 'Fixture parser rejected the response',
      retryable: false,
      created_at: '2026-09-10T10:00:00.000Z',
      metadata: { stage: 'parse' },
    });

    expect(parameters?.[7]).toEqual({ stage: 'parse' });
  });
});
