import {
  analyze,
  sourceSchema,
  reportSchema,
  processReport,
  type NewsSource,
  type NewsReport,
  type NewsEvent,
  type ResponseCache,
  type CachedResponse,
  type AnalysisProvider,
  type SemanticProvider,
} from '@sak/news-intelligence';
import type { DatabaseClient } from './client';
export function createIntelligenceRepository(db: DatabaseClient) {
  const repo = {
    async register(source: NewsSource) {
      const parsed = sourceSchema.parse(source);
      await db.query(
        `insert into intelligence_sources(id,config,status) values($1,$2::jsonb,$3) on conflict(id) do update set config=excluded.config||jsonb_build_object('status',intelligence_sources.status),updated_at=now() where intelligence_sources.config is distinct from (excluded.config||jsonb_build_object('status',intelligence_sources.status))`,
        [parsed.id, parsed, parsed.status],
      );
    },
    async sources() {
      return (
        await db.query<{ config: unknown; status: string }>(
          'select config,status from intelligence_sources order by id',
        )
      ).map((r) =>
        sourceSchema.parse({ ...(r.config as object), status: r.status }),
      );
    },
    async report(id: string) {
      const row = (
        await db.query<{ report: unknown }>(
          'select report from intelligence_reports where id=$1',
          [id],
        )
      )[0];
      return row ? reportSchema.parse(row.report) : null;
    },
    async store(report: NewsReport) {
      return (
        await db.query<{ inserted: boolean }>(
          'select intelligence_store_report($1::jsonb) inserted',
          [reportSchema.parse(report)],
        )
      )[0]!.inserted;
    },
    async reports(
      options: {
        source?: string;
        from?: string;
        to?: string;
        namespace?: string;
        limit?: number;
      } = {},
    ) {
      return (
        await db.query<{ report: unknown }>(
          `select r.report from intelligence_reports r where ($1::text is null or source_id=$1) and ($2::timestamptz is null or discovered_at>=$2) and ($3::timestamptz is null or discovered_at<=$3)
   and ($4::text is null or not exists(select 1 from intelligence_event_reports m where m.namespace=$4 and m.report_id=r.id))
   order by coalesce(published_at,discovered_at),discovered_at,id limit $5`,
          [
            options.source ?? null,
            options.from ?? null,
            options.to ?? null,
            options.namespace ?? null,
            options.limit ?? 100,
          ],
        )
      ).map((r) => reportSchema.parse(r.report));
    },
    async namespace(name: string) {
      if (!/^(live|dev-[a-z0-9_-]{1,60})$/.test(name))
        throw new Error('invalid_namespace');
      await db.query(
        'insert into intelligence_namespaces(name) values($1) on conflict do nothing',
        [name],
      );
    },
    async events(namespace = 'live') {
      return (
        await db.query<{ snapshot: NewsEvent }>(
          'select snapshot from intelligence_events where namespace=$1 order by id limit 501',
          [namespace],
        )
      ).map((r) => r.snapshot);
    },
    async process(
      report: NewsReport,
      namespace: string,
      signal: AbortSignal,
      providers: {
        analysis?: AnalysisProvider;
        semantic?: SemanticProvider;
      } = {},
    ) {
      const existing = (
        await db.query<{ snapshot: NewsEvent }>(
          `select e.snapshot from intelligence_events e join intelligence_event_reports m on m.namespace=e.namespace and m.event_id=e.id where m.namespace=$1 and m.report_id=$2`,
          [namespace, report.id],
        )
      )[0];
      if (existing) return { event: existing.snapshot, duplicate: true };
      const prepared = await analyze(report, signal, providers.analysis);
      for (let attempt = 0; attempt < 5; attempt++) {
        const revision = (
          await db.query<{ revision: string }>(
            'select revision from intelligence_namespaces where name=$1',
            [namespace],
          )
        )[0]!.revision;
        // Use an explicit bounded candidate scan. Refuse rather than silently lose older clusters.
        const events = (
          await db.query<{ snapshot: NewsEvent }>(
            `select e.snapshot from intelligence_events e where e.namespace=$1 and
      ((range_start<=$2::timestamptz+interval '36 hours' and range_end>=$2::timestamptz-interval '36 hours')
      or exists(select 1 from intelligence_event_reports m join intelligence_reports r on r.id=m.report_id where m.namespace=e.namespace and m.event_id=e.id and r.report_key=$3)) order by e.id limit 501`,
            [
              namespace,
              prepared.analysis.occurredAt ??
                report.publishedAt ??
                report.discoveredAt,
              report.key,
            ],
          )
        ).map((r) => r.snapshot);
        if (events.length > 500) throw new Error('candidate_window_limit');
        const result = await processReport(
          report,
          events,
          new Date().toISOString(),
          signal,
          providers,
          prepared,
        );
        if (result.duplicate) return result;
        const saved = (
          await db.query<{ saved: boolean }>(
            'select intelligence_save_event($1,$2::bigint,$3,$4::jsonb) saved',
            [namespace, revision, report.id, result.event],
          )
        )[0]!.saved;
        if (saved) return result;
      }
      throw new Error('event_concurrency_retry');
    },
    async event(id: string, namespace = 'live') {
      return (
        (
          await db.query<{ snapshot: NewsEvent }>(
            'select snapshot from intelligence_events where namespace=$1 and id=$2',
            [namespace, id],
          )
        )[0]?.snapshot ?? null
      );
    },
    async member(id: string, namespace = 'live') {
      const row = (
        await db.query<{ snapshot: NewsEvent }>(
          'select e.snapshot from intelligence_events e join intelligence_event_reports m on m.namespace=e.namespace and m.event_id=e.id where m.namespace=$1 and m.report_id=$2',
          [namespace, id],
        )
      )[0];
      return row?.snapshot.reports.find((r) => r.id === id);
    },
    async health() {
      return db.query(`select s.id,s.status,case when jsonb_array_length(s.config->'discovery')=0 then 'official_bridge' else 'discovery' end monitor_mode,s.due_at,s.lease_until,s.attempts,s.last_successful_check_at,s.last_error,s.last_stats,
  case when jsonb_array_length(s.config->'discovery')=0 then null else (s.last_successful_check_at is null or s.last_successful_check_at<now()-make_interval(secs=>greatest(1800,2*(s.config->>'intervalSeconds')::integer))) end stale,
  (select count(*)::integer from intelligence_reports r where r.source_id=s.id) reports,
  (select count(*)::integer from intelligence_reports r where r.source_id=s.id and not exists(select 1 from intelligence_event_reports m where m.namespace='live' and m.report_id=r.id)) pending_reports,
  (select count(*)::integer from intelligence_attempts a where a.source_id=s.id and a.at>now()-interval '24 hours' and a.status='crawl_success') successful_runs_24h,
  (select count(*)::integer from intelligence_attempts a where a.source_id=s.id and a.at>now()-interval '24 hours' and a.status='crawl_partial') partial_runs_24h,
  (select count(*)::integer from intelligence_attempts a where a.source_id=s.id and a.at>now()-interval '24 hours' and a.status='processing_failed') processing_failures_24h
  from intelligence_sources s order by s.id`);
    },
    async quality() {
      return db.query(`select 'evidence_quote_mismatch' problem,count(*)::integer violations from intelligence_evidence e join intelligence_reports r on r.id=e.report_id where utf16_slice(r.report->>'text',e.start_offset,e.end_offset) is distinct from e.quote
  union all select 'claim_without_evidence',count(*)::integer from intelligence_claims c where not exists(select 1 from intelligence_evidence e where e.namespace=c.namespace and e.claim_id=c.id)
  union all select 'event_without_update',count(*)::integer from intelligence_events e where not exists(select 1 from intelligence_updates u where u.namespace=e.namespace and u.event_id=e.id)`);
    },
    async attempt(
      namespace: string,
      source: string,
      reportId: string | null,
      status: string,
      details: unknown,
    ) {
      await db.query(
        'insert into intelligence_attempts(namespace,source_id,report_id,status,details) values($1,$2,$3,$4,$5::jsonb)',
        [namespace, source, reportId, status, details],
      );
    },
    async candidate(url: string, from: string, reason: string) {
      await db.query(
        'insert into intelligence_source_candidates(url,discovered_from,reason) values($1,$2,$3) on conflict do nothing',
        [url, from, reason],
      );
    },
    cache: {
      async get(source, url) {
        const rows = await db.query<{ response: CachedResponse }>(
          'select response from intelligence_http_cache where source_id=$1 and url=$2',
          [source, url],
        );
        return rows[0]?.response ?? null;
      },
      async put(source, response) {
        await db.query(
          'insert into intelligence_http_cache(source_id,url,response) values($1,$2,$3::jsonb) on conflict(source_id,url) do update set response=excluded.response',
          [source, response.url, response],
        );
      },
    } satisfies ResponseCache,
  };
  return repo;
}
