import type {
  AdapterResult,
  DiscoveredDocument,
  FetchedDocument,
  ParsedDocument,
  SourceAdapter,
} from './contracts';

export interface DocumentFixture {
  discovered: DiscoveredDocument;
  fetched: FetchedDocument;
  parsed: ParsedDocument;
}
/** Saved fixture adapter. It has no HTTP path and must never be used as live evidence. */
export function createFixtureAdapter(
  sourceKey: string,
  fixtures: readonly DocumentFixture[],
): SourceAdapter {
  const missing = <T>(): AdapterResult<T> => ({
    ok: false,
    error: {
      type: 'invalid_document',
      message: 'Fixture not found',
      retryable: false,
    },
  });
  return {
    sourceKey,
    async discover() {
      return {
        ok: true,
        value: fixtures.map((f) => structuredClone(f.discovered)),
      };
    },
    async fetch(document) {
      const fixture = fixtures.find((f) => f.discovered.url === document.url);
      return fixture
        ? { ok: true, value: structuredClone(fixture.fetched) }
        : missing();
    },
    async parse(document) {
      const fixture = fixtures.find(
        (f) => f.fetched.final_url === document.final_url,
      );
      return fixture
        ? { ok: true, value: structuredClone(fixture.parsed) }
        : missing();
    },
  };
}
