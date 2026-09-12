# Automatic official news

The worker publishes news independently of the small typed-answer ontology. A new ÖSYM or MEB announcement no longer needs a title-specific extraction rule to appear as news. The registered HTML adapters also cover YÖK, GSB and YÖKAK; coverage remains limited to their configured endpoints and discovery bounds. This is not a crawler for every gov.tr website.

For each successfully parsed and archived document the worker selects up to four complete, exact Turkish sentences from article paragraphs. No LLM, API key or generated factual values are needed. Short announcements remain short; the page attributes the text and links the full document instead of inventing filler. Parser warnings, non-HTML documents and unsupported text are skipped with a `news_processed` reason in worker logs. PDF attachments continue through the existing extraction/review pipeline.

`official_news_facts` records document-scoped `official_statement` facts with exact UTF-16 evidence offsets. These mean “the institution stated this”, not an independently interpreted date/status claim. The SQL publisher requires an active registered source, current document version, archived parsed response, matching body offsets and nonfuture publication/fetch time. Statements and editions are immutable. Typed facts, authority resolution, conflicts and human review remain unchanged in the Answer Engine.

Action links are taken from actual anchor hrefs inside the same article. Both extraction and database publication validate their registered hosts; the reader validates the host again. Link changes participate in document fingerprinting. The rendered link label cannot redirect a user to a guessed destination: e.g. an ÖSYM link displaying ykssonuc may actually point to sonuc.osym.gov.tr. Result links are general official portals, never individual candidate results.

Public routes: `/haberler`, institution filters, `/haber/{document UUID}`. Each logical document has one URL. Only its current published edition is visible, with source institution, original publication date where explicit, excerpts, official actions, original document link and version history. An updated but not yet verified edition hides the previous article. Old publication dates stay old. The current list sorts by publication date, then first discovery, never by recrawl time. Related answer pages expose news/actions only when their evidence version matches the news edition.

Homepage caches at most 60 seconds; news and answer pages are server-rendered dynamically, with request-local React cache to avoid duplicate reads. No client state package. Sitemap includes at most 200 currently healthy news editions and canonical metadata; a missing database safely produces an empty feed. Sources with old or unsuccessful checks show explicit stale wording. A healthy container heartbeat is process liveness, not proof that every source crawl succeeded.

## Operation

1. Apply migrations with the existing `pnpm db:migrate` using the server-only DATABASE_URL. The migration runner also applies registry seeds. New host records are exact scoped entries; no wildcard trust.
2. Rebuild/restart `docker compose -f deploy/compose.worker.yml up -d --build`.
3. Scheduler continues per-endpoint schedules, bounded concurrency, leases and retry backoff. New content is published during each crawl without a manual publishing command. Existing documents are converted during their next successful recrawl. `--source osym --write` or `--source meb --write` is available for an initial catch-up, but should not compete with another active crawl for that source.
4. Inspect `news_processed`, crawl summary/error events and `/admin` source health/news section. A parsed article can publish even when an ancillary PDF or optional model extraction later fails; the article warns about incomplete source checks.
5. Vercel serves the site; Docker performs crawling. A Mac-based worker requires the Mac awake and Docker running. For continuous operation move the same container/env to an always-on server; Vercel alone does not run this worker.

Verification covers archived evidence prerequisites, four exact sentences and dates, actual href vs displayed URL, fabricated text/action rejection, idempotency, changed-document withdrawal, inactive-source withdrawal, stale check messaging, MEB article date selection, parser-warning skips and unchanged typed-answer safeguards. Synthetic test data is restricted to ephemeral PGlite; it is never seeded into production.
