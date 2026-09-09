import { expect, it, describe } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  answerResources,
  canonicalPath,
  resolveQuery,
  normalizeQuery,
  privateQuerySummary,
  resolveAnswer,
  answerSnapshotSchema,
  resourceForRoute,
  formatFactValue,
} from '../packages/answers/src/index';
import { answerFixture, fixtureNow } from './answer-fixture';
const resource = answerResources[0]!;
const resolve = (data = answerFixture(), year = 2026, at = fixtureNow) =>
  resolveAnswer(resource, year, data, at);
describe('Turkish intent without model assistance', () => {
  it.each([
    'YKS ek tercih ne zaman?',
    'yks ikinci tercih',
    'ek yerleştirme ne zaman',
    'yks ek yerlestirme',
    'yks ek yerlestirme ne zamam',
    'YKS EK TERCİH',
    'yks ek tercihh ne zaman',
  ])('normalizes %s to one event', (q) => {
    const intent = resolveQuery(q, 2026).intent;
    expect(intent?.resource.key).toBe(resource.key);
    expect(canonicalPath(intent!.resource, intent!.year)).toBe(
      '/yks/2026/ek-yerlestirme',
    );
  });
  it('resolves KYK status and explicit year', () => {
    expect(
      resolveQuery('2025 kyk yurtları açıklandı mı', 2026).intent,
    ).toMatchObject({
      year: 2025,
      explicitYear: true,
      intent: 'status',
      resource: { key: 'kyk_results' },
    });
  });
  it('does not discard contradictory events, periods or extra requirements', () => {
    for (const q of [
      '2025 2026 yks ek tercih',
      'geçen yıl yks ek tercih',
      'yks ek tercih ücreti',
      'yks ek tercih sonuçları',
      'dgs ek tercih',
      'kpss',
      'my password 12345678900',
    ])
      expect(resolveQuery(q, 2026).intent).toBeNull();
  });
  it('normalizes dotted and undotted I without locale leakage', () =>
    expect(normalizeQuery('İKİNCİ  TERCİH?!')).toBe('ikinci tercih'));
  it('validates canonical routes', () => {
    expect(resourceForRoute('yks', '2026', 'ek-yerlestirme')).toBe(resource);
    expect(
      resourceForRoute('yks', '2026-anything', 'ek-yerlestirme'),
    ).toBeUndefined();
  });
  it('never stores names, identifiers or raw searches', () => {
    expect(privateQuerySummary('Ahmet Yılmaz için yks başvuru')).toBe(
      'basvuru yks',
    );
    expect(privateQuerySummary('yks ahmet@example.com')).toBeNull();
    expect(privateQuerySummary('yks 12345678900')).toBeNull();
  });
});
describe('answer trace and temporal resolution', () => {
  it('accepts the full validated schema and renders a future range with its exact evidence', () => {
    const data = answerSnapshotSchema.parse(answerFixture());
    const answer = resolve(data);
    expect(answer.state).toBe('future_announced');
    expect(answer.value).toBe('20 Eylül 2026 – 25 Eylül 2026');
    expect(answer.stale).toBe(false);
    expect(answer.evidence[0]).toMatchObject({
      factId: data.facts[0]!.id,
      versionId: data.versions[0]!.id,
      documentId: data.documents[0]!.id,
      url: data.documents[0]!.canonical_url,
      excerpt: data.evidence[0]!.evidence_text,
    });
    expect(answer.history.length).toBe(3);
  });
  it('never returns a previous-year fact to the default current year', () => {
    const data = answerFixture();
    data.facts[0]!.reference_period = '2025';
    expect(resolve(data).factId).toBeNull();
    expect(resolve(data).value).toBeNull();
  });
  it('normal preferences cannot satisfy additional placement', () => {
    const data = answerFixture();
    data.entities[0]!.key = 'yks';
    expect(resolve(data).factId).toBeNull();
  });
  it('superseded dates never become current', () => {
    const data = answerFixture();
    data.facts[0]!.status = 'superseded';
    data.facts[0]!.superseded_at = fixtureNow;
    const answer = resolve(data);
    expect(answer.state).toBe('superseded');
    expect(answer.value).toBeNull();
  });
  it('current-day date range remains current through Turkey midnight', () => {
    expect(resolve(answerFixture(), 2026, '2026-09-25T20:59:59Z').state).toBe(
      'current',
    );
    expect(resolve(answerFixture(), 2026, '2026-09-25T21:00:00Z').state).toBe(
      'expired',
    );
  });
  it.each(['draft', 'verified', 'needs_review', 'revoked', 'expired'] as const)(
    '%s is not a confidently published answer',
    (status) => {
      const data = answerFixture();
      data.facts[0]!.status = status;
      expect(resolve(data).value).toBeNull();
    },
  );
  it('does not pick a winner for conflicting authoritative values', () => {
    const data = answerFixture();
    data.facts.push({
      ...data.facts[0]!,
      id: randomUUID(),
      value: { type: 'date_range', start: '2026-09-21', end: '2026-09-26' },
    });
    expect(resolve(data)).toMatchObject({ state: 'needs_review', value: null });
  });
  it('does not bypass needs-review even when another row is published', () => {
    const data = answerFixture();
    data.facts.push({
      ...data.facts[0]!,
      id: randomUUID(),
      status: 'needs_review',
    });
    expect(resolve(data)).toMatchObject({ state: 'needs_review', value: null });
  });
  it('scopes absence to successfully processed monitored pages', () => {
    const data = answerFixture();
    data.facts = [];
    const answer = resolve(data);
    expect(answer.state).toBe('monitored_absence');
    expect(answer.text).toContain('tüm resmî arşivi kapsamayabilir');
    expect(answer.text).not.toContain('yayımlanmadı');
  });
  it.each(['missing_extraction', 'failed', 'bounded', 'missing_pages'])(
    'does not infer absence from %s',
    (cause) => {
      const data = answerFixture();
      data.facts = [];
      if (cause === 'missing_extraction')
        data.checks[0]!.extraction_complete = false;
      if (cause === 'failed') data.checks[0]!.status = 'partial';
      if (cause === 'bounded') data.checks[0]!.reasons = ['document_limit'];
      if (cause === 'missing_pages') data.checks[0]!.pages = [];
      expect(resolve(data).state).toBe('no_verified_fact');
    },
  );
  it.each(['old', 'parser', 'failed', 'unobserved'])(
    'degrades confidence for %s source coverage',
    (cause) => {
      const data = answerFixture();
      if (cause === 'old')
        data.checks[0]!.successful_at = '2026-09-01T00:00:00Z';
      if (cause === 'parser') data.checks[0]!.reasons = ['parser_drift'];
      if (cause === 'failed') data.checks[0]!.status = 'failed';
      if (cause === 'unobserved')
        data.documents[0]!.latest_seen_at = '2026-09-01T00:00:00Z';
      const answer = resolve(data);
      expect(answer.stale).toBe(true);
      expect(answer.status).toContain('yeniden kontrol');
      expect(answer.warnings.length).toBeGreaterThan(0);
    },
  );
  it.each([
    'version',
    'quote',
    'offset',
    'host',
    'authority',
    'page',
    'future_verification',
    'future_validity',
    'parser',
  ])('fails closed for invalid %s', (cause) => {
    const data = answerFixture();
    if (cause === 'version')
      data.documents[0]!.current_version_id = randomUUID();
    if (cause === 'quote') data.evidence[0]!.evidence_text = 'invented';
    if (cause === 'offset')
      data.evidence[0]!.evidence_locator.character_start = 1;
    if (cause === 'host')
      data.documents[0]!.canonical_url = 'https://osym.gov.tr.evil.example/a';
    if (cause === 'authority') data.rules[0]!.status = 'disabled';
    if (cause === 'page') data.evidence[0]!.evidence_locator.page_number = 2;
    if (cause === 'future_verification')
      data.facts[0]!.verified_at = '2026-10-01T00:00:00Z';
    if (cause === 'future_validity')
      data.facts[0]!.valid_from = '2026-10-01T00:00:00Z';
    if (cause === 'parser')
      data.versions[0]!.metadata['structure'] = {
        blocks: [],
        warnings: ['drift'],
      };
    expect(resolve(data).value).toBeNull();
  });
  it('does not interpret database outage as absence', () =>
    expect(
      resolveAnswer(resource, 2026, answerFixture(), fixtureNow, false),
    ).toMatchObject({ state: 'unavailable', value: null }));
  it('money formatting never rounds exact decimal data', () =>
    expect(
      formatFactValue({
        type: 'money',
        amount: '12345678901234567890.50',
        currency: 'TRY',
      }),
    ).toBe('12.345.678.901.234.567.890,50 TRY'));
});
it('old immutable evidence does not hide a newly validated current version of the same claim', () => {
  const data = answerFixture();
  const old = data.versions[0]!;
  const current = { ...old, id: randomUUID() };
  data.versions.push(current);
  data.documents[0]!.current_version_id = current.id;
  data.evidence.push({
    ...data.evidence[0]!,
    id: randomUUID(),
    document_version_id: current.id,
  });
  data.validations.push({ ...data.validations[0]!, version_id: current.id });
  const answer = resolve(data);
  expect(answer.factId).toBe(data.facts[0]!.id);
  expect(answer.evidence.map((e) => e.versionId)).toEqual([current.id]);
});
it('half-open fact validity expiry is reported as expired, not a current event', () => {
  const data = answerFixture();
  data.facts[0]!.valid_until = fixtureNow;
  expect(resolve(data)).toMatchObject({ state: 'expired', value: null });
});
it('a published flag cannot bypass missing or mismatched grounding audit', () => {
  const data = answerFixture();
  data.validations = [];
  expect(resolve(data).value).toBeNull();
  const mismatch = answerFixture();
  mismatch.validations[0]!.candidate.value = {
    type: 'date',
    value: '2026-09-21',
  };
  expect(resolve(mismatch).value).toBeNull();
});
it('legacy generic YKS facts cannot leak additional-placement evidence onto the normal preferences page', () => {
  const data = answerFixture();
  data.entities[0]!.key = 'yks';
  data.validations[0]!.candidate.entity_key = 'yks';
  expect(
    resolveAnswer(
      answerResources.find((r) => r.key === 'yks_preferences')!,
      2026,
      data,
      fixtureNow,
    ).factId,
  ).toBeNull();
});
