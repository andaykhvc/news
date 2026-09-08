# Resmî kaynak ve güven politikası

## Kayıt defteri

İlk aşamada kabul edilebilir kanıt kaynakları, **açıkça onaylanan `gov.tr` alan adlarıdır**. Herhangi bir `gov.tr` sitesi kendi başına güvenilir sayılmaz. Başlangıç verisinin tek düzenleme yeri `sources/registry.json`; veritabanı seed'i `pnpm seed:generate` ile üretilir. Çalışan işler güncel veritabanı kayıtlarını yükler.

ÖSYM, MEB, YÖK, GSB ve YÖKAK kaynakları/alan adları `candidate` olarak eklenmiştir. Başlangıç seed'inde **uç nokta yoktur**. `www` dahil alt alan adları otomatik kabul edilmez. Her kurum birden fazla ayrı, onaylanmış alan adı ve uç noktaya sahip olabilir.

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

Bu aşamada varsayılan canlı ağ taşıyıcısı yoktur. `createHttpClient` HTTPS/redirect, metin MIME türü, timeout ve yanıt boyutu sınırlarını sağlar; gerçek taşımayı çağıran kod verir. **Alan adı doğrulaması DNS güvenliği değildir.** İlk gerçek adaptörle birlikte private/link-local/reserved IP reddi, DNS rebinding koruması ve doğrulanan IP'ye sabitlenmiş bağlantı uygulanmalıdır. Browser adaptörü gerekirse istek ve alt kaynaklarında da aynı çıkış politikasını korumalıdır.

Şimdiki metin taşıyıcısı PDF gibi binary içeriği reddeder. PDF'den çıkarılmış metne ait kanıt konumları, ham dosya hash'i ve binary saklama Prompt 2 işidir.

## Tarihçe ve yayın

Belge sürümleri ve gözlemleri eklemeli/immutable kayıtlardır. `last_successful_check_at` yalnızca hatasız crawl sonrasında ilerler; kısmi/başarısız deneme kendi run/error kaydında görünür. Duyuru yayımlanma zamanı, alınma zamanı ve doğrulanma zamanı birbirinin yerine geçmez.

Toplanan belge otomatik olarak doğrulanmış haber, yayımlanmış fact veya answer sayılmaz. Kaynak metninin doğru alıntılanması, bağlamdaki yetki, güncellik, dönem ve belirsizlik ayrı değerlendirilir. Yayın servisinin uygulanması sonraki aşamadır.

Halka açık veritabanı yetkileri bu aşamada kapalıdır: tüm uygulama tablolarında RLS etkin; `anon` ve `authenticated` için tablo/RPC erişimi yoktur. Worker'ın sunucu anahtarı tarayıcıya gönderilemez.
