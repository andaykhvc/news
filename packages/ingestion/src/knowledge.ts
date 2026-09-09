import {
  type Document,
  type DocumentVersion,
  type FactCandidate,
  type ValidationDecision,
  type Coverage,
  type Ontology,
  type AllowedHost,
} from '@sak/domain';
import { validateCandidate, validateSourceUrl } from '@sak/validation';
import type { FetchedDocument } from '@sak/source-sdk';
import {
  extractionKey,
  extractCandidates,
  type ExtractionProvider,
} from './extractor';
export interface ExtractionRecord {
  key: string;
  version_id: string;
  provider: string;
  model: string;
  ontology_version: string;
  status: 'completed' | 'failed';
  error: string | null;
  created_at: string;
  results: { candidate: FactCandidate; decision: ValidationDecision }[];
}
export interface KnowledgeRepository {
  getVersion(
    id: string,
  ): Promise<{ document: Document; version: DocumentVersion }>;
  hasExtraction(key: string): Promise<boolean>;
  recordExtraction(record: ExtractionRecord): Promise<void>;
  archive(input: {
    version_id: string | null;
    parent_version_id: string | null;
    source_id: string;
    response: FetchedDocument;
    status: 'parsed' | 'needs_review';
    reasons: string[];
  }): Promise<void>;
  recordCoverage(runId: string, coverage: Coverage): Promise<void>;
  recentCoverage(
    endpointId: string,
  ): Promise<{ count: number; status: string }[]>;
}
export async function processKnowledge(input: {
  versionId: string;
  sourceKey: string;
  sourceActive: boolean;
  hosts: AllowedHost[];
  ontology: Ontology;
  provider: ExtractionProvider;
  repository: KnowledgeRepository;
  signal: AbortSignal;
  expectedPeriod?: string;
}): Promise<ExtractionRecord | null> {
  const key = extractionKey(input.versionId, input.provider, input.ontology);
  if (await input.repository.hasExtraction(key)) return null;
  const { document, version } = await input.repository.getVersion(
    input.versionId,
  );
  const record: ExtractionRecord = {
    key,
    version_id: version.id,
    provider: input.provider.name,
    model: input.provider.model,
    ontology_version: input.ontology.version,
    status: 'completed',
    error: null,
    created_at: new Date().toISOString(),
    results: [],
  };
  try {
    // Reject untrusted versions before sending data to a provider.
    if (
      !input.sourceActive ||
      document.current_version_id !== version.id ||
      !validateSourceUrl(
        document.canonical_url,
        document.source_id,
        input.hosts,
      ).ok
    )
      throw new Error('inactive_or_historical_document');
    const candidates = await extractCandidates(
      input.provider,
      version,
      input.ontology,
      input.signal,
    );
    record.results = candidates.map((candidate) => ({
      candidate,
      decision: validateCandidate({
        candidate,
        document,
        version,
        sourceKey: input.sourceKey,
        sourceActive: input.sourceActive,
        hosts: input.hosts,
        ontology: input.ontology,
        asOf: record.created_at,
        ...(input.expectedPeriod
          ? { expectedPeriod: input.expectedPeriod }
          : {}),
      }),
    }));
  } catch (e) {
    record.status = 'failed';
    record.error = e instanceof Error ? e.message : 'extraction_failed';
  }
  await input.repository.recordExtraction(record);
  return record;
}
export function assessCoverage(
  coverage: Coverage,
  previous: { count: number; status: string }[],
  crawlStatus: string,
): Coverage {
  const reasons = [...coverage.reasons];
  const successes = previous
    .filter((x) => x.status === 'success')
    .map((x) => x.count)
    .sort((a, b) => a - b);
  const baseline = successes[Math.floor(successes.length / 2)];
  if (
    successes.length >= 3 &&
    baseline !== undefined &&
    coverage.discovered < baseline * 0.3
  )
    reasons.push('parser_drift_count_collapse');
  if (
    crawlStatus === 'failed' &&
    previous.slice(0, 2).length === 2 &&
    previous.slice(0, 2).every((x) => x.status === 'failed')
  )
    reasons.push('repeated_source_failures');
  if (crawlStatus !== 'success') reasons.push('crawl_incomplete');
  return {
    ...coverage,
    complete: coverage.complete && reasons.length === 0,
    reasons: [...new Set(reasons)],
  };
}
