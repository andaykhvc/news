# Publication date audit — 12 September 2026

## Reproduced discrepancy

The discrepancy was rendering timezone, not a one-day error in the source or database. Before the fix, the homepage showed 9 September for ÖSYM's “2026-KPSS: Alan Bilgisi Oturumları İçin Sınav Günü Açık Tutulacak İl/İlçe Nüfus Müdürlükleri”; `/haberler` showed 10 September. The fetched official page explicitly says `DUYURU (10 Eylül 2026)`. The latter was correct. ÖZYES similarly appeared as 8 September on the homepage versus its actual 9 September publication on `/haberler`.

| Official document                         | Source local date/time    | Stored published_at (UTC) | Before: homepage | Before: /haberler | Correct      |
| ----------------------------------------- | ------------------------- | ------------------------- | ---------------- | ----------------- | ------------ |
| ÖSYM KPSS Alan Bilgisi nüfus müdürlükleri | 10 Eylül 2026 (date only) | 2026-09-09T21:00:00Z      | 9 September      | 10 September      | 10 September |
| ÖSYM ÖZYES results                        | 9 Eylül 2026 (date only)  | 2026-09-08T21:00:00Z      | 8 September      | 9 September       | 9 September  |
| MEB ortak yazılı sınav takvimi            | 10 Eylül 2026 20:05       | 2026-09-10T17:05:00Z      | 10 September     | 10 September      | 10 September |

Official examples:

- https://www.osym.gov.tr/2026-kpss-alan-bilgisi-oturumlari-icin-sinav-gunu-acik-tutulacak-ililce-nufus-mudurlukleri
- https://www.osym.gov.tr/2026-yks-kapsaminda-spor-bilimleri-icin-ozel-yetenek-sinavi-ozyes-sinav-sonuclari-aciklandi
- https://www.meb.gov.tr/ulke-geneli-ortak-yazili-sinav-takvimi-belli-oldu/haber/41874/tr

## Complete data path

1. The HTML parser reads an explicitly offset `article:published_time` if present. Otherwise it parses the ÖSYM dated announcement heading or MEB's scoped article publication element. Turkish source date/time is interpreted with `+03:00`; date-only ÖSYM announcements use local midnight as the existing storage convention. No claim about a known publication hour is displayed for those announcements. The original source date text remains in `metadata.structure.publication_date`.
2. `fingerprintDocument` includes `parsed.published_at`; a changed publication date creates a new immutable document version. The pipeline passes the parsed publication and independent fetch time unchanged to persistence.
3. `persist_ingested_document` stores the parsed publication in both `documents.published_at` and `document_versions.published_at`, using PostgreSQL `timestamptz`. Fetch time populates `fetched_at`/observation metadata, not publication. UTC midnight-boundary representations are expected: 10 September 00:00 Turkey is 9 September 21:00 UTC.
4. `official_news_editions.created_at` records Şak Haber's edition verification/publication operation; it is exposed separately as `verified_at`. It does not override the institution's date.
5. `listNews`/`getNews` select the current version's `v.published_at`. The database client normalizes driver Date values to ISO UTC without changing the instant. React request caching and the homepage's 60-second cache do not transform dates.
6. `/haberler` explicitly formatted that instant in Europe/Istanbul. The homepage's separate formatter omitted `timeZone`, so the Vercel UTC server displayed the preceding calendar day. The locale `tr-TR` selects Turkish wording, not Turkey's timezone.

## Fix

Both feeds now render the same `NewsDate` component, using the existing `formatDate` function with explicit `Europe/Istanbul`. It reads `published_at` exclusively for the publication label. Missing publication is explicitly “Yayın tarihi belirlenemedi”, followed by separately labeled “Son kontrol” metadata. Both surfaces use identical wording and semantic `<time datetime>` values. Article detail already uses the same timezone-aware `formatDate` helper.

No date arithmetic, one-day subtraction, database timestamp rewrite, parser behavior change, migration or worker restart is needed. Stored official dates are correct.

## Regression coverage

Tests render both actual page components with the same mocked news records, compare publication labels and datetime attributes, and cover the live KPSS, ÖZYES and MEB examples plus clearly labeled missing-date fallback. Run the rendering suite with TZ=UTC to reproduce the production environment; it also exercises multiple process timezone settings. Parser tests cover Turkish midnight, 23:59, year/month rollover, leap day, equivalent explicit offsets and no substitution of a later crawl time. PGlite integration verifies repeated crawls and SQL timezone changes cannot replace source publication with fetch or edition timestamps.
