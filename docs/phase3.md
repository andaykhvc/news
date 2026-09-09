# Prompt 3 — Şak Haber cevap ürünü

Doğrulama: 9 Eylül 2026. Bu aşama önceki belge/fact motorunu genişletir; yeniden yazmaz. Üretim yayını yapılmış değildir.

## Korunan mimari ve düzeltilen kusurlar

Next.js/Vercel, Supabase/PostgreSQL, kurum adaptörleri, DNS/IP sabit HTTP, ham artefact arşivi, değişmez belge sürümleri, UTF-16 kanıt konumları, PDF sınırları, typed fact'ler, contextual authority, extraction audit ve kaynak kapsamı korunmuştur. Ayrı API sunucusu, vektör altyapısı veya istemci state kütüphanesi eklenmedi.

Normal YKS tercihleri, ek yerleştirme ve yerleştirme sonuçları ayrıldı. Mevcut generic YKS kanıtlarının ek yerleştirme bilgisiyle normal tercih sayfasını doldurması da engellendi. Aynı claim'in yeni belge sürümünde yeniden doğrulanması artık eski immutable evidence yüzünden yanlışlıkla gizlenmiyor; yalnızca güncel sürüm kanıtı gösteriliyor. Eski altı topic ID'sinin PostgreSQL ile Zod arasındaki UUID variant uyumsuzluğu, referansları değiştirmeyen dar bir uyumluluk kuralıyla giderildi. Seed üreticisi çözülemeyen kimlikleri reddediyor.

Vercel önizlemesinin önceki hatası UI'daki build log'undan doğrulandı: Next.js build geçmiş, `public` çıktı klasörü beklentisi dağıtımı durdurmuştu. `apps/web/vercel.json` Next.js preset'i ve `.next` çıktısını açıkça tanımlar.

## Answer Engine

`@sak/answers` saf ve deterministiktir. Kullanıcıya gösterilen kritik değer şu zincire bağlıdır:

```text
REGISTERED ACTIVE GOV.TR SOURCE → DOCUMENT → CURRENT DOCUMENT VERSION
→ PUBLISHED FACT → EXACT EVIDENCE + MATCHING GROUNDING AUDIT → ANSWER
```

Tek transaction snapshot üzerinde entity/predicate/topic/yıl, aktif bağlamsal yetki, verification/publication zamanı, yarı açık geçerlilik aralığı, document current pointer, kayıtlı host, alıntı/blok/sayfa konumu ve adayın fact değeriyle birebir eşleşmesi kontrol edilir. İnsan düzeltmesi dahi matching grounding audit gereksinimini kaldıramaz. Factual değerler model hafızasından gelmez; Türkçe cevaplar sabit şablonlardır.

Durumlar: güncel, ileri tarih duyurulmuş, dönemi/geçerliliği bitmiş, superseded, çelişki/needs_review, doğrulanmış cevap yok, başarıyla izlenen kaynaklarda bulunamadı ve veri erişimi yok. Çelişki varsa en yeni/güzel satır seçilmez. Eski yıl güncel soruyu yanıtlamaz. Etkinlik tarihi ile fact'in effective/validity zamanları ayrıdır. Bilinmeyen status, JSON ve URL değerleri genel metin şablonuyla yayımlanmaz.

“Bulunamadı” yalnızca başarılı ve sağlıklı izleme, taranan sayfalar ve gözlenen sürümlerin tamamlanmış çıkarım kapsamıyla üretilebilir. Sınırlı tarama, ret/incelenmeyen aday veya eksik extraction bu sonucu engeller. Metin tüm arşivin tarandığını veya kurumun hiç duyuru yapmadığını iddia etmez.

## Query Engine ve kanonik kaynaklar

Türkçe case/diakritik normalizasyonu, açık alias'lar, sınırlı yazım mesafesi, entity/event/predicate eşlemesi ve açık yıl vardır. Yıl belirtilmezse Europe/Istanbul yılı kullanılır. Çelişkili yıllar veya desteklenmeyen bilgi türü bir tarihe zorlanmaz. PostgreSQL `pg_trgm` + `simple` full-text indeksleri yalnızca alternatif konu önerir; bulanık DB eşleşmesi otomatik factual cevap seçmez.

On editoryal cevap kaynağı vardır; her eş anlam için yeni sayfa üretilmez. Örnek: “YKS ek tercih ne zaman?”, “yks ikinci tercih”, “ek yerleştirme ne zaman” → `yks_extra` → `/yks/2026/ek-yerlestirme`. Katalog, ontology ve yetki eşleşmesi lint kapsamında doğrulanır. [PostgreSQL trigram yaklaşımı](https://www.postgresql.org/docs/current/pgtrgm.html).

## Public deneyim, kanıt ve keşfedilebilirlik

Ana sayfa “Ne öğrenmek istiyorsun?” araması ve Sınavlar, Üniversite, MEB/Okul, KYK kategorileri etrafındadır. Cevap sayfasının ilk görünümünde soru, durum, doğrulanmış değer/temkinli cevap, kurum ve son başarılı kontrol vardır. Devamında kurumun belgesi, başlık, biliniyorsa yayın tarihi, gov.tr linki, alıntı ve locator; ardından fact/sürüm kimlikleri ve güncelleme geçmişi gösterilir. İzlenen endpoint bağlantısı, bir duyurunun kanıtı diye sunulmaz.

Aynı süreçteki bağlantılar/timeline yalnızca yayıma açık doğrulanmış yapılandırılmış fact'lerden gelir. Bilgi yoksa üretilmiş dolgu veya sahte zaman çizelgesi görünmez. Tarih, sonuç ve kılavuz ayrımları ancak ontology/katalogda karşılığı ve kanıtı varsa genişletilebilir.

Search, feedback ve admin formları native HTML'dir; özel istemci bileşeni yalnızca hata ekranının yeniden deneme düğmesidir. Semantik başlıklar, skip link, görünür klavye odağı, reduced-motion ve mobil düzen vardır. Harici font, izleme betiği veya reklam bileşeni yoktur.

Canonical, metadata ve OpenGraph görünür cevapla aynı çözümlenmiş değeri kullanır. JSON-LD `WebPage` ve gerçek citation'lardır; görünmeyen FAQ, NewsArticle veya sahte publication date yoktur. Arama/admin/kanıtsız/sağlıksız cevaplar noindex; sitemap yalnızca güncel yılın sağlıklı yayımlanmış kaynaklarını ve temel sayfaları içerir. Geçmiş yıl sayfaları doğrudan erişilebilir; sitemap kapsamı bilinçli olarak sınırlıdır.

## Cache ve güncellik

Ana sayfa/statik içerik cache edilir; yıl geçişi için ana sayfanın bir saatlik revalidation'ı vardır. Cevaplar dinamik SSR, aynı istekteki tekrarlar React cache ile birleştirilir. Okuma ilgili konu grubuyla sınırlandırılır. Kritik fact snapshot'ı istekler arasında saklanmaz: yayın, ret veya supersession sonraki istekte görünür; gecikmiş webhook/invalidation bağımlılığı yoktur. Uzun TTL veya stale-while-revalidate ile revoked fact sunulmaz.

Kaynak eşiği `max(3 × poll_interval_seconds, 1 saat)`; son gözlem, son başarılı kontrol, en son tamamlanan crawl ve parser uyarıları değerlendirilir. Eski ama hâlâ kanıtlı bir değer gösterilecekse güncellik uyarısı cevabın başındadır. DB/şema/timeout hatası güvenli unavailable cevabına dönüşür. `/health` veri erişimini ve kaynak sağlığını raporlar.

## Yönetim ve worker

`/admin`: kaynak sağlığı/kapsamı, son başarılı crawl, parser drift, değişen belgeler, extraction çalışmaları, aday ret/review nedenleri, verified/published/conflict kayıtları, gecikmiş cevaplar, lease/retry durumları ve anonim feedback görünür. Son kayıtlar 50'lik zaman pencereleriyle incelenir. Yayın/review/ret için gerekçe ve optimistic concurrency kontrolü; düzeltme için ayrı audited supersession vardır. Ham adayın doğrulamasını bypass eden onay düğmesi yoktur.

Admin tek operatör içindir: scrypt parola hash'i, rastgele nonce'lu sekiz saatlik HMAC oturumu, güvenli cookie, origin kontrolü, DB rate limit. Public raw tablo erişimi kapalıdır. Göreli POST dönüş adresleri proxy/hostname kaynaklı yanlış yönlendirmeyi önler. Referrer policy yalnızca origin taşır; query metni dış bağlantılara aktarılmaz.

Worker per-endpoint aralık, 1–4 concurrency, kurum başına tek etkin iş, `SKIP LOCKED`, 45 dakikalık lease, 20 dakikalık process sınırı, SIGTERM/SIGKILL, bounded retry ve token kontrollü tamamlamayı kullanır. Kaynak satırı kilidi eşzamanlı claim'lerde aynı kurumun ikinci endpoint'inin alınmasını önler. Aynı iş tekrar alınabilir; mevcut belge/extraction idempotency korunur. Docker üretim görüntüsü, read-only filesystem, non-root kullanıcı, kaynak sınırları ve heartbeat healthcheck sağlanmıştır. Anonim veri temizliği başlangıçta ve saatliktir.

## Gizlilik

Eksik arama bildirimi açık kullanıcı eylemidir; yalnızca katalog sözlüğündeki kelimeler ve yıl saklanır. Ham query, bilinmeyen isimler, e-posta, uzun kimlik/telefon numaraları atılır. Fayda ölçümü gün+konu bazında sayaçtır. Rate limit için günlük dönen IP HMAC'i ayrı tabloda tutulur, query ile bağlanmaz. Aggregate kayıtlar 30 gün, rate-limit kayıtları bir gün saklanır. Hosting erişim günlüklerinin retention'ı ayrıca işletmeci tarafından ayarlanmalıdır.

## Gösterilen kullanıcı yolculuğu

1. Kullanıcı: **“YKS ek tercih ne zaman?”**
2. Normalizasyon: `yks ek tercih ne zaman`; anlam: `yks_ek_yerlestirme`, `education.exams`, `preference_period`, 2026, tarih isteği.
3. Kanonik adres: `/yks/2026/ek-yerlestirme`.
4. Aktif ÖSYM yetkisi, doğru yıl, publication/temporal durum, güncel document version ve exact grounding/evidence kontrolü.
5. İzole testte, açıkça **TEST FİKSTÜRÜ** işaretli sentetik bir tarih aralığı cevap başında; aynı fixture'ın source/document/version/fact/evidence kimlikleri ve yayım geçmişi altında gösterilir. Bu sentetik YKS tarihi gerçek bir ÖSYM duyurusu olarak sunulmaz ve uygulama/seed'e yüklenmez.
6. Gerçek yerel DB'de YKS ek tercih için yayımlanmış doğrulanmış bilgi yoktur; izleme de şu anda gecikmiştir. Gerçek ürün bu nedenle tarih uydurmaz; “doğrulanmış cevap yok” ve güncellik uyarısı gösterir. ÖSYM izleme linki bir duyuru kanıtı olarak etiketlenmez.

Query, authority, temporal resolution, değer gösterimi ve cevap metni **tamamen deterministik**. Opsiyonel model yalnızca önceki aşamanın worker extraction sağlayıcısıdır; bu aşamanın search/answer/demo testlerinde model çağrısı yapılmadı.

## Doğrulama ve sınırlar

Son sonuçlar aşağıda ayrı kaydedilir. Testler; alias→canonical, future date, superseded, yanlış yıl, conflict/needs_review, scoped absence, eksik extraction, parser/stale coverage, exact evidence linki, missing grounding audit, legacy YKS ayrımı, immutable evidence, validity expiry, SQL lease/token, kurum kilidi, RLS, rate limit/retention, yayın/ret zinciri ve admin oturumunu kapsar. Browser testleri yalnızca localhost PostgREST double kullanır; uygulamada fixture veya saat override anahtarı yoktur.

Yerel veri kalite kontrolü: 0 yayımlanmış fact, 0 invalid published answer, 0 sentetik fixture belge. Mevcut gerçek DGS fact'i yayın/güncellik kontrolü bekliyor. Bu, production içerik kapsamının tamamlandığı anlamına gelmez.

Bilinen sınırlar: henüz production deploy/remote migration yapılmadı; gerçek YKS ek yerleştirme tarihi doğrulanmadı; public katalog 10 kaynakla sınırlı; OCR/karmaşık PDF tabloları ve genel JSON cevapları yok; admin tek operatör, MFA/SSO yok; scheduler kurumları ayırır ancak farklı kurumların ortak host kullanımı için global dağıtık hız limiti yok; büyük yük testi ve dış alarm kanalı kurulumu yok. Model extraction isteğe bağlıdır ve canlı model kalibrasyonu yapılmadı. Operator onayı olmadan yeni fact halka açılmaz.

En güvenli sonraki adımlar: [dağıtım rehberindeki](deployment.md) doğru proje/secret/migration kontrolleri, sınırlı canlı tarama, gerçek kanıtlı fact yayını, Vercel preview doğrulaması, worker health ve source freshness alarmı; ardından production promotion.

### Son çalıştırma sonuçları

| Kontrol                                                  | Sonuç                                                              |
| -------------------------------------------------------- | ------------------------------------------------------------------ |
| Prettier, ESLint, paket sınırları, seed/katalog kontrolü | Geçti                                                              |
| Strict TypeScript + üretim Next.js/workspace build       | Geçti                                                              |
| Vitest birim/entegrasyon                                 | **199 / 199 geçti**                                                |
| Playwright Chromium, masaüstü + mobil                    | **28 / 28 geçti**                                                  |
| Yerel üç yeni migration + seed'ler                       | Uygulandı; mevcut veriler korundu                                  |
| Supabase `db lint --local --level warning`               | Hata yok                                                           |
| Yerel canlı cevap veri kalitesi                          | Invalid published answer: 0; fixture belge: 0; yayımlanmış fact: 0 |
| Worker Docker build + non-root/read-only CLI smoke       | Geçti                                                              |
| Eski worker demo uyumluluğu                              | Geçti; production'da demo kapalı                                   |

Masaüstü/mobil ekran görüntüleri yerel `artifacts/screenshots/` altında üretilmiştir. E2E fixture'ları yalnızca localhost test sunucusundadır; Docker image ve production seed'ine girmez. Büyük ölçekli yük testi yapılmadı; bunlar işlev ve güvenlik sınırı kontrolleridir.
