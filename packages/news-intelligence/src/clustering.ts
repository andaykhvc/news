import type {
  ClusterDecision,
  EventReport,
  NewsEvent,
  SemanticProvider,
} from './model';
import { similarity } from './turkish';
const values = (r: EventReport, kind: string) =>
  r.analysis.entities.filter((e) => e.kind === kind).map((e) => e.value);
const overlaps = (a: string[], b: string[]) => a.some((x) => b.includes(x));
export function compareReports(
  a: EventReport,
  b: EventReport,
  semantic = 0,
): { score: number; reasons: string[] } {
  if (a.key === b.key) return { score: 1, reasons: ['same_logical_report'] };
  const reasons: string[] = [];
  if (a.analysis.kind !== b.analysis.kind)
    return { score: 0, reasons: ['different_event_type'] };
  const at = a.analysis.occurredAt ?? a.publishedAt,
    bt = b.analysis.occurredAt ?? b.publishedAt;
  if (!at || !bt) return { score: 0, reasons: ['event_time_unknown'] };
  const hours = Math.abs(Date.parse(at) - Date.parse(bt)) / 3600000;
  if (hours > 36) return { score: 0, reasons: ['outside_time_window'] };
  for (const kind of ['city', 'district', 'road']) {
    const x = values(a, kind),
      y = values(b, kind);
    if (x.length && y.length && !overlaps(x, y))
      return { score: 0, reasons: ['incompatible_' + kind] };
  }
  const bodySimilarity = similarity(a.bodyTokens, b.bodyTokens);
  if (
    hours <= 6 &&
    a.bodyTokens.length >= 15 &&
    b.bodyTokens.length >= 15 &&
    bodySimilarity >= 0.85
  )
    return {
      score: 0.95,
      reasons: ['syndicated_body', 'time_hours:' + hours.toFixed(2)],
    };
  const specific = ['road', 'person', 'team', 'organization', 'location'].some(
    (k) => overlaps(values(a, k), values(b, k)),
  );
  const city = overlaps(values(a, 'city'), values(b, 'city'));
  const lexical = similarity(a.tokens, b.tokens);
  if (
    !specific &&
    !(city && lexical >= 0.32 && hours <= 6) &&
    !(lexical >= 0.65 && hours <= 6)
  )
    return { score: 0, reasons: ['insufficient_distinctive_anchors'] };
  if (specific) reasons.push('shared_distinctive_entity');
  if (city) reasons.push('shared_city');
  reasons.push(
    'time_hours:' + hours.toFixed(2),
    'lexical:' + lexical.toFixed(3),
  );
  const score = Math.min(
    1,
    0.2 +
      (specific ? 0.4 : 0) +
      (city ? 0.1 : 0) +
      (hours <= 6 ? 0.15 : 0.05) +
      lexical * (specific ? 0.2 : 0.4) +
      Math.min(1, Math.max(0, semantic)) * 0.1,
  );
  return { score, reasons };
}
export async function chooseEvent(
  report: EventReport,
  events: NewsEvent[],
  signal: AbortSignal,
  semantic?: SemanticProvider,
): Promise<ClusterDecision> {
  const alternatives = [];
  for (const event of events) {
    let best = { score: 0, reasons: ['no_compatible_report'] };
    // Compare to anchored members instead of an ever-expanding bag of unrelated entities.
    for (const member of event.reports) {
      let result = compareReports(report, member);
      if (semantic && result.score >= 0.55 && result.score < 0.8) {
        const score = await semantic.similarity(
          report.title,
          member.title,
          AbortSignal.any([signal, AbortSignal.timeout(10000)]),
        );
        if (!Number.isFinite(score) || score < 0 || score > 1)
          throw new Error('semantic_score_invalid');
        result = compareReports(report, member, score);
      }
      if (result.score > best.score) best = result;
    }
    alternatives.push({ eventId: event.id, ...best });
  }
  alternatives.sort(
    (a, b) => b.score - a.score || a.eventId.localeCompare(b.eventId),
  );
  const best = alternatives[0],
    second = alternatives[1];
  const ambiguous =
    !!best &&
    best.score < 1 &&
    !!second &&
    second.score >= 0.7 &&
    best.score - second.score < 0.08;
  return {
    eventId: best && best.score >= 0.7 && !ambiguous ? best.eventId : null,
    score: best?.score ?? 0,
    reasons: ambiguous
      ? ['ambiguous_candidates']
      : (best?.reasons ?? ['first_event']),
    alternatives: alternatives.slice(0, 10),
  };
}
