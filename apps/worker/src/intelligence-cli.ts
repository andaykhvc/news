import { parseArgs } from 'node:util';
import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import { bridgeOfficialDocuments } from './intelligence-official';
import {
  createDatabaseClient,
  createIntelligenceRepository,
} from '@sak/database';
import { createPinnedTransport } from '@sak/source-sdk';
import {
  sourceSchema,
  reportSchema,
  crawlSource,
  createNewsFetcher,
  memoryCache,
  processReport,
  compareReports,
  createJsonAnalysisProvider,
  type NewsEvent,
} from '@sak/news-intelligence';

export async function runIntelligenceCli() {
  const { values } = parseArgs({
    options: {
      intelligence: { type: 'boolean' },
      scheduler: { type: 'boolean' },
      source: { type: 'string' },
      url: { type: 'string', multiple: true },
      from: { type: 'string' },
      to: { type: 'string' },
      write: { type: 'boolean' },
      replay: { type: 'boolean' },
      rebuild: { type: 'string' },
      inspect: { type: 'string' },
      explain: { type: 'string', multiple: true },
      bridge: { type: 'boolean' },
      fixture: { type: 'string' },
      health: { type: 'boolean' },
      check: { type: 'boolean' },
      help: { type: 'boolean' },
    },
    strict: true,
  });
  if (values.help) {
    console.log(
      'News Intelligence: --source ID [--url HTTPS_URL] [--from ISO --to ISO] [--write]; --replay [--rebuild dev-NAME] [--write]; --inspect EVENT_ID; --explain REPORT_ID --explain REPORT_ID; --bridge --write; --health; --check; --fixture PATH (offline, no writes). Default dry run.',
    );
    return;
  }
  const signal = AbortSignal.timeout(10 * 60 * 1000);
  const controller = new AbortController();
  process.once('SIGTERM', () => controller.abort());
  process.once('SIGINT', () => controller.abort());
  const combined = AbortSignal.any([signal, controller.signal]);
  const namespace = values.rebuild ?? 'live';
  if (values.rebuild && !/^dev-[a-z0-9_-]{1,60}$/.test(values.rebuild))
    throw new Error('rebuild_requires_new_dev_namespace');
  if (values.rebuild && !values.replay)
    throw new Error('rebuild_requires_replay');
  const from = values.from
      ? z.iso.datetime({ offset: true }).parse(values.from)
      : undefined,
    to = values.to
      ? z.iso.datetime({ offset: true }).parse(values.to)
      : undefined;
  const registry = z
    .array(sourceSchema)
    .parse(
      JSON.parse(
        await readFile(
          new URL('../../../sources/news/registry.json', import.meta.url),
          'utf8',
        ),
      ),
    );
  if (values.fixture) {
    if (values.write) throw new Error('fixture_writes_forbidden');
    const reports = z
      .array(reportSchema)
      .parse(JSON.parse(await readFile(values.fixture, 'utf8')));
    const events: NewsEvent[] = [];
    for (const report of reports) {
      const result = await processReport(
        report,
        events,
        report.discoveredAt,
        combined,
      );
      const i = events.findIndex((e) => e.id === result.event.id);
      if (i < 0) events.push(result.event);
      else events[i] = result.event;
    }
    console.log(JSON.stringify(events, null, 2));
    return;
  }
  const needsDb =
    values.write ||
    values.replay ||
    values.inspect ||
    values.explain ||
    values.bridge ||
    values.health ||
    values.check;
  const db = needsDb ? createDatabaseClient(process.env) : null,
    repo = db ? createIntelligenceRepository(db) : null;
  const provider = process.env['NEWS_ANALYSIS_URL']
    ? createJsonAnalysisProvider({
        url: process.env['NEWS_ANALYSIS_URL'],
        model: process.env['NEWS_ANALYSIS_MODEL'] ?? 'configured',
        ...(process.env['NEWS_ANALYSIS_KEY']
          ? { apiKey: process.env['NEWS_ANALYSIS_KEY'] }
          : {}),
      })
    : undefined;
  try {
    if (repo && values.write) {
      for (const source of registry) await repo.register(source);
      await repo.namespace(namespace);
    }
    if (values.health && repo) {
      console.log(JSON.stringify(await repo.health(), null, 2));
      return;
    }
    if (values.check && repo) {
      const checks = await repo.quality();
      console.log(JSON.stringify(checks, null, 2));
      if (checks.some((c) => Number(c['violations']) > 0)) process.exitCode = 1;
      return;
    }
    if (values.inspect && repo) {
      console.log(
        JSON.stringify(await repo.event(values.inspect, namespace), null, 2),
      );
      return;
    }
    if (values.explain && repo) {
      const [a, b] = await Promise.all(
        values.explain.map((id) => repo.member(id, namespace)),
      );
      if (!a || !b) throw new Error('two_processed_report_ids_required');
      console.log(JSON.stringify(compareReports(a, b), null, 2));
      return;
    }
    const events: NewsEvent[] = [];
    let duplicates = 0,
      processed = 0,
      modelFailures = 0;
    const handle = async (report: z.infer<typeof reportSchema>) => {
      if (repo && values.write) {
        const stored = await repo.report(report.id);
        const inserted = stored ? false : await repo.store(report);
        if (stored) report = stored;
        if (!inserted) duplicates++;
        try {
          const result = await repo.process(
            report,
            namespace,
            combined,
            provider ? { analysis: provider } : {},
          );
          processed++;
          console.log(
            JSON.stringify({
              event: 'intelligence_report_processed',
              reportId: report.id,
              eventId: result.event.id,
              duplicate: result.duplicate,
              signals: result.event.signals,
            }),
          );
        } catch (error) {
          modelFailures++;
          await repo.attempt(
            namespace,
            report.sourceId,
            report.id,
            'processing_failed',
            {
              reason:
                error instanceof Error ? error.message : 'processing_failed',
            },
          );
          throw error;
        }
      } else {
        const result = await processReport(
          report,
          events,
          new Date().toISOString(),
          combined,
          provider ? { analysis: provider } : {},
        );
        const at = events.findIndex((e) => e.id === result.event.id);
        if (at < 0) events.push(result.event);
        else events[at] = result.event;
        processed++;
      }
    };
    if (values.bridge && db && repo) {
      await bridgeOfficialDocuments(db, repo, !!values.write, handle);
    } else if (values.replay && repo) {
      while (true) {
        combined.throwIfAborted();
        const reports = await repo.reports({
          ...(values.source ? { source: values.source } : {}),
          ...(from ? { from } : {}),
          ...(to ? { to } : {}),
          ...(values.write ? { namespace } : {}),
          limit: 500,
        });
        for (const report of reports) await handle(report);
        if (!values.write || reports.length < 500) break;
      }
    } else {
      const sources = repo ? await repo.sources() : registry;
      const selected = sources.filter(
        (s) =>
          s.status === 'active' &&
          (values.source ? s.id === values.source : s.discovery.length > 0),
      );
      if (!selected.length) throw new Error('no_active_sources');
      if (values.url && selected.length !== 1)
        throw new Error('url_requires_one_source');
      for (const source of selected) {
        processed = 0;
        duplicates = 0;
        modelFailures = 0;
        const fetcher = createNewsFetcher(
          source,
          createPinnedTransport({
            userAgent:
              process.env['NEWS_USER_AGENT'] ??
              'SakHaberBot/1.0 (+https://github.com/andaykhvc/news)',
            intervalMs: source.delayMs,
          }),
          repo && values.write ? repo.cache : memoryCache(),
          combined,
        );
        const stats = await crawlSource(source, fetcher, {
          signal: combined,
          onReport: handle,
          ...(values.url ? { urls: values.url } : {}),
          ...(from ? { from } : {}),
          ...(to ? { to } : {}),
          ...(repo && values.write
            ? {
                onCandidate: async (
                  url: string,
                  from: string,
                  reason: string,
                ) => {
                  await repo.candidate(url, from, reason);
                },
              }
            : {}),
        });
        if (repo && values.write) {
          const details = { ...stats, processed, duplicates, modelFailures };
          await repo.attempt(
            namespace,
            source.id,
            null,
            stats.failed || stats.discoveryFailures
              ? 'crawl_partial'
              : 'crawl_success',
            details,
          );
          await db!.query(
            'update intelligence_sources set last_stats=$2::jsonb,last_successful_check_at=case when $3 then now() else last_successful_check_at end where id=$1',
            [
              source.id,
              details,
              stats.failed === 0 && stats.discoveryFailures === 0,
            ],
          );
        }
        console.log(
          JSON.stringify({
            event: 'intelligence_crawl',
            sourceId: source.id,
            ...stats,
            processed,
            duplicates,
            modelFailures,
          }),
        );
        if (stats.failed || stats.discoveryFailures) process.exitCode = 1;
      }
      // Retry previously stored processing failures even when current discovery no longer lists them.
      if (repo && values.write)
        for (const report of await repo.reports({
          namespace,
          ...(values.source ? { source: values.source } : {}),
          limit: 30,
        })) {
          try {
            await handle(report);
          } catch {
            /* retained processing attempt; later worker retry */
          }
        }
    }
    if (!values.write)
      console.log(JSON.stringify({ dryRun: true, events }, null, 2));
  } finally {
    await db?.end();
  }
}
