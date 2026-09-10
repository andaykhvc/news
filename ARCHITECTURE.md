# Şak Haber mimarisi

## Çalışan sınır

Prompt 2; resmî kaynak keşfi, sürümlü belge arşivi, yapılandırılmış aday çıkarımı, deterministik doğrulama, fact/evidence kayıtları ve inceleme durumunu uygular. Next.js, PostgreSQL ve kısa ömürlü Node.js worker vardır; ayrı backend API veya mesaj broker'ı yoktur. Prompt 3, bu hattın üzerinde `@sak/answers`, Türkçe SSR ekranları, kontrollü yayın ve kalıcı worker işleri kurar. Eski `answer_pages` tabloları korunmuştur; kanonik kaynak kimliği katalogda, gerçek cevap ise anlık doğrulanmış projeksiyondur.

```text
SOURCE → DOCUMENT → DOCUMENT VERSION → FACT → EVIDENCE → ANSWER
```

## Paket sınırları

| Paket      | Sorumluluk                                                                       | Workspace bağımlılıkları               |
| ---------- | -------------------------------------------------------------------------------- | -------------------------------------- |
| domain     | Saf modeller, ontology/candidate/structure şemaları                              | Yok                                    |
| shared     | Result ve JSON logger                                                            | Yok                                    |
| validation | Kaynak, kanıt, Türkçe değer, bağlamsal yetki, güncellik                          | domain                                 |
| source-sdk | Adaptör sözleşmesi, HTML yapı koruma, sınırlı sayfalama, DNS/IP sabit HTTP       | domain, shared, validation             |
| ingestion  | Hash/sürümleme, retry, PDF, provider sözleşmesi, doğrulama orkestrasyonu, sağlık | domain, shared, validation, source-sdk |
| answers    | Türkçe intent, kanonik kaynaklar, yetki/zaman/kanıt/sağlık çözümü                | domain, validation                     |
| database   | Repository portları, PostgreSQL erişimi ve atomik SQL fonksiyonları              | domain, ingestion, answers             |
| education  | Beş kurumun selector profilleri ve veri odaklı ontology                          | domain, source-sdk                     |
| worker     | CLI, sağlayıcı/adapter/repository birleşimi                                      | Uygulama paketleri ve education        |
| web        | Next.js SSR cevap ve yönetim ürünü                                               | domain, validation                     |

Ingestion veritabanı paketini import etmez. Kurum seçicileri ve eğitim yetki kuralları yalnızca `sources/education` içindedir. Domain ağ/React/PostgreSQL sürücüsü bilmez. Workspace paketleri özel TypeScript kaynak paketleridir; worker `tsx`, Next.js transpilation kullanır. `check-boundaries.mjs` bağımlılık yönlerini denetler.

## Veri ve kanıt hattı

Crawl başlatılır; kayıt defteri, endpoint ve adapter uyumu doğrulanır. Genel HTTP istemcisi her yönlendirmede allowlist kontrolü yapar. Node taşıyıcısı DNS sonucunu tek bağlantıya sabitler, özel/rezerve IP'leri reddeder, TLS hostname kontrolünü korur. Host başına en az 1,5 saniye aralık, 30 saniye istek sınırı, en çok 3 redirect ve 10 MB ham yanıt sınırı uygulanır. Retry yalnızca geçici hatalar için; CLI iki deneme ve sınırlı `Retry-After` beklemesi kullanır.

Genel HTML ayrıştırıcısı başlık, paragraf, liste ve tablo satırı blokları üretir. Bloklar immutable `raw_text` içindeki UTF-16 aralıklarına bağlanır. Script/iframe/navigation içerik değildir. Kaynak yanıtının tam HTML/PDF baytları ayrıca SHA-256 ile arşivlenir. Canonical, yayın metadata'sı ve ek ilişkileri saklanır. Kayıt dışı ek dosya ana belgeyi düşürmez; ayrı hata yaratır.

PDF ayrı worker thread içinde ayrıştırılır: 10 MB, 80 sayfa, 2 milyon karakter, 20 saniye ve V8 bellek sınırı. PDF JavaScript'i, haricî kaynak yükleme ve OCR yoktur. Bozuk veya metinsiz dosya `needs_review` olur. PDF ayrı logical document/version, `source_responses.parent_version_id` ve attachment metadata'sı ile ana sürüme bağlıdır. Şifreli belgelerin içeriği tahmin edilmez.

## Sürümler ve idempotency

Mantıksal belge kimliği `(source_id, canonical_url)`; version kimliği `(document_id, content_hash)` olur. `persist_ingested_document` belgeyi satır kilidiyle atomik olarak günceller. `A → B → A` iki immutable sürüm ve üç gözlem oluşturur. Eski fetch güncel pointer'ı geri alamaz. Aynı crawl/document yalnızca bir observation üretir.

Eski v1 metin normalizasyonu korunur. Yeni parser çıktılarında exact raw_text ve `structure` de hash zarfına girer; konumları değişen metin yanlışlıkla eski kanıt sürümüyle birleştirilmez. Değişken fetch zamanları hash'e girmez. Ham HTTP artefact hash'i ayrı tutulur.

Extraction anahtarı version, provider/model, prompt sürümü, ontology içeriği ve validator sürümünden oluşur. Tamamlanan extraction tekrar çalışmaz. Geçici başarısız extraction yeniden denenebilir; her başarısız deneme immutable kayıttır. Claim hash aynı bağlam/değer/kaynak fact'ini; evidence kimliği fact/version/alıntı/locator tekrarını engeller.

## Çıkarım ve doğrulama

Provider yalnızca resmî sürümün metnini, yapısını ve ontology'yi alır. OpenAI Responses adaptörü `store:false`, strict JSON schema ve tools içermeyen istek kullanır. Typed değerler wire üzerinde JSON string olarak taşınır; dönüşte domain'in strict tagged union şemasından geçirilir. Model seçimi/anahtar açıkça yapılandırılır. Refusal, eksik yanıt ve şema hatası başarısız extraction kaydı olur. Hidden chain-of-thought saklanmaz.

Aday; entity/topic/predicate, typed value, value_text, açık dönem ve exact quote/range/page taşır. Source/authority/status model alanı değildir. Deterministik doğrulayıcı exact alıntıyı, blok/sayfa sınırını, değer metnini, tarih gramerini, açık yılı, entity kapsamını, predicate semantiğini ve konuya özgü kaynak yetkisini ayrı denetler. Belirsizlik `needs_review`, desteklenmeyen iddia `rejected` olur. Genel KPSS iddiası farklı öğrenim düzeyleri arasında karıştırılmaz.

Date, date_range, datetime, money, number, boolean, status, string, URL, JSON desteklenir. Para exact decimal string'dir. Tarih-only değer timestamp'e çevrilmez. Kaynakta UTC offset'i olmayan yerel saat otomatik datetime olmaz. JSON için kayıtlı semantik validator olmadığı sürece inceleme gerekir. Karmaşık tablo, eksik yıl ve düzeltme ifadeleri otomatik doğrulanmaz.

SQL `record_extraction` tek transaction'da attempt, validation, fact ve evidence oluşturur. SQL ayrıca exact UTF-16 konum, sayfa, aktif host/kaynak ve veritabanındaki authority kuralını denetler. Verification için audit kaydı ve güncel kaynağa ait evidence gerekir. CLI `published` durumuna geçmez.

## Çelişki, dönem ve güncellik

Yetki, topic + predicate + isteğe bağlı entity → source kuralıdır. Küresel kurum sıralaması veya son crawl kazananı yoktur. Aynı entity/topic/predicate/dönemde farklı yetkili değerler varsa ilgili fact'ler `needs_review` olur. Eski veri korunur. Operatör `resolve_fact_correction` ile aynı bağlamdaki yeni kanıta açık gerekçe ve reviewer kimliği ekleyerek supersession yapabilir; bu RPC model/otomatik crawler tarafından çağrılmaz. Terminal kayıtlar yeniden etkinleştirilmez.

`published_at`, `verified_at`, `effective_at`, `[valid_from, valid_until)`, `superseded_at`, `reference_period` ayrı kavramlardır. `validateFactPublication` dönem ve geçerlilik; `validateCurrentEvidence` current version, son gözlem, son başarılı kontrol ve kaynak sağlığı önkoşullarını sağlar. Answer Engine yayın, güncel kanıt, aday doğrulama izi ve kaynak sağlığını birlikte zorunlu uygular. Eski yılın fact'i güncel yılın sorusuna taşınamaz.

## Kapsam ve işletim

`source_coverage` her crawl'ın taranan sayfalarını, kapsam türünü, completeness ve nedenlerini saklar. Pencere taraması tüm arşiv taraması sayılmaz. Boş liste parser drift hatasıdır; bulunamayan belge “duyuru yok” kanıtı değildir. Önceki en az üç başarılı crawl'a göre yüzde 70 üzeri keşif düşüşü veya üç art arda başarısızlık inceleme sebebidir. Sınırlandırılmış tarama limitleri raporda görünür.

Bir kurum, sayfa veya PDF hatası sonraki kurumları durdurmaz. Endpoint işleri `FOR UPDATE SKIP LOCKED` ile alınır; 45 dakikalık lease, iş başına 20 dakika process sınırı, üç deneme ve token kontrollü tamamlama vardır. Tek worker örneği tavsiye edilir; aynı kurumun endpoint'leri eşzamanlı çalışmaz. Farklı kurumların ortak host paylaşımına yönelik global hız sınırlaması henüz yoktur.

## Veritabanı ve testler

İlk 17 tablo korunur. Yeni altı tablo: `source_artifacts`, `source_responses`, `extraction_attempts`, `candidate_validations`, `source_coverage`, `fact_resolutions`. Tüm 23 tabloda RLS kapalı erişim politikası; anon/authenticated tablo ve RPC kullanamaz. Invoker hakları, FK indeksleri ve immutable history trigger'ları kullanılır. Service role tarayıcıya verilmez.

Vitest/PGlite testleri gerçek resmî fixture'lar üzerinden HTML/PDF kanıtını, idempotency, değişen sürümü, çelişki/explicit resolution, yanlış yıl/değer/sayfayı ve SQL izinlerini doğrular. Canlı DNS/HTTP smoke ve yerel Docker SQL lint ayrı kontrollerdir. Detaylar [Phase 2 raporu](docs/phase2.md).

## Cevap projeksiyonu

Kullanıcı sorgusu → Türkçe normalizasyon/alias → entity + event/predicate + açık veya güncel yıl → tek transaction snapshot → aktif bağlamsal yetki → yayıma açık fact → güncel belge sürümünde birebir kanıt ve eşleşen grounding audit → Türkçe şablon. Model çağrısı yoktur.

Normal YKS, YKS ek yerleştirme ve YKS yerleştirme ayrı entity bağlamlarıdır. Çelişki veya needs_review kayıtları, yayımlanmış bir satır seçilerek atlanamaz. Süresi bitmiş olay ile geçerliliği bitmiş fact ayrılır. Başarılı tarama tek başına yokluk sonucu üretmez; işlenen sürümlerin çıkarım kapsamı da tamamlanmalıdır.

Public DB okumaları servis anahtarıyla yalnızca sunucudadır. Next.js cevapları dinamik SSR'dır; aynı istekte React cache tekrarları önler. İstekler arasında kritik fact cache'i yoktur, böylece sonraki istekte revocation/değişiklik görünür. Katalog/statik sayfalar önbelleğe alınır; arama parametreleri, yönetim ve kanıtsız/sağlıksız cevaplar noindex'dir. Ayrıntılar: [Prompt 3 raporu](docs/phase3.md).
