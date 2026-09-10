# Prompt 1 uygulama raporu

> Bu belge önceki aşamanın tarihsel raporudur. Güncel ürün durumu: [Prompt 3](docs/phase3.md).

Doğrulama tarihi: 8 Eylül 2026.

## Uygulanan temel

- `pnpm` monorepo: Next.js App Router web iskeleti ve tek çalıştırmalık Node.js worker.
- Strict TypeScript, Zod dış sınırları, explicit domain modelleri ve ayrı paket sorumlulukları.
- Kurum/endpoint/host kayıt defteri; beş ilk kurum ve host yalnızca `candidate`, endpoint listesi boş.
- Kurum bağımsız adapter SDK, enjekte edilen HTTP, ağsız fixture adapter ve job sınırı.
- Keşif, URL denetimi, fetch, parse, normalizasyon, SHA-256, tekrar ayıklama ve atomik persistence hattı.
- `new_document`, `new_version`, `unchanged`, `failed`, `skipped` sonuçları ve JSON logları.
- Belge geçmişi, geri dönen eski içerik ve son başarılı kontrol takibi.
- PostgreSQL repository'leri, migration ve seed üretimi.
- İlk şartnamedeki temporal fact, evidence ve answer temelleri. Bunlar pasif model/şema desteğidir; otomatik yayın veya soru-cevap hizmeti değildir.
- README, ürün ilkeleri, kaynak politikası, mimari, adapter rehberi ve CI.

Kullanıcının son açıklamasına göre ürün hedefi **resmî kaynaklardan otomatik haber/duyuru toplamak ve yayımlamak** olarak belgelendi. Ayrı bir backend API uygulaması eklenmedi. Veri alımı tek başına halka açık yayın üretmez; yayın geçişi sonraki aşamadır.

## Temel kararlar

Domain saf kalır; ingestion persistence portlarını tanımlar, database uygular, worker birleştirir. Kuruma özgü kod çekirdekte bulunmaz. Bir kurumun birden çok endpoint ve host'u olabilir. Kaynakların otomatik güven kazanması engellenir.

Belge sürümleri ve gözlemleri immutable'dır. PostgreSQL tek transaction ve satır kilidiyle canonical belge kaydını serileştirir. Aynı içerik aynı belge için çoğaltılmaz. `A → B → A` iki sürüm, üç gözlemle korunur. Eski fetch güncel pointer'ı geri alamaz.

Uygun framework/servis sayısı küçük tutuldu: Next.js + PostgreSQL + Node worker. Redis, vector DB, LLM, ayrı API sunucusu veya production scheduler yoktur.

TypeScript 6.0.3, mevcut lint araçlarının desteklediği son kararlı sürüm olarak seçildi; TypeScript 7 bu araçlarla henüz uyumlu değildi. Bağımlılıklar ve lockfile sabitlendi.

## Depo ağacı

```text
apps/
  web/src/app/             Sayfa, layout, /health
  worker/src/              Job, CLI, offline demo
packages/
  domain/src/              Source, crawl, document, fact, evidence, answer
  database/src/            Client, repository, mapping, memory adapter
  source-sdk/src/          Sözleşmeler, HTTP, fixture adapter
  ingestion/src/           Pipeline, persistence portları, content, retry
  validation/src/          URL, registry, publication/evidence önkoşulları
  shared/src/              Result ve logger
sources/
  registry.json
  fixtures/offline-demo.json
  README.md
database/
  config.toml
  migrations/20260908184053_foundation.sql
  seed.sql
tests/
  validation.test.ts
  content.test.ts
  domain.test.ts
  ingestion.test.ts
  http.test.ts
  database.test.ts
scripts/
.github/workflows/ci.yml
README.md
PRODUCT.md
SOURCE_POLICY.md
ARCHITECTURE.md
```

## Oluşturulan veritabanı tabloları

17 tablo: `sources`, `allowed_hosts`, `source_endpoints`, `crawl_runs`, `crawl_errors`, `documents`, `document_versions`, `document_attachments`, `document_observations`, `topics`, `entities`, `facts`, `fact_evidence`, `answer_pages`, `answer_facts`, `answer_sources`, `authority_rules`.

Çalışan veri alımı ilk dokuz tabloyu kullanır. Kalan modeller ileride sınıflandırma/doğrulama/yanıt desteği içindir. Veritabanına yalnızca sunucu ve worker'ın `DATABASE_URL` bağlantısı erişir; halka açık veri API'si yoktur.

## Testler

**6 test dosyası, 92 başarılı test.**

- Hostname/URL: tam eşleşme, açık subdomain izni, saldırgan suffix, yanlış kurum, pasif host, kullanıcı bilgisi, port, protokol, IP ve benzer karakterler.
- Registry: aday seed, duplicate/orphan kayıtlar, yanlış gov.tr host'u ve etkinlik uyumu.
- Content: deterministik SHA-256, boşluk normalizasyonu, Türkçe metin, semantic değişim, başlık/attachment değişimi ve raw text korunması.
- Domain/evidence: dokuz değer türü, hatalı değerler, tarih aralığı, supersession, dönem, expiration ve tam alıntı/offset kontrolü.
- Pipeline: yeni/değişmeyen/değişen/geri dönen sürüm, duplicate discovery, güvenilmeyen canonical/redirect/attachment, kısmi/başarısız run, retry ve cancellation.
- HTTP: her redirect için trust kontrolü, binary MIME reddi, streaming boyut sınırı ve retryable HTTP durumları.
- PostgreSQL/PGlite: migration, atomiklik/rollback, idempotency, stale fetch, immutable history, composite FK, evidence gereksinimi ve topic cycle kontrolü.

Ek olarak yerel PostgreSQL üzerinde repository okuması yapıldı. Geçersiz ingestion fonksiyonu reddedildi. Next.js üretim sunucusunda `/` ve `/health` 200 döndürdü.

## Çalıştırılan komutlar ve sonuçlar

| Komut / kontrol                            | Sonuç                                                    |
| ------------------------------------------ | -------------------------------------------------------- |
| `pnpm install --frozen-lockfile`           | Başarılı                                                 |
| `pnpm format`                              | Başarılı                                                 |
| `pnpm check`                               | Tüm aşamalar başarılı                                    |
| `pnpm format:check`                        | Başarılı                                                 |
| `pnpm lint`                                | ESLint, paket sınırları ve seed tutarlılığı başarılı     |
| `pnpm typecheck`                           | Web, worker, paketler ve testler başarılı                |
| `pnpm test`                                | 92/92 başarılı                                           |
| `pnpm build`                               | Paketler ve Next.js üretim derlemesi başarılı            |
| `pnpm worker:demo`                         | new_document → unchanged → new_version; 2 saklanan sürüm |
| `pnpm db:migrate`                          | Boş PostgreSQL üzerinde migration + seed başarılı        |
| Canlı repository ve HTTP smoke kontrolleri | Başarılı                                                 |
| `git diff --check`                         | Başarılı                                                 |

İlk yerel port çakışması projeye özel 56321/56322 portlarıyla giderildi. Önceden çalışan diğer Docker projesi değiştirilmedi. İlk TypeScript 6 declaration rootDir hatası ve SQL immutable tarih doğrulama uyarısı giderildi; yukarıdaki sonuçlar düzeltmelerden sonraki kontrollerdir.

## Prompt 2'ye bırakılanlar

- Gerçek resmî endpoint doğrulaması ve ilk kurum adapter'ı; onaylanan kaynakların etkinleştirilmesi.
- DNS/IP pinning, private/reserved IP reddi, egress/robots/oran sınırı ve gerçek ağ testleri.
- PDF/binary indirme, tam ham yanıt/dosya arşivi, çıkarım ve kanıt koordinatları.
- Duyurudan haber yayın kaydına geçiş, düzeltme ve geri çekme davranışı, son kullanıcı ekranları.
- Kalıcı retry, scheduler, worker lease ve yarım kalmış crawl kurtarma.
- Gerektiğinde bağlamsal otorite/conflict resolution, fact çıkarımı ve tam publication servisi.

Gerçek kurum taraması, otomatik haber yayını, LLM veya production cron bu teslimde çalışır durumda değildir. Uzak PostgreSQL sağlayıcısına veya canlı siteye deployment yapılmadı.
