# Prompt 2 teslim raporu

> Bu belge Prompt 2 teslimini kaydeder. Güncel ürün durumu: [Prompt 3](phase3.md).

9 Eylül 2026. Dal: `codex/education-ingestion`.

## Uygulanan hat

Beş gerçek kurum adaptörü, altı etkin endpoint, exact host registry, yapı koruyan HTML parser, sınırlandırılmış PDF parser, SHA-256 ham dosya arşivi, sürümleme, strict aday çıkarımı, deterministik doğrulama, bağlamsal çelişki/inceleme durumu ve CLI tamamlandı. Ayrı backend API veya yeni altyapı servisi eklenmedi.

Kurum seçicileri ve 20 entity içeren başlangıç eğitim ontolojisi `sources/education` içinde. Generic paketlerde eğitim/kurum dallanması yok. Kaynaklar [uç nokta raporunda](official-endpoints.md), kurallar [mimaride](../ARCHITECTURE.md) açıklanmıştır.

## Migration

`20260908193230_education_ingestion_verification.sql` ilk migration'ı değiştirmeden altı audit/arşiv tablosu ekler; toplam 23 tablo. Datetime değer kontrolü, exact UTF-16 evidence, claim/evidence idempotency, context conflict ve gerekçeli supersession RPC'leri bulunur. Tüm tablolarda RLS etkin; browser rolleri tablo/RPC kullanamaz. Ham artefact'lar 10 MB üst sınırıyla PostgreSQL bytea olarak tutulur; ayrı object storage gerekmez.

Migration mevcut yerel Docker veritabanına uygulandı; veri resetlenmedi. Registry ve ontology seed'i yerel veriyi koruyarak uygulandı. SQL lint uyarısız geçti.

## Doğrulama sonuçları

- `pnpm check`: Prettier, ESLint, paket sınırları, seed tutarlılığı, strict TypeScript, **141 test** ve üretim Next.js/paket build kontrolü.
- `pnpm worker:demo`: eski sentetik `new_document → unchanged → new_version` örneği korunuyor.
- PGlite: gerçek PostgreSQL migration/RPC, rollback, idempotency, evidence, çelişki, supersession, terminal durum, izin ve immutable history testleri.
- Gerçek ÖSYM DGS HTML → strict aday → verified fact → exact sürüm kanıtı.
- Gerçek 52 sayfalık KPSS Ortaöğretim PDF → 2. sayfadan verified tarih; yanlış sayfa reddedilir. İlk iki sayfa ayrıca görsel olarak incelendi.
- Uydurulmuş tarih/alıntı, doğru alıntıdaki yanlış predicate-değer ilişkisi, farklı referans yılı, eksik yıl, kayıt dışı kaynak ve modelin status alanı reddedilir veya incelemeye alınır.
- Metinsiz/bozuk/büyük PDF, kaybolan selector, keşif sayısı çöküşü ve tekrarlanan kaynak hatası testleri.
- Uzun belge page/block sınırlarında en fazla 100.000 karakterlik provider pencerelerine ayrılır; local evidence offset'leri özgün immutable sürüme geri eşlenir. En fazla 20 pencere; tek blok sınırı aşarsa sessiz kesme yapılmaz.
- Yerel PostgreSQL repository smoke: doğrudan resmî ÖSYM HTML ilk çalışmada `new_document`, ikinci çalışmada `unchanged`; fact `verified`, tekrar extraction atlandı. Bu denemede aday sağlayıcısı açıkça fixture idi, canlı LLM kullanılmadı.

## Canlı kaynak kontrolü

Bir sayfa/bir belge sınırında ÖSYM, MEB, GSB duyuru, GSB haber ve YÖKAK başarılı; YÖK ana belgeyi kaydetti, üç kayıt dışı ek host bağlantısı nedeniyle **partial** döndü. Bu, tam kurum/arşiv kapsamı değildir. Tarama sayfaları, completeness ve nedenler ayrı audit bilgisidir.

## Etkin olmayanlar ve bilinen sınırlar

- MEB dinamik duyuru arşivi erişimi reddetti; yalnızca erişilebilir ana sayfa haber penceresi etkin. YÖK `personel.yok.gov.tr` ekleri doğrulanıp kaydedilene kadar alınmaz. Eski çıplak kurum host kayıtları candidate; wildcard güven yok.
- Canlı OpenAI çağrısı yapılmadı. Adaptör resmî Responses/Structured Outputs sözleşmesine göre yazıldı; çalıştırmak için açık API anahtarı/model ve `--provider openai` gerekir. Üretim model doğruluğu/maliyeti için ayrı değerlendirme gerekir.
- Doğrulama konservatiftir: tanınmayan ifade, karmaşık tablo, belirsiz yerel saat/UTC offset'i, eksik dönem, kaynağa dayanmayan entity alt kapsamı ve JSON semantiği incelemeye gider. OCR yoktur.
- Çelişkiler otomatik en-yeni seçimiyle çözülmez. Operatör kanıtı inceleyip `resolve_fact_correction` çağırmalıdır; gerekçe/reviewer ve eski→yeni ilişki saklanır. Ayrı editör yetkilendirmesi/admin ekranı henüz yoktur.
- Fact'in doğrulanması kullanıcıya yayınlanması değildir. Prompt 3 yayın/sorgu servisi dönem/geçerlilik ve güncel kaynak/coverage kontrollerini birlikte zorunlu kullanmalıdır.
- Rate limit process başınadır. Üretimde tek worker çalıştırılmalı; scheduler, process çökmesi sonrası lease/recovery, çoklu worker egress koordinasyonu, kapasite/yük testi ve yedekleme politikası ayrıca kurulmalıdır.
- Bytea arşivi ilk ölçek için seçildi. Büyük arşivlerde kapasite ölçülerek object storage'a taşınabilir; public site için worker anahtarı verilmez.

## Prompt 3'e bırakılanlar

Doğal dil sorgu/arama ve Answer Engine, kaynaklı yanıt sunumu, kullanıcı ana sayfası, SEO/sitemap/yayın sayfaları, editör/admin deneyimi, kullanıcıya açık yayın katmanı. Reklam veya LLM ile haber yazma hattı eklenmedi. Canlı yayın/deploy ve üretim zamanlaması açılmadı.

Başlangıç komutları [README](../README.md) içinde.
