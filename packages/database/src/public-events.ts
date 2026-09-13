import {
  reportSchema,
  sourceSchema,
  reconcile,
  type NewsEvent,
} from '@sak/news-intelligence';
import type { DatabaseClient } from './client';

const selection = `select e.id,e.snapshot,
 (select jsonb_agg(jsonb_build_object('report',r.report,'config',s.config,'checkedAt',s.last_successful_check_at,'error',s.last_error,'stats',s.last_stats))
 from intelligence_event_reports m join intelligence_reports r on r.id=m.report_id join intelligence_sources s on s.id=r.source_id
 where m.namespace=e.namespace and m.event_id=e.id and s.status='active'
 and r.official_version_id is null and coalesce(r.report->'metadata'->>'fixture','false')<>'true'
 and (r.published_at is null or r.published_at<=now())
 and not exists(select 1 from intelligence_reports newer where newer.report_key=r.report_key and (newer.discovered_at,newer.id)>(r.discovered_at,r.id))) reports
 from intelligence_events e where e.namespace='live'`;

type SourceRow = {
  report: unknown;
  config: unknown;
  checkedAt: string | null;
  error: string | null;
  stats: Record<string, unknown>;
};
export function publicEvent(
  row: { id: string; snapshot: NewsEvent; reports: SourceRow[] | null },
  now = new Date().toISOString(),
) {
  const reports = (row.reports ?? [])
    .flatMap((item) => {
      const parsed = reportSchema.safeParse(item.report),
        source = sourceSchema.safeParse(item.config);
      if (!parsed.success || !source.success) return [];
      const report = parsed.data,
        url = new URL(report.canonicalUrl);
      if (
        report.officialVersionId ||
        report.metadata['fixture'] === true ||
        url.protocol !== 'https:' ||
        url.username ||
        url.password ||
        (url.port && url.port !== '443') ||
        !source.data.hosts.includes(url.hostname)
      )
        return [];
      if (
        report.publishedAt &&
        Date.parse(report.publishedAt) > Date.parse(now)
      )
        return [];
      const member = row.snapshot.reports.find((r) => r.id === report.id);
      if (!member) return [];
      const stale =
        !item.checkedAt ||
        Date.parse(now) - Date.parse(item.checkedAt) >
          Math.max(1800, source.data.intervalSeconds * 2) * 1000 ||
        !!item.error ||
        Number(item.stats['failed'] ?? 0) > 0 ||
        Number(item.stats['discoveryFailures'] ?? 0) > 0 ||
        Number(item.stats['publicationParseFailures'] ?? 0) > 0;
      return [
        {
          report,
          member,
          sourceName: source.data.name,
          checkedAt: item.checkedAt,
          stale,
        },
      ];
    })
    .sort(
      (a, b) =>
        (Date.parse(b.report.publishedAt ?? '') || 0) -
          (Date.parse(a.report.publishedAt ?? '') || 0) ||
        a.report.id.localeCompare(b.report.id),
    );
  const primary = reports[0];
  if (!primary) return null;
  // Only current, public source reports contribute to the public corroboration state.
  const claims = reconcile(
    row.id,
    reports.map((r) => r.member),
  ).filter((c) =>
    c.evidence.every((e) => {
      const report = reports.find((r) => r.report.id === e.reportId)?.report;
      return report && report.text.slice(e.start, e.end) === e.quote;
    }),
  );
  const conflicts = claims.some((c) => c.status === 'conflicting');
  const checked = reports
    .flatMap((r) => (r.checkedAt ? [r.checkedAt] : []))
    .sort();
  return {
    id: row.id,
    title: primary.report.title,
    publishedAt: primary.report.publishedAt,
    updatedAt: row.snapshot.updatedAt,
    checkedAt: checked.at(-1) ?? null,
    stale: reports.some((r) => r.stale),
    conflicts,
    sources: reports.map((r) => ({
      id: r.report.id,
      name: r.sourceName,
      sourceId: r.report.sourceId,
      title: r.report.title,
      url: r.report.canonicalUrl,
      publishedAt: r.report.publishedAt,
      checkedAt: r.checkedAt,
      excerpt:
        r.report.text.slice(0, 300) + (r.report.text.length > 300 ? '…' : ''),
      stale: r.stale,
    })),
    claims: claims.filter((c) => c.status !== 'superseded'),
    history: row.snapshot.timeline
      .filter((t) =>
        reports.some(
          (r) =>
            r.report.key ===
            row.snapshot.reports.find((member) => member.id === t.reportId)
              ?.key,
        ),
      )
      .slice(-20)
      .map((t) => ({ id: t.id, at: t.at, kind: t.kind })),
  };
}
export type PublicNewsEvent = NonNullable<ReturnType<typeof publicEvent>>;
export async function listPublicEvents(
  db: DatabaseClient,
  limit = 24,
  source?: string,
) {
  const rows = await db.query<{
    id: string;
    snapshot: NewsEvent;
    reports: SourceRow[] | null;
  }>(
    `select * from (${selection}) public_events where reports is not null
 and ($2::text is null or exists(select 1 from jsonb_array_elements(reports) r where r->'report'->>'sourceId'=$2))
 order by (select max((r->'report'->>'publishedAt')::timestamptz) from jsonb_array_elements(reports) r) desc nulls last,id limit $1`,
    [Math.min(200, Math.max(1, limit)), source ?? null],
  );
  return rows.flatMap((r) => {
    const event = publicEvent(r);
    return event ? [event] : [];
  });
}
export async function getPublicEvent(db: DatabaseClient, id: string) {
  if (!/^[a-f0-9]{64}$/.test(id)) return null;
  const [row] = await db.query<{
    id: string;
    snapshot: NewsEvent;
    reports: SourceRow[] | null;
  }>(selection + ' and e.id=$1', [id]);
  return row ? publicEvent(row) : null;
}
