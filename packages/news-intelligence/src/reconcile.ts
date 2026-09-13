import {
  hash,
  type EventClaim,
  type EventReport,
  type NewsEvent,
  type ConfidenceSignals,
} from './model';
import { normalize, similarity } from './turkish';
export function evidenceFamilies(reports: EventReport[]): Map<string, string> {
  const families = new Map<string, string>();
  const ordered = [...reports].sort(
    (a, b) =>
      Date.parse(a.discoveredAt) - Date.parse(b.discoveredAt) ||
      a.id.localeCompare(b.id),
  );
  for (const report of ordered) {
    const attribution = String(report.analysis.originHint ?? '');
    // Agency labels need an actual attribution token in title/body, not a model assertion alone.
    const origin = /^(aa|dha|iha|reuters|ap|anka)$/.test(attribution)
      ? attribution
      : null;
    const copy = ordered.find(
      (other) =>
        families.has(other.id) &&
        (other.contentHash === report.contentHash ||
          (other.bodyTokens.length >= 15 &&
            report.bodyTokens.length >= 15 &&
            similarity(other.bodyTokens, report.bodyTokens) >= 0.85)),
    );
    families.set(
      report.id,
      copy
        ? families.get(copy.id)!
        : origin
          ? 'agency:' + origin
          : report.sourceFamily
            ? 'owner:' + report.sourceFamily
            : 'unknown:' + report.sourceId,
    );
  }
  return families;
}
export function reconcile(
  eventId: string,
  reports: EventReport[],
): EventClaim[] {
  const families = evidenceFamilies(reports);
  const claims = new Map<string, EventClaim>();
  for (const report of reports)
    for (const claim of report.analysis.claims) {
      const id = hash([eventId, claim.predicate, claim.scope, claim.value]);
      const row = claims.get(id) ?? {
        id,
        predicate: claim.predicate,
        scope: claim.scope,
        value: claim.value,
        status: 'weakly_supported' as const,
        evidence: [],
      };
      const asOf =
        claim.asOf ??
        report.modifiedAt ??
        report.publishedAt ??
        report.discoveredAt;
      // Same canonical report corrections supersede its previous version. Other reports only
      // supersede an older assertion from the same family when explicit updating language exists.
      const superseded = reports.some(
        (newer) =>
          newer.id !== report.id &&
          ((newer.key === report.key &&
            Date.parse(newer.discoveredAt) > Date.parse(report.discoveredAt)) ||
            (families.get(newer.id) === families.get(report.id) &&
              newer.analysis.claims.some(
                (c) =>
                  c.predicate === claim.predicate &&
                  c.scope === claim.scope &&
                  c.correction &&
                  Date.parse(
                    c.asOf ?? newer.modifiedAt ?? newer.publishedAt ?? '',
                  ) > Date.parse(asOf),
              ))),
      );
      row.evidence.push({
        reportId: report.id,
        family: families.get(report.id)!,
        quote: claim.quote,
        start: claim.start,
        end: claim.end,
        asOf,
        officialVersionId: report.officialVersionId,
        active: !superseded,
      });
      claims.set(id, row);
    }
  const rows = [...claims.values()];
  for (const row of rows) {
    const active = row.evidence.filter((e) => e.active);
    const families = new Set(active.map((e) => e.family));
    row.status = !active.length
      ? 'superseded'
      : rows.some(
            (other) =>
              other.id !== row.id &&
              other.predicate === row.predicate &&
              other.scope === row.scope &&
              other.evidence.some((e) => e.active),
          )
        ? 'conflicting'
        : families.size >= 2 || active.some((e) => e.officialVersionId !== null)
          ? 'supported'
          : 'weakly_supported';
  }
  return rows.sort((a, b) => a.id.localeCompare(b.id));
}
export function confidence(
  event: Pick<NewsEvent, 'reports' | 'claims' | 'timeline' | 'entities'>,
  now: string,
): ConfidenceSignals {
  const reports = event.reports;
  const families = evidenceFamilies(reports);
  const at = Date.parse(now);
  const dated = reports.flatMap((r) => {
    const date = r.modifiedAt ?? r.publishedAt;
    return date && Date.parse(date) <= at ? [Date.parse(date)] : [];
  });
  const freshest = dated.length ? Math.max(...dated) : at - 86400000;
  const freshness = Math.max(0, 1 - Math.max(0, at - freshest) / 86400000);
  const independent = new Set(families.values()).size;
  const contradictions = new Set(
    event.claims
      .filter((c) => c.status === 'conflicting')
      .map((c) => c.predicate + ':' + c.scope),
  ).size;
  const official = reports.filter((r) => r.officialVersionId).length;
  const geography = event.entities.some((e) =>
    ['road', 'district', 'location'].includes(e.kind),
  )
    ? 1
    : event.entities.some((e) => e.kind === 'city')
      ? 0.5
      : 0;
  const reliability =
    reports.reduce((n, r) => n + r.sourceReliability, 0) /
    Math.max(1, reports.length);
  const velocity = reports.filter(
    (r) => at - Date.parse(r.discoveredAt) < 3600000,
  ).length;
  const updates = event.timeline.filter(
    (u) => at - Date.parse(u.at) < 3600000,
  ).length;
  const unknown = [...new Set(families.values())].filter((f) =>
    f.startsWith('unknown:'),
  ).length;
  const activeClaims = event.claims.filter(
      (c) => c.status !== 'superseded',
    ).length,
    supportedClaims = event.claims.filter(
      (c) => c.status === 'supported',
    ).length;
  const score = activeClaims
    ? Math.max(
        0,
        Math.min(
          1,
          0.15 +
            Math.min(independent, 4) * 0.12 +
            freshness * 0.1 +
            reliability * 0.1 +
            geography * 0.1 +
            (official ? 0.2 : 0) -
            contradictions * 0.2 -
            unknown * 0.03,
        ),
      )
    : 0;
  return {
    reports: reports.length,
    families: independent,
    unknownOrigins: unknown,
    officialReports: official,
    activeClaims,
    supportedClaims,
    freshness,
    reportsLastHour: velocity,
    updatesLastHour: updates,
    contradictions,
    geographicSpecificity: geography,
    sourceReliability: reliability,
    score: Number(score.toFixed(3)),
    importance: Number(
      Math.min(
        1,
        score * 0.5 +
          Math.min(velocity, 10) * 0.025 +
          Math.min(updates, 5) * 0.025 +
          geography * 0.125,
      ).toFixed(3),
    ),
  };
}
export function agencyHint(text: string): string | null {
  const n = normalize(text);
  const patterns: [string, RegExp][] = [
    ['aa', /\baa\b|anadolu ajansi/],
    ['dha', /\bdha\b|demiroren haber ajansi/],
    ['iha', /\biha\b|ihlas haber ajansi/],
    ['reuters', /\breuters\b/],
    ['ap', /associated press/],
    ['anka', /anka haber ajansi/],
  ];
  return patterns.find(([, re]) => re.test(n))?.[0] ?? null;
}
