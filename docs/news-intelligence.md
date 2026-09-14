# News Intelligence, Part 1

This is an independent, autonomous **research pipeline**. Open-web reports become evolving event records, not publishable Şak Haber articles. Existing education ingestion, verified answers, official news, publication dates, evidence pages and Next.js routes remain in place.

`OPEN WEB REPORTS → EVENT CANDIDATE → EVENT CLUSTER → ATOMIC CLAIMS → EVIDENCE / CONFLICTS → EVOLVING NEWS EVENT`

## Components and persistence

- `packages/news-intelligence`: strict Zod contracts, Turkish normalization, discovery/robots/HTTP policies, extraction, clustering, provenance families, reconciliation and confidence. It has no database or web-application dependency.
- `packages/database/src/intelligence.ts`: report storage, bounded candidate search, optimistic namespace revisions, replay, evidence inspection and health.
- `apps/worker/src/intelligence-*`: CLI, scheduled source leases and official-document bridge. The existing worker command remains available unchanged.
- `sources/news/registry.json`: TRT Haber and Anadolu Ajansı bootstrap RSS sources, verified public HTML selectors, fixed host allowlists and fetch budgets. Source settings synchronize at startup while persisted disabled status, leases and health survive configuration changes.
- `20260913120000_news_intelligence.sql`: separate source, candidate, HTTP cache, immutable report, event, claim, immutable evidence/update/attempt and namespace tables. All use RLS; no anonymous/public policies are granted. The worker uses the existing server-side PostgreSQL connection.

A logical report key identifies a source and canonical URL. Its immutable revision ID includes a hash of title, normalized body and actual publication/modification metadata. `discoveredAt` never changes its identity or substitutes for `publishedAt`. A changed page produces a new report revision; repeat retrieval does not append another event update. Evidence has exact UTF-16 offsets and quotes into stored report text. SQL rechecks those quotes, official-version identities and append-only history before atomically saving a projection. Each update retains the claims, signals, candidate decision and engine version at that point in time.

Namespaces isolate live events from `dev-*` rebuilds. An indexed occurrence/publication range and logical report membership select at most 500 candidate events. A namespace revision/CAS prevents overlapping workers from assigning one report to two clusters; conflicts retry against refreshed candidates. The 501st candidate causes an explicit retryable processing error, not silent truncation. An event is capped at 1,000 report revisions. These are operational guardrails, not a claim of benchmarked large-scale capacity.

## Discovery and access policy

RSS, Atom, standard sitemap, sitemap indexes, Google news sitemap publication fields, and configured public HTML article indexes are supported. `<link rel="alternate">` advertisements are recorded as candidate feeds, including external sites. Candidates are not automatically trusted or granted new host permissions; adding an active source is an explicit registry/configuration change, not a per-article review workflow.

Requests enforce HTTPS, approved hosts, public DNS/IP resolution pinned through the existing transport, manual redirect validation, source pacing, size limits, 25-second request deadlines and at most three transient retries. Validators and response bodies persist for `ETag` / `Last-Modified` requests, including across worker restarts. HTTP 304 reuses the prior body; it does not mean the article was just published. Cache bodies expire after seven days without checks; immutable reports and evidence do not expire.

Robots groups, allow/disallow specificity, wildcard/end rules and crawl-delay are respected. Unavailable robots policy fails closed, except a missing 404/410 policy. Cross-host redirects require pre-registration. Authentication gates, CAPTCHA/challenge pages, explicit paywalls and unsupported content types fail rather than triggering a browser/access workaround. No PDF pipeline was added here; the existing official PDF processing remains separate. Robots behavior follows the [Robots Exclusion Protocol](https://www.rfc-editor.org/rfc/rfc9309).

Publication metadata, Turkish date strings, explicit ISO offsets and RFC feed dates are parsed separately from discovery time. Offsetless Turkish clocks use +03 for 2016 onward; ambiguous earlier clocks stay unknown. Sitemap `lastmod` is never a publication date. Date-only input retains its Turkish calendar day when represented in UTC. Source timestamp parsing failures and missing timestamps remain inspectable.

## Extraction, clustering and reconciliation

The default costs no model calls. Deterministic logic normalizes Turkish case, diacritics, apostrophes, common word variants, all 81 provinces and a bootstrap alias set of districts, roads, institutions and teams. Proper-name patterns cover additional people, organizations and locations. It identifies traffic accidents, fires, earthquakes, crime, sports, politics and a general fallback without category-specific approval gates.

Atomic extraction covers event occurrence, reported places, vehicle/injury/death/detention counts, earthquake magnitude, road closure/reopening and event ending. Every value is attached to a verbatim quote; geographic entities and explicit event dates must be grounded. Unknown or unsupported information is omitted. Extraction is deliberately incomplete rather than inventing details; a report with no extracted claims can still form a research event with zero claim-confidence score.

Candidates must have compatible event type, geography and event time. Explicit occurrence dates take priority over publication time, including late-arriving coverage. Same logical-report revisions stay together. Distinctive roads, people, organizations, teams and places, lexical overlap, near-identical body copies and a bounded time window contribute visible scores. Close competing candidates create an ambiguous separate event rather than a forced merge. Events are not destructively merged later; development replay into another namespace can reevaluate them.

Upstream agency attribution (AA, DHA, İHA, Reuters, AP, ANKA), registered ownership families and near-identical normalized body copies collapse likely syndicated reports into one evidence family. Unknown ownership stays explicitly marked. This is a conservative provenance heuristic, not proof of independent reporting.

A claim value is `weakly_supported` with one family, `supported` with multiple families or a valid official-document bridge, `conflicting` when active incompatible values coexist, and `superseded` after a later version or explicit correction from the same evidence family. "Supported" describes corroboration, not a guarantee of truth. A later independent disagreement cannot simply overwrite earlier evidence. Late arrival order does not turn an older correction into current information. Prior quotes, status transitions and corrections remain in the timeline.

Confidence/importance expose report/family counts, unknown origins, actual source-date freshness, active/supported claims, geographic specificity, recent report/update velocity, official evidence and contradictions. Source reliability is an explicit bootstrap prior, not an empirically calibrated truth score. Historical successful/partial crawls and processing failures are available in source health; automated learning of reliability from those histories is deferred. Scores are snapshots at the last event update, with `updatedAt`, not continuously refreshed live probability estimates.

## Optional model contracts

`AnalysisProvider` and `SemanticProvider` are vendor-independent interfaces. `NEWS_ANALYSIS_URL` enables the optional HTTPS JSON analysis gateway; the gateway receives `model`, `instructions`, a JSON `schema`, and untrusted article `data`, and must return the analysis object directly. `NEWS_ANALYSIS_MODEL` and `NEWS_ANALYSIS_KEY` are optional gateway settings. It receives no tools or permission to change registry, confidence, SQL or publication. Outputs have a 200 KB bound and schema/quote/entity/date/value checks; known numeric and boolean claims are rechecked against deterministic predicates. Failures remain stored pending reports with processing-attempt reasons for replay.

Semantic assistance is an injectable library interface, not a bundled embedding service. It can only help borderline compatible candidates and cannot bypass hard geographic/time exclusions. No model or vector service is necessary for startup or the fixtures. A model cannot output a ready-to-publish article through this pipeline.

## Run and operate

Use the existing PostgreSQL `DATABASE_URL` in an ignored `.env.worker` file. The same server connection supports both workers; no new Vercel variable is required. Optional `NEWS_CONCURRENCY=1..4` defaults to 2. A custom `NEWS_USER_AGENT` must begin with `SakHaberBot/` to match the robots policy token. Keep credentials out of the repository and logs.

From the repository root, with Node/pnpm available:

```sh
node --env-file=.env.worker --import tsx scripts/migrate-database.ts
node --env-file=.env.worker --import tsx scripts/check-environment.ts --worker --production
docker compose -p sak-intelligence -f deploy/compose.intelligence.yml up -d --build
docker compose -p sak-intelligence -f deploy/compose.intelligence.yml ps
docker compose -p sak-intelligence -f deploy/compose.intelligence.yml logs -f --tail=100
```

This is a separate Compose project and service; `deploy-worker-1` continues the original official pipeline. Discovery runs in bounded child processes, with per-source 15-minute leases and host overlap exclusion, 10-minute run deadlines, hard child termination at 11 minutes, source backoff and a 15-minute bootstrap schedule. The maintenance lane bridges up to 100 archived official documents every 15 minutes and emits source health. It never fetches official pages again or writes official facts/answers. Official evidence requires a current registered document version with matching raw text, canonical URL and a parsed archived response. Host-qualified bridge sources have no web-discovery schedule.

The heartbeat reflects a running scheduler with recent database contact. Use `--health` for source readiness: a running container alone does not establish successful ingestion. Structured logs include discovered/parsed/failed/unchanged counts, publication parsing failures, duplicate/processing counts, per-report clustering decisions in event history and processing errors. Empty changed markup is a parser-drift failure; one source or article failure does not stop the others.

CLI examples (run from repository root; `pnpm` forwards the remaining arguments):

```sh
pnpm intelligence:demo
pnpm intelligence --source trt-haber                       # dry run, no DB
pnpm intelligence --source trt-haber --url https://www.trthaber.com/haber/EXAMPLE.html
node --env-file=.env.worker --import tsx apps/worker/src/main.ts --intelligence --health
node --env-file=.env.worker --import tsx apps/worker/src/main.ts --intelligence --check
node --env-file=.env.worker --import tsx apps/worker/src/main.ts --intelligence --inspect EVENT_ID
node --env-file=.env.worker --import tsx apps/worker/src/main.ts --intelligence --explain REPORT_ID --explain REPORT_ID
node --env-file=.env.worker --import tsx apps/worker/src/main.ts --intelligence --replay --write
node --env-file=.env.worker --import tsx apps/worker/src/main.ts --intelligence --replay --rebuild dev-experiment --write
```

`--from` / `--to` take explicit ISO timestamps: live discovery filters source publication timestamps; stored replay filters report discovery timestamps. Write replay pages through pending reports until caught up or the run deadline, and can resume safely. Read-only replay is bounded to 500 reports. Development rebuilds create/resume their isolated namespace and never erase live events. `--fixture PATH` is offline and refuses `--write`; the demo imports synthetic fixture reports only in its explicit developer script. No fixture content enters production seeds or the scheduler.

## Demonstration and checks

`pnpm intelligence:demo` runs four explicitly synthetic reports. The first two differently worded Ankara–Eskişehir accident reports create one event and one AA evidence family. A third independent report leaves 2-versus-4 injuries explicitly conflicting. A later AA correction supersedes 2 and supports 4 through two families; the event ID stays fixed, with four timeline entries. Replaying the first report creates no fifth update. Output includes the actual supporting quotes and clustering reasons.

Tests cover that journey, independent/nearby incidents, dates across Turkish midnight/leap days, late arrival/occurrence dates, canonical revisions, copied bodies without road anchors, false model geography/predicates, absent dates, decimals, optional semantic constraints, source outages, robots/access restrictions, XML discovery methods, persistent HTTP validators, SQL quote validation, immutable history, revision races, host leases and safe replay namespaces. Existing official-answer/news/date and browser tests remain part of the full suite.

Remaining limits: two configured live sources rather than demonstrated hundreds; a finite Turkish alias/predicate vocabulary; approximate family detection; time-window clustering can fragment a long-running or highly ambiguous event; no automatic cluster-to-cluster merge; no trained source-reliability model; no consumer open-web pages, rewriting, imagery, SEO or event publication. Next production work should expand sources gradually using unresolved extraction and parser-health evidence, evaluate clustering precision on a labeled corpus, and move the worker to an always-on host if unattended operation must continue while this Mac sleeps.
