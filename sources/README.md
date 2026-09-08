# Kaynak adaptörü ekleme

Bu klasörde canlı kurum crawler'ı yoktur. `registry.json` ilk aday kurum/alan adı paketidir; `fixtures/` ise yalnızca ağsız test verisidir. Sentetik fixture kayıtlarını resmî registry'ye veya production seed'ine eklemeyin.

Gelecekte bir adapter `sources/<source-key>/` altında kendi `package.json`, `src/adapter.ts`, fixture dosyaları ve davranış testleriyle yer alabilir. `pnpm-workspace.yaml` bu paketleri kapsar.

1. Kurumu registry'ye `candidate` olarak ekleyin. Eğitim dışındaki kurumlar aynı modeli kullanır.
2. Gerçek uç noktaları ve her redirect/attachment host'unu resmî kaynaktan doğrulayın. Bir kurum için birden fazla host ve endpoint normaldir. Doğrulanmamış URL tahmin etmeyin.
3. Host onayı ve etkinleştirmeyi açıkça yapın. `include_subdomains` varsayılan olarak false kalır; wildcard yalnızca denetlenmiş bir güven sınırı için kullanılır.
4. `SourceAdapter` uygulayın. `sourceKey` registry slug'ına uymalıdır. `discover` URL ve external ID; `fetch` alınmış metin/son URL; `parse` canonical URL, başlık, metin, yayın zamanı ve ek dosya referanslarını döndürür.
5. Parse'ı kaydedilmiş fixture'larla test edin. Boş sonuç, değişmiş HTML, eksik tarih, redirect, attachment ve hatalı karakter kodlamasını kapsayın. Kaynakta bulunmayan tarihi/tutarı tahmin etmeyin.
6. HTTP taşıyıcısında allowlist, her redirect için denetim, DNS/IP sabitleme, private IP reddi, limit ve cancellation uygulayın. İlk metin adaptöründe Cheerio kullanılabilir; Playwright yalnızca statik HTTP'nin yetersiz olduğu kanıtlanınca eklenir.
7. Adapter'ı worker'ın adapter map'ine kaydedin. Persistence, retry, normalize/hash ve crawl sayaçlarını genel hatta bırakın.
8. İkinci aşamada yayın servisi doğrulanmış document version'ı değerlendirir. Adapter doğrudan haber veya fact yayımlamaz.

SDK sözleşmesi:

```ts
import type { SourceAdapter } from '@sak/source-sdk';

// Her metot { ok: true, value } veya { ok: false, error } döndürür.
// error: { type, message, retryable }
// Uygulama kurum paketinde kalır; SDK'ya/ingestion'a kurum dallanması eklenmez.
type InstitutionAdapter = SourceAdapter;
```

Adaptöre Supabase client veya sunucu anahtarı verilmez. Adaptör kaynak metnini parse eder; persist ve publication ayrı uygulama sorumluluklarıdır.
