import { currentTurkishYear } from '@sak/answers';
import { snapshotForYear } from '../../lib/product';
export const dynamic = 'force-dynamic';
export async function GET() {
  const { snapshot, available } = await snapshotForYear(currentTurkishYear());
  const healthy =
    available &&
    snapshot.endpoints
      .filter((e) => e.status === 'active')
      .every((e) => {
        const c = snapshot.checks.find((c) => c.endpoint_id === e.id);
        return (
          c?.status === 'success' &&
          !!c.successful_at &&
          Date.now() - Date.parse(c.successful_at) <=
            Math.max(3600, e.poll_interval_seconds * 3) * 1000 &&
          c.reasons.every((r) =>
            ['document_limit', 'bounded_or_incomplete_discovery'].includes(r),
          )
        );
      });
  return Response.json(
    {
      status: healthy ? 'ok' : 'degraded',
      database: available ? 'reachable' : 'unavailable',
      sources: healthy ? 'recent' : 'stale_or_unknown',
    },
    { status: available ? 200 : 503, headers: { 'Cache-Control': 'no-store' } },
  );
}
