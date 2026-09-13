# Part 1 validation — 13 September 2026

Implemented on `codex/news-intelligence-engine` in the separate `haber-news-intelligence` worktree, based on merged PR #11. Existing official-document ingestion, publication-date handling, public answers and news pages were preserved.

## Verified results

| Check                                   | Result                                                                                                                                                                   |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm check`                            | Passed formatting, lint, package boundaries, seed/catalog checks, strict workspace/test TypeScript, 255 tests and production builds                                      |
| `pnpm test:e2e`                         | All 6 existing desktop/mobile product journeys passed against the production build                                                                                       |
| `pnpm intelligence:demo`                | Four synthetic reports → one event; AA copies → one family; explicit 2/4 injury conflict; later correction → 4 supported, 2 superseded; repeat → no extra timeline entry |
| Production PostgreSQL migration         | `20260913120000_news_intelligence.sql` applied to the configured Neon database; existing seeds reapplied idempotently                                                    |
| Docker                                  | Separate `sak-intelligence-intelligence-1` container built, started and observed healthy; the existing official worker was retained                                      |
| Live TRT discovery                      | 20 reports fetched/parsed, 0 article failures, 0 missing publication dates, 0 publication parsing failures                                                               |
| Live AA discovery after date correction | 20 reports fetched/parsed, 0 article failures, 0 missing publication dates, 0 publication parsing failures                                                               |
| Live replay of a TRT report             | Duplicate recognized, same event ID, unchanged timeline                                                                                                                  |
| Live intelligence data quality          | 0 mismatched evidence quotes, 0 claims lacking evidence, 0 events lacking an update                                                                                      |
| Existing answer data quality            | 0 invalid published answers and 0 fixture documents in the production official-document store                                                                            |
| Model use                               | No News Analysis gateway configured; live tests and the demo used deterministic logic                                                                                    |

The live rollout exposed AA timestamps such as `2026-09-13T14:15:54.47`. They are Turkish local clocks with fractional seconds. The parser now preserves them as `2026-09-13T11:15:54.470Z`; initially the valid RSS publication date was retained as an explicitly identified feed fallback. Reprocessing stores a new immutable revision where publication metadata changed. Regression tests cover these clocks and midnight/year boundaries.

A large official document also exceeded the bounded entity extraction schema. Deterministic extraction now retains an explicit `entity_limit`, `claim_limit` or `long_sentence_skipped` limitation where applicable and stays within the schema. Original report text remains available for future reprocessing; bounded extraction does not pretend to be complete.

A separate environment-validator defect discovered during hardening incorrectly applied PostgreSQL URL rules to `PUBLIC_SITE_URL`. HTTP(S) site origins now validate independently; this has a regression test. New worker variables are validated without printing their values.

This verifies a local Docker worker connected to the existing live database. It does not claim an always-on remote-worker deployment or a new Vercel production deployment. The bootstrap registry contains two open-web sources. Scaling, richer Turkish extraction, calibrated reliability and consumer event presentation remain separate work described in the [architecture and operations guide](news-intelligence.md).
