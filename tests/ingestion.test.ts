import { describe, expect, it, vi } from 'vitest';
import { createMemoryRepositories } from '../packages/database/src/memory';
import { ingestEndpoint } from '../packages/ingestion/src/index';
import { createFixtureAdapter } from '../packages/source-sdk/src/fixture';
import type { SourceAdapter } from '../packages/source-sdk/src/index';
import {
  registry,
  source,
  endpoint,
  documentFixture,
  offlineHttp,
  silentLogger,
} from './helpers';

function setup() {
  const memory = createMemoryRepositories(registry);
  const adapter = createFixtureAdapter(source.slug, [documentFixture]);
  const run = (overrides: Partial<Parameters<typeof ingestEndpoint>[0]> = {}) =>
    ingestEndpoint({
      source,
      endpoint,
      hosts: registry.hosts,
      adapter,
      http: offlineHttp,
      repositories: memory.repositories,
      logger: silentLogger,
      now: () => new Date('2026-09-08T00:00:00Z'),
      ...overrides,
    });
  return { ...memory, adapter, run };
}
describe('generic ingestion', () => {
  it('records new, unchanged, changed and reverted content without destroying history', async () => {
    const { run, state } = setup();
    expect((await run()).outcomes[0]?.outcome).toBe('new_document');
    expect((await run()).outcomes[0]?.outcome).toBe('unchanged');
    const changed = createFixtureAdapter(source.slug, [
      {
        ...documentFixture,
        parsed: { ...documentFixture.parsed, raw_text: 'Synthetic revision B' },
      },
    ]);
    expect((await run({ adapter: changed })).outcomes[0]?.outcome).toBe(
      'new_version',
    );
    expect((await run()).outcomes[0]?.outcome).toBe('new_version');
    expect(state.versions.size).toBe(2);
    expect(state.observations.size).toBe(4);
    expect(
      state.registry.endpoints[0]?.last_successful_check_at,
    ).not.toBeNull();
  });
  it('deduplicates discovery URLs but refetches known documents on later checks', async () => {
    const { run, adapter } = setup();
    const fetch = vi.fn(adapter.fetch);
    const duplicated = {
      ...adapter,
      fetch,
      discover: async () => ({
        ok: true as const,
        value: [documentFixture.discovered, documentFixture.discovered],
      }),
    };
    expect(
      (await run({ adapter: duplicated })).outcomes.map((o) => o.outcome),
    ).toEqual(['new_document', 'skipped']);
    await run({ adapter: duplicated });
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it('does not fetch untrusted discoveries and reports a partial crawl', async () => {
    const { run, adapter, state } = setup();
    const report = await run({
      adapter: {
        ...adapter,
        discover: async () => ({
          ok: true,
          value: [
            documentFixture.discovered,
            {
              url: 'https://fixture.gov.tr.attacker.com/',
              external_identifier: null,
            },
          ],
        }),
      },
    });
    expect(report.status).toBe('partial');
    expect(report.statistics.errors_count).toBe(1);
    expect(state.errors[0]?.error_type).toBe('source_validation_failed');
    expect(state.registry.endpoints[0]?.last_successful_check_at).toBeNull();
  });
  it.each(['canonical', 'attachment', 'redirect'] as const)(
    'rejects an untrusted %s URL',
    async (stage) => {
      const { run, state } = setup();
      const doc = structuredClone(documentFixture);
      if (stage === 'canonical')
        doc.parsed.canonical_url = 'https://attacker.com/';
      if (stage === 'redirect') doc.fetched.final_url = 'https://attacker.com/';
      const adapter = createFixtureAdapter(source.slug, [
        {
          ...doc,
          parsed: {
            ...doc.parsed,
            attachments:
              stage === 'attachment'
                ? [
                    {
                      url: 'https://attacker.com/a.pdf',
                      mime_type: null,
                      filename: null,
                    },
                  ]
                : [],
          },
        },
      ]);
      expect((await run({ adapter })).status).toBe(
        stage === 'attachment' ? 'partial' : 'failed',
      );
      expect(state.documents.size).toBe(stage === 'attachment' ? 1 : 0);
    },
  );
  it('records thrown parser failures and finishes the run', async () => {
    const { run, adapter, state } = setup();
    const report = await run({
      adapter: {
        ...adapter,
        async parse() {
          throw new Error('Broken parser');
        },
      },
    });
    expect(report.status).toBe('failed');
    expect(state.errors[0]?.error_type).toBe('parse_failed');
    expect(state.runs.get(report.runId)?.finished_at).not.toBeNull();
  });
  it('blocks inactive sources before calling adapters', async () => {
    const { run, adapter } = setup();
    const discover = vi.fn(adapter.discover);
    expect(
      (
        await run({
          source: { ...source, status: 'candidate' },
          adapter: { ...adapter, discover },
        })
      ).status,
    ).toBe('failed');
    expect(discover).not.toHaveBeenCalled();
  });
  it('retries only explicit retryable failures in the orchestration layer', async () => {
    const { run, adapter } = setup();
    let attempts = 0;
    const fetch: SourceAdapter['fetch'] = async (document, context) =>
      ++attempts === 1
        ? {
            ok: false,
            error: {
              type: 'fetch_failed',
              message: 'Temporary',
              retryable: true,
            },
          }
        : adapter.fetch(document, context);
    const sleep = vi.fn(async () => {});
    expect(
      (
        await run({
          adapter: { ...adapter, fetch },
          retry: { maxAttempts: 2, delayMs: 10, sleep },
        })
      ).status,
    ).toBe('success');
    expect(attempts).toBe(2);
    expect(sleep).toHaveBeenCalledTimes(1);
  });
  it('finishes aborted and empty crawls with explicit statuses', async () => {
    const { run } = setup();
    expect((await run({ signal: AbortSignal.abort() })).status).toBe('failed');
    expect(
      (await run({ adapter: createFixtureAdapter(source.slug, []) })).status,
    ).toBe('success');
  });
});
