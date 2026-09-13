import { expect, it } from 'vitest';
import { createRequire } from 'node:module';
const requireWeb = createRequire(
  new URL('../apps/web/package.json', import.meta.url),
);
const { renderToStaticMarkup } = requireWeb('react-dom/server') as {
  renderToStaticMarkup: (element: unknown) => string;
};
import { processReport } from '../packages/news-intelligence/src/index';
import { publicEvent } from '../packages/database/src/public-events';
import { combineNews } from '../apps/web/src/lib/news-feed';
import { NewsList } from '../apps/web/src/components/news-list';
import { scenario, fixtureSource } from './intelligence-fixtures';
async function row() {
  const reports = scenario()
    .slice(0, 3)
    .map((r) => ({ ...r, metadata: {} }));
  let event = (
    await processReport(
      reports[0]!,
      [],
      reports[0]!.discoveredAt,
      AbortSignal.timeout(5000),
    )
  ).event;
  for (const r of reports.slice(1))
    event = (
      await processReport(r, [event], r.discoveredAt, AbortSignal.timeout(5000))
    ).event;
  return {
    id: event.id,
    snapshot: event,
    reports: reports.map((r) => ({
      report: r,
      config: { ...fixtureSource, id: r.sourceId },
      checkedAt: '2026-09-10T10:00:00Z',
      error: null as string | null,
      stats: {},
    })),
  };
}
it('renders one event for syndicated reports and exposes conflicting claims with the matching sources', async () => {
  const r = await row(),
    event = publicEvent(r, '2026-09-10T10:01:00Z')!;
  expect(event).not.toBeNull();
  expect(event.sources).toHaveLength(3);
  expect(event.conflicts).toBe(true);
  expect(
    event.claims
      .filter((c) => c.predicate === 'injury_count')
      .every((c) => c.status === 'conflicting'),
  ).toBe(true);
  for (const c of event.claims)
    for (const e of c.evidence)
      expect(event.sources.some((s) => s.id === e.reportId)).toBe(true);
  const feed = combineNews([], [event]);
  expect(feed).toHaveLength(1);
  expect(feed[0]?.href).toBe('/olay/' + event.id);
  const html = renderToStaticMarkup(NewsList({ items: feed }));
  expect(html).toContain('/olay/' + event.id);
  expect(html).toContain('Yayın tarihi');
  expect(html).not.toContain('Resmî duyuru');
});
it('preserves source publication dates across feed limits and does not refresh dates when the worker checks', async () => {
  const r = await row(),
    event = publicEvent(r, '2026-09-10T10:01:00Z')!;
  expect(combineNews([], [event], 24)[0]?.publishedAt).toBe(
    combineNews([], [event], 100)[0]?.publishedAt,
  );
  r.reports[2]!.checkedAt = '2026-09-11T10:00:00Z';
  const after = publicEvent(r, '2026-09-11T10:01:00Z')!;
  expect(after.publishedAt).toBe(event.publishedAt);
  expect(publicEvent(r, '2026-09-13T10:01:00Z')?.stale).toBe(true);
});
it('excludes official bridges, fixtures, unsafe links and future publications', async () => {
  for (const patch of [
    { officialVersionId: '11111111-1111-4111-8111-111111111111' },
    { metadata: { fixture: true } },
    { canonicalUrl: 'javascript:alert(1)' },
    { publishedAt: '2027-01-01T00:00:00Z' },
  ]) {
    const r = await row();
    r.reports = r.reports.map((item) => ({
      ...item,
      report: { ...item.report, ...patch },
    }));
    expect(publicEvent(r, '2026-09-10T10:01:00Z')).toBeNull();
  }
});
it('degrades source-health messaging and recomputes corroboration after a source is removed', async () => {
  const r = await row();
  r.reports = r.reports.slice(0, 1);
  r.reports[0]!.error = 'parser_drift';
  const event = publicEvent(r, '2026-09-10T10:01:00Z')!;
  expect(event.stale).toBe(true);
  expect(event.conflicts).toBe(false);
  expect(event.claims.every((c) => c.status === 'weakly_supported')).toBe(true);
});
