# Resmî kaynak ve güven politikası

## Kayıt defteri

İlk aşamada kabul edilebilir kanıt kaynakları, **açıkça onaylanan `gov.tr` alan adlarıdır**. Herhangi bir `gov.tr` sitesi kendi başına güvenilir sayılmaz. Başlangıç verisinin tek düzenleme yeri `sources/registry.json`; veritabanı seed'i `pnpm seed:generate` ile üretilir. Çalışan işler güncel veritabanı kayıtlarını yükler.

ÖSYM, MEB, YÖK, GSB/KYGM ve YÖKAK için araştırılmış altı endpoint ve açık host kayıtları etkindir. Kararlar [uç nokta raporunda](docs/official-endpoints.md) belgelenmiştir. Eski çıplak alan adı kayıtları candidate kalır. `www` dahil alt alan adları otomatik kabul edilmez. Her kurum birden fazla ayrı, onaylanmış alan adı ve uç noktaya sahip olabilir.

`candidate → active` operatörün araştırıp verdiği açık bir karardır. `disabled` geçici kapatma; `deprecated` artık kullanılmayan kaynak içindir. Yeni keşfedilen kaynaklar otomatik etkinleşmez. İşlem için kurum, uç nokta ve eşleşen alan adı etkin olmalıdır.

## URL doğrulaması

- URL, standart `URL` API'siyle ayrıştırılır.
- Çalışan hat HTTPS kullanır. HTTP ancak yardımcı fonksiyonda açık seçenekle mümkündür; seed ve pipeline HTTP'yi açmaz.
- Alan adı karşılaştırması kurum kimliğiyle sınırlandırılmış kesin eşleşmedir.
- Alt alan adı kabulü yalnızca `include_subdomains: true` ise ve `.` sınırıyla yapılır.
- Kullanıcı bilgisi, standart dışı port, IP adresi, geçersiz protokol ve kayıt dışı alan adı reddedilir.
- Fragment kimlikten çıkarılır. Sorgu parametreleri ve yollar korunur; kurum bilgisi olmadan sorgu silinmez/sıralanmaz.
- Keşif, fetch sonucu, canonical URL ve ek dosya URL'leri doğrulanır. HTTP taşıyıcısı her redirect adımından önce aynı denetimi uygular.
- `osym.gov.tr.attacker.com`, `fakeosym.gov.tr.example.com` ve yalnızca ismi benzeyen alan adları kabul edilmez.
- Sondaki DNS noktası normalleştirilerek güven genişletilmez; kayıt dışı sayılır. WHATWG URL'nin ASCII/punycode sonucu karşılaştırılır.

Kayıt defteri; yinelenen kimlik/slug/alan adı, yetim kayıt, kayıt dışı endpoint ve aday kuruma bağlı etkin endpoint gibi hataları reddeder.

## Ağ ve adaptör sınırı

Kaynak adaptörleri güvenilir uygulama kodudur; sandbox değildir. Veritabanı veya key almazlar. HTTP bağımlılığı enjekte edilir; retry/toplu kayıt işleri adaptörün dışındadır.

`createHttpClient` HTTPS/redirect, MIME, timeout ve bayt sınırını uygular. `createPinnedTransport` DNS sonuçlarının tamamını özel/rezerve IP açısından denetler ve bağlantıyı doğrulanmış IP'ye sabitler. TLS orijinal hostname'i doğrular. Host başına pacing ve açık crawler User-Agent kullanılır. Retry-After sınırlı olarak dikkate alınır. Kayıt dışı redirect'e istek gönderilmez.

PDF yanıtı ham baytlarıyla saklanır; signature/MIME, boyut, süre, sayfa ve metin limitleri ayrı parser tarafından kontrol edilir. OCR veya eksik içerik tahmini yoktur. Erişim engeli aşılmaz; MEB dinamik arşivi bu nedenle etkin değildir. Ağ kontrolleri process düzeyindedir; üretimde tek worker ile çalıştırılmalıdır.

## Tarihçe ve yayın

Belge sürümleri ve gözlemleri eklemeli/immutable kayıtlardır. `last_successful_check_at` yalnızca hatasız crawl sonrasında ilerler; kısmi/başarısız deneme kendi run/error kaydında görünür. Duyuru yayımlanma zamanı, alınma zamanı ve doğrulanma zamanı birbirinin yerine geçmez.

Toplanan belge otomatik olarak doğrulanmış haber, yayımlanmış fact veya answer sayılmaz. Kaynak metninin doğru alıntılanması, bağlamdaki yetki, güncellik, dönem ve belirsizlik ayrı değerlendirilir. Yayın servisinin uygulanması sonraki aşamadır.

Halka açık veritabanı yetkileri bu aşamada kapalıdır: tüm uygulama tablolarında RLS etkin; `anon` ve `authenticated` için tablo/RPC erişimi yoktur. Worker'ın sunucu anahtarı tarayıcıya gönderilemez.
