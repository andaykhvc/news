# Şak Haber mimarisi

## Çalışan ürün sınırı

Güncel hedef, resmî duyuruların otomatik takip edilip yayımlanmasıdır. Dağıtılabilir bileşenler Next.js web uygulaması, PostgreSQL/Supabase ve kısa ömürlü Node.js worker işidir. Ayrı bir backend API framework'ü, mesaj broker'ı veya ek altyapı servisi yoktur.

Prompt 1, güvenilir veri alımı temelini uygular. Haber yayın akışı sonraki aşamadır. İlk kapsamdan gelen fact/evidence/answer tabloları ve tipleri pasiftir; çalışan worker yalnızca resmî belgeleri ve sürümlerini saklama sınırındadır.

## Paket sınırları

| Paket        | Sorumluluk                                                 | Workspace bağımlılıkları               |
| ------------ | ---------------------------------------------------------- | -------------------------------------- |
| `domain`     | Saf Zod modelleri ve açık yaşam döngüleri                  | Yok                                    |
| `shared`     | Result ve yapılandırılmış JSON logger                      | Yok                                    |
| `validation` | Kaynak, URL, kanıt ve yayın önkoşulları                    | domain                                 |
| `source-sdk` | Adaptör sözleşmesi, enjekte edilen HTTP ve fixture desteği | domain, shared, validation             |
| `ingestion`  | Genel hat, hash, retry ve repository portları              | domain, shared, validation, source-sdk |
| `database`   | Supabase erişimi, SQL RPC ve test belleği                  | domain, ingestion                      |
| `web`        | App Router iskeleti                                        | domain, validation                     |
| `worker`     | Bağımlılıkları birleştirme ve tek iş yürütme               | Uygulama paketleri                     |

Domain React, Supabase veya HTTP istemcisi bilmez. Ingestion, database paketini import etmez; persistence portlarını tanımlar. Database bu portları uygular. Worker gerçek repository/adaptör/transport birleşimini yapar. Supabase sorguları yalnızca database paketindedir.

Workspace paketleri özel TypeScript kaynak paketleridir; bağımsız npm dağıtımı hedeflenmez. Next.js kaynakları transpile eder, Node worker `tsx` ile çalışır; paket build adımları declaration üretir.

## Bilginin kökeni

```text
SOURCE → DOCUMENT → DOCUMENT VERSION → FACT → EVIDENCE → ANSWER
```

Source kurumdur, endpoint denetlenecek kaynaktır. Document kaynak kurum + canonical URL ile tanımlanan mantıksal belgedir. Version içerik anlık görüntüsüdür. Fact yapılandırılmış iddiadır; FactEvidence bu iddiayı belirli bir version içindeki metne bağlar. AnswerPage kanonik soru kaynağıdır; AnswerFact ve AnswerSource ilişkileri destekleyen bilgileri tutar.

Fiziksel evidence tablosu fact ve version kimliklerine bağlanır; oklar kavramsal köken zincirini gösterir. Yayınlanan duyurular da aynı document/version kökenini kullanmalıdır. Kaynak → LLM → SEO makalesi şeklinde bir hat yoktur.

## Kaynak adaptörleri

`SourceAdapter` bir `sourceKey` ve `discover`, `fetch`, `parse` metotlarından oluşur. Metotlar typed `Result` döndürür; dış sınırlar Zod ile doğrulanır. Hatalarda tür, mesaj ve retryable bilgisi bulunur. Adapter exception'ları da crawl hatası olarak kaydedilir.

Adapter'ın elinde yalnızca kurum, endpoint, logger, abort signal ve HTTP client bulunur. Arbitrary veritabanı erişimi veya kendi retry döngüsü yoktur. Cheerio bir HTML adaptörünün iç detayı olabilir; Playwright yalnızca gerçek browser ihtiyacı kanıtlanınca enjekte edilen bir taşıyıcıya eklenir.

`source-sdk/testing` fixture adaptörü ağ kullanmaz. `sources/fixtures` altındaki veriler sentetik olarak işaretlidir ve resmî registry/seed'e girmez.

## Veri alımı

```text
run başlat → kaynak/endpoint/adaptör uyumunu doğrula
  → discover → URL doğrula → bu keşifteki tekrarları atla
  → fetch → son URL doğrula → parse → canonical/ekleri doğrula
  → normalize → hash → atomik persist
  → sayaç/hata kayıtları → run bitir → başarılı kontrol zamanını ilerlet
```

Kayıtlı bir belge sonraki crawl'da yeniden fetch edilir; aksi halde güncellemeler bulunamaz. Keşif tekrarları fragment kaldırılmış URL ile; parse sonrası aynı çalışmadaki canonical tekrarları canonical URL ile ayıklanır. Kuruma özgü hiçbir dallanma yoktur.

Sonuçlar `new_document`, `new_version`, `unchanged`, `failed`, `skipped` şeklindedir. En az bir başarılı belge ve hata varsa `partial`; yalnızca hata/fatal kesinti varsa `failed`; hatasız boş keşif dahil diğer durumlar `success` olur. Kısmi/başarısız run, başarılı kontrol zamanını ilerletmez.

Varsayılan retry sayısı birdir. Enjekte edilen politika en fazla beş deneme, üstel bekleme ve iptal sinyali destekler. Yalnızca adapter'ın açıkça retryable dediği sonuçlar tekrarlanır. Kalıcı iş kuyruğu, production backoff/jitter/rate limits ve yarım kalmış iş kurtarma yoktur.

## Normalizasyon, sürümleme ve eşzamanlılık

`v1` yalnızca CRLF/CR satır sonlarını, yatay ASCII boşluk tekrarlarını, satır başı/sonu boşluğunu ve aşırı boş satırları düzenler. Türkçe karakter, noktalama, rakam ve anlamlı satır kırılımları korunur. Unicode compatibility normalizasyonu, küçük harfe dönüştürme veya içerik kesme yapılmaz.

Hash sabit sırada serialize edilen normalization sürümü, başlık, normalize metin, MIME türü, document türü, yayın zamanı ve sıralı ek dosya tanımları üzerinden SHA-256'dır. Adapter metadata'sı key sırası/değişken crawler ayrıntıları gereksiz sürüm üretmesin diye hash'e dahil edilmez. Raw text korunur ve normalize metinden ayrı tutulur; alınan HTML/binary yanıtın tam arşivi henüz uygulanmaz.

`persist_ingested_document` tek PostgreSQL transaction'ında canonical belgeyi bulur/oluşturur, belge satırını kilitler, immutable version ve attachment kayıtlarını ekler, current pointer'ı değiştirir ve gözlem yazar. Unique `(source_id, canonical_url)` ve `(document_id, content_hash)` eşzamanlı tekrarları engeller. Hata tüm kaydı geri alır. `(crawl_run_id, document_id)` aynı işte idempotency sağlar.

`A → B → A` durumunda iki version vardır, üç gözlem bulunur ve current pointer yeniden A olur. Reversion `new_version` sonucu verir; yeni bir immutable blob yaratması şart değildir. Mevcut `latest_seen_at` değerinden eski fetch reddedilir; geç ulaşan iş güncel içeriği geri alamaz.

## Veritabanı tabloları

| Alan                                  | Tablolar                                                                  |
| ------------------------------------- | ------------------------------------------------------------------------- |
| Kaynak kayıt defteri                  | sources, allowed_hosts, source_endpoints                                  |
| İşletim                               | crawl_runs, crawl_errors                                                  |
| Belge arşivi                          | documents, document_versions, document_attachments, document_observations |
| Gelecekteki sınıflandırma             | topics, entities                                                          |
| Gelecekteki yapılandırılmış doğrulama | facts, fact_evidence, authority_rules                                     |
| Gelecekteki kanonik yanıtlar          | answer_pages, answer_facts, answer_sources                                |

UUID kimlikler, `timestamptz` zamanlar ve foreign key'ler kullanılır. Lifecycle değerleri text/check; endpoint/document/entity türleri genişletilebilir metindir. Composite foreign key'ler endpoint'in doğru kuruma ve version'ın doğru belgeye bağlanmasını sağlar. Temel FK/join erişim yolları indekslidir; spekülatif full-text/vector indeksleri yoktur.

`topics.parent_id` hiyerarşiyi, unique `key` ise istikrarlı kimliği sağlar. Döngü kontrolü trigger'ı nadir yeniden ebeveynlendirme işlemlerini transaction advisory lock ile sıralar. Key'deki noktalar isimlendirme geleneğidir; parent ilişkisi ana kaynaktır.

Schema, CLI'nin oluşturduğu başlangıç migration'ında sürümlenir. `sources/registry.json` tek seed kaynağıdır. Sonradan yapılan operatör etkinleştirmeleri seed tekrar çalıştırıldığında geri çevrilmez. Sunucu repository'leri explicit TypeScript row mapping ve Zod çıktı kontrolü kullanır. Registry okumaları Data API'nin satır sınırını aşabilmek için sayfalanır.

## Temporal fact ve evidence temeli

Fact value bir discriminated union'dır: date, date_range, money, number, boolean, status, string, url ve `schema_key` taşıyan structured JSON. Para tutarı JSON'da exact decimal string'dir; binary float değildir. PostgreSQL de temel union biçimini doğrular. Structured JSON'un schema_key'e özgü kuralları ileride ilgili validator'a aittir.

`published_at`, `verified_at`, `effective_at`, `[valid_from, valid_until)`, `superseded_at` ve `reference_period` farklı anlamlardadır. Date değerleri takvim tarihidir, timestamp'ler offset içerir. Dönem null ise otomatik olarak bugünkü yıl kabul edilmez. Eski fact immutable kalır; yeni fact oluşturulup eski kayıt superseded yapılır.

Kanıt belirli bir immutable sürümdeki `raw_text` alıntısıdır. Opsiyonel konumlar UTF-16 code unit başlangıç/bitişi (bitiş hariç), 1 tabanlı sayfa, bölüm ve DOM selector içerir. Pure validator tam metin ve offset eşleşmesini doğrular. SQL trigger kaynak sahipliği ve alıntı mevcudiyetini zorunlu tutar. PDF koordinat eşlemesi sonraki aşamadır.

SQL, kanıtsız published fact oluşturmayı ve geçmiş claim'i değiştirmeyi engeller. Fact repository yalnızca draft yazımı ve evidence eklenmesini açar; otomatik doğrulama/yayın servisi yoktur. Pure publication validator doğrulanma, kaynak etkinliği, dönem, geçerlilik ve evidence önkoşullarını kontrol eder. Bu kontroller bir conflict-resolution motoru veya tüm yayın güvenliğinin tamamlanması değildir.

`authority_rules` konu + predicate + isteğe bağlı entity → source eşlemesidir; küresel kurum sıralaması yoktur. Birden çok bağlamsal sahip desteklenir; çakışma çözümü ertelenmiştir.

## Güvenlik ve gözlemlenebilirlik

Tüm 17 tablo RLS ile kapalı başlar. `anon`/`authenticated` tablo ve RPC erişimi alamaz. Server service role sınırlı tablo işlemleri ve invoker-rights persistence RPC'sini kullanır; delete yetkisi verilmez. Historical tabloların update yetkisi de kaldırılır. Trigger'lar ek olarak immutable kayıtları korur. Privileged `SECURITY DEFINER` kullanılmaz.

Logger her satırda JSON yazar: timestamp, level, event ve run/source/document/version kimlikleri. Ham belge, servis anahtarı veya bütün adapter context'i loglanmaz. Operasyonel hatalar ayrıca crawl_errors tablosuna kaydedilir. Logger sink'i bağımlılık olarak değiştirilebilir.

## Test kapsamı ve sınırları

Vitest davranış testleri saf modelleri, güvenli hostname eşleşmesini, registry bütünlüğünü, normalize/hash kararlarını, pipeline sonuçlarını, HTTP redirect/boyut/MIME davranışını ve temporal/evidence önkoşullarını kapsar. PGlite testleri gerçek PostgreSQL motorunda migration, atomiklik, foreign key, trigger ve yetki davranışını sınar; Docker gerektirmez.

PGlite, Supabase'in PostgREST/Auth/Storage bileşenlerinin testi değildir. Yerel Docker doğrulaması ayrıca migration ve SQL lint ile yapılır. Gerçek adapter/HTTP/DNS, PDF, üretim concurrency yükü, worker scheduler ve public yayın politikaları Prompt 2 ve sonraki aşamalarda tamamlanır.

## Yeni kurum eklemek

Örneğin SGK için aynı sources/hosts/endpoints kayıtları ve SDK'yı uygulayan bir adapter yeterlidir. Core paketlerinde kurum if/else'i, eğitim sütunu veya özel kuyruğa ihtiyaç yoktur. Ayrıntılı adımlar [sources/README.md](sources/README.md) içindedir.

## Başvurulan resmî teknik kaynaklar

- [Next.js kurulumu](https://nextjs.org/docs/app/getting-started/installation)
- [Supabase migration akışı](https://supabase.com/docs/guides/local-development/database-migrations)
- [Supabase RLS ve izinler](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase Data API güvenliği](https://supabase.com/docs/guides/api/securing-your-api)
- [Supabase değişiklik kaydı](https://supabase.com/changelog)
