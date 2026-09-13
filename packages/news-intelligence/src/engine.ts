import {
  ENGINE_VERSION,
  hash,
  type NewsEvent,
  type NewsReport,
  type EventReport,
  type AnalysisProvider,
  type SemanticProvider,
} from './model';
import { analyze } from './analysis';
import { tokens } from './turkish';
import { chooseEvent } from './clustering';
import { agencyHint, confidence, reconcile } from './reconcile';
export async function processReport(
  report: NewsReport,
  events: NewsEvent[],
  now: string,
  signal: AbortSignal,
  providers: { analysis?: AnalysisProvider; semantic?: SemanticProvider } = {},
  prepared?: Awaited<ReturnType<typeof analyze>>,
) {
  const duplicate = events.find((e) =>
    e.reports.some((r) => r.id === report.id),
  );
  if (duplicate) return { event: duplicate, duplicate: true };
  const result =
    prepared ?? (await analyze(report, signal, providers.analysis));
  result.analysis.originHint = agencyHint(report.text); // Provider hints never manufacture independence.
  const { text, metadata, ...record } = report;
  void metadata;
  const member: EventReport = {
    ...record,
    ...result,
    tokens: tokens(report.title + ' ' + text.slice(0, 1500)),
    bodyTokens: tokens(text).slice(0, 1200),
  };
  const decision = await chooseEvent(
    member,
    events,
    signal,
    providers.semantic,
  );
  const previous = events.find((e) => e.id === decision.eventId);
  if (previous && previous.reports.length >= 1000)
    throw new Error('event_report_limit');
  const id = previous?.id ?? hash(['event', report.key]);
  const reports = [...(previous?.reports ?? []), member];
  const entities = [
    ...new Map(
      reports
        .flatMap((r) => r.analysis.entities)
        .map((e) => [e.kind + ':' + e.value, e]),
    ).values(),
  ];
  const claims = reconcile(id, reports);
  const changes = claims
    .filter((c) => {
      const p = previous?.claims.find((p) => p.id === c.id);
      return (
        !p || p.status !== c.status || p.evidence.length !== c.evidence.length
      );
    })
    .map((c) => c.predicate + ':' + c.status);
  const update = {
    id: hash([id, report.id]),
    at: now,
    reportId: report.id,
    kind: previous ? ('updated' as const) : ('created' as const),
    engineVersion: ENGINE_VERSION,
    changes,
    decision,
  };
  const partial = {
    id,
    kind: previous?.kind ?? result.analysis.kind,
    entities,
    createdAt: previous?.createdAt ?? now,
    updatedAt: now,
    reports,
    claims,
    timeline: [...(previous?.timeline ?? []), update],
  };
  return {
    event: {
      ...partial,
      signals: confidence(partial, now),
    } satisfies NewsEvent,
    duplicate: false,
  };
}
