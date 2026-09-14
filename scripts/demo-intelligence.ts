import {
  processReport,
  type NewsEvent,
} from '../packages/news-intelligence/src/index';
import { scenario } from '../tests/intelligence-fixtures';
const events: NewsEvent[] = [];
console.log(
  'SENTETİK DEMO — gerçek bir olay değildir; ağ/model/veritabanı kullanılmaz.',
);
for (const report of scenario()) {
  const result = await processReport(
    report,
    events,
    report.discoveredAt,
    AbortSignal.timeout(5000),
  );
  const i = events.findIndex((e) => e.id === result.event.id);
  if (i < 0) events.push(result.event);
  else events[i] = result.event;
  console.log(
    JSON.stringify(
      {
        title: report.title,
        eventId: result.event.id,
        events: events.length,
        reports: result.event.reports.length,
        families: result.event.signals.families,
        injuryClaims: result.event.claims
          .filter((c) => c.predicate === 'injury_count')
          .map((c) => ({
            value: c.value,
            status: c.status,
            evidence: c.evidence.map((e) => ({
              family: e.family,
              quote: e.quote,
              active: e.active,
            })),
          })),
        updates: result.event.timeline.length,
        decision: result.event.timeline.at(-1)?.decision,
      },
      null,
      2,
    ),
  );
}
const repeated = await processReport(
  scenario()[0]!,
  events,
  '2026-09-10T11:00:00Z',
  AbortSignal.timeout(5000),
);
console.log(
  JSON.stringify({
    repeatedReport: repeated.duplicate,
    events: events.length,
    updates: repeated.event.timeline.length,
  }),
);
