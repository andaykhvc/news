# Dağıtım ve işletim

Bu rehber mevcut Next.js/Vercel + Supabase + bağımsız Node worker mimarisini kullanır. Yeni bir backend API, Redis, vektör veritabanı veya Vercel crawler cron'u gerekmez.

## 1. Veritabanı

Önce yedek/PITR durumunu doğrulayın. Mevcut veriyi koruyarak migration uygulayın; normal güncellemede `db reset` kullanmayın. Yerel `sak-haber` projesinde API 56321, DB 56322'dir; başka Docker projelerine dokunmayın.

```sh
pnpm exec supabase migration up --local
docker exec -i supabase_db_sak-haber psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/seed.sql
docker exec -i supabase_db_sak-haber psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/product-seed.sql
pnpm db:lint
```

Uzak Supabase için doğru projeyi CLI ile bağladıktan sonra `db push` öncesinde dry run inceleyin. Registry ve product seed'ini onaylı proje bağlantısında uygulayın. Seed yalnızca kurum, host, endpoint, entity, yetki ve sorgu sözlüğü içerir; **government fact veya demo tarih içermez**. Mevcut devre dışı bırakılmış kayıtlar yeniden açılmaz. Supabase anahtarı sunucu/worker içindir; anon ve authenticated rollerinin raw tablolara/RPC'lere erişimi yoktur.

## 2. Vercel

- Root Directory: `apps/web`.
- `apps/web/vercel.json`: `framework: nextjs`, build `pnpm build`, install `pnpm install --frozen-lockfile`, output `.next`.
- Node 24, `ENABLE_EXPERIMENTAL_COREPACK=1`, kökteki pnpm lockfile ve workspace paketlerine erişim.
- Production ve Preview ortamlarını ayrı yapılandırın; önizlemeyi üretim servis anahtarına gereksiz bağlamayın.
- `PUBLIC_SITE_URL`: gerçek kanonik HTTPS origin'i. Build anında kullanıldığı için değişince yeniden build gerekir.
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`: yalnızca server environment. Supabase ile Vercel bölgesini yakın tutun.
- `ADMIN_PASSWORD_SCRYPT`, `ADMIN_SESSION_SECRET`, `ADMIN_OPERATOR`, `ANALYTICS_SALT`: yalnızca server environment. Parola hash'i aşağıdaki yordamla; iki ayrı en az 32 karakterlik rastgele anahtarı secret manager ile oluşturun.

Önceki `7689f2d` Vercel önizlemesinde Next.js build başarılıydı; son adım `No Output Directory named "public" found` hatası veriyordu. Yeni dosya `.next` ve Next.js preset'ini açıkça tanımlar. Bu hata tespiti yeni dağıtımın başarılı olduğu anlamına gelmez.

[Dosya tabanlı Vercel ayarları](https://vercel.com/docs/project-configuration) proje ayarlarını sürüm kontrolüne alır. Üretimde HTTPS, Vercel'in güvenilir proxy başlıkları ve erişim kayıtlarında kısa saklama süresi kullanın. Uygulama query metni loglamaz; sağlayıcı erişim kayıtları URL query'sini tutabilir.

## 3. Yönetici erişimi

Tek operatör modeli vardır; genel kullanıcı hesabı veya Supabase Auth kurulumu gerektirmez. İmzalı HMAC oturumu sekiz saatliktir; cookie `HttpOnly`, production'da `Secure`, `SameSite=Strict`. Her mutation origin ve oturumu kontrol eder. Giriş ve feedback DB üzerinden sınırlandırılır. Secret döndürmek tüm oturumları geçersiz kılar. Takım/SSO/MFA yetkilendirmesi henüz yoktur; çok operatörlü kullanıma geçmeden ekleyin.

Parolayı komut satırı argümanına veya git dosyasına koymayın. Parola yöneticisinden güvenli stdin üzerinden:

```sh
# En az 16 karakterlik benzersiz parolayı stdin'e sağlayın.
node scripts/hash-admin-password.mjs
```

Çıktı `salt:hash` biçimindedir; onu `ADMIN_PASSWORD_SCRYPT` secret'ı olarak kaydedin. `.env.example` yalnızca isimleri ve boş yer tutucuları gösterir. Ortamı shell'de açıkça yükledikten sonra:

```sh
pnpm env:check --production
pnpm env:check --worker --production
pnpm data:check
```

`/admin` kaynak durumunu, son crawl'ları, çıkarım hatalarını, aday ret nedenlerini, fact'leri ve cevap güncelliğini gösterir. Yayın kontrolü verified fact, güncel kanıt, grounding audit ve sağlıklı kaynak gerektirir. Gerekçeler kamuya açık geçmişte görünebilir. Ham adaylar doğrudan onaylanmaz: düzeltilmiş aday `--candidates` aracılığıyla tekrar aynı deterministik doğrulayıcıdan geçirilir. Çelişki düzeltmesi eski kaydı saklar; yeni kayıt ayrıca yayın kontrolünden geçer.

## 4. Worker

`.env.worker` git dışındadır; gerçek Supabase HTTPS origin ve service key ekleyin. `OPENAI_API_KEY` + `EXTRACTION_MODEL` ikisi birlikte opsiyoneldir. Yapılandırılmadığında worker belge ve kanıt arşivini toplar, model çalıştırmaz; çıkarım kapsamı tamamlanmadığından yokluk sonucu üretilemez. Public search/answer hiçbir koşulda model çağırmaz.

```sh
docker build -f deploy/worker.Dockerfile -t sak-haber-worker:phase3 .
docker compose -f deploy/compose.worker.yml up -d --build
# Ortam shell'de zaten yüklüyse Docker olmadan:
pnpm worker:scheduler
# Tek bir sınırlı job turu:
pnpm worker:scheduler --once
```

Docker üretim görüntüsü fixture dosyalarını içermez; `--demo` production modunda kapalıdır. Docker healthcheck process heartbeat'ini denetler; veri güncelliği ayrıca `/health` ve `/admin` üzerinden izlenir.

Her endpoint'in `source_endpoints.poll_interval_seconds` değeri planı belirler. Yetkili SQL bağlantısında yalnızca hedef kaydın bu alanını güncelleyebilirsiniz; source veya host onayını değiştirmeyin. Yeni aralık, çalışan iş bittikten sonra bir sonraki planlamada uygulanır. `WORKER_CONCURRENCY` 1–4, varsayılan 2'dir. Başlangıçta tek worker örneği kullanın; kurum başına tek etkin iş vardır. Farklı kurumların aynı host'u paylaşması için global host pacing henüz yoktur.

İşler `SKIP LOCKED`, 45 dakika lease, rastgele token ve 20 dakika process sınırı kullanır. Timeout'ta SIGTERM, beş saniye sonra SIGKILL uygulanır. Transport ayrıca mevcut URL/DNS/byte/time sınırlarını korur. Başarısızlıkta 120/240 saniye gecikme; üçüncü denemeden sonra normal endpoint aralığına dönülür. Tekrar edilmiş completion veya eski lease token'ı kabul edilmez. Çöken process'in işi lease dolunca yeniden alınır; belge/extraction idempotency kayıtları çoğaltmayı önler. Ağ üzerindeki exactly-once yan etki garantisi iddia edilmez.

Anonim ölçümler ve rate-limit kayıtları başlangıçta ve saatte bir temizlenir. Worker çalışmıyorsa retention bakımının da çalışmadığını izleyin. Kaynak hatası web uygulamasını durdurmaz; public cevap güveni azalır veya güvenli unavailable ekranı çıkar.

## 5. Yayına geçiş doğrulaması

1. Migration/seed, RLS ve veri kalite kontrollerini çalıştırın.
2. Sınırlı gerçek kaynak taraması yapın; parser drift veya needs_review kayıtlarını çözün. Eski kayıtları “bugün doğrulandı” diye yeniden damgalamayın.
3. En az bir güncel fact için belgedeki değer ve alıntıyı inceleyip admin'den yayıma açın.
4. Önizlemede search → canonical → answer → gov.tr kanıt → geçmiş yolunu ve mobil ekranı doğrulayın.
5. Bir kaynağı başarısız/eskimiş simüle eden testleri, unauthorized admin mutation ve revocation testlerini çalıştırın.
6. Gerçek ortamın `/health`, worker liveness, kaynak son başarılı kontrolü ve error log'larını izleyin. Operatör müdahalesi için mevcut izleme hizmetinizde alarm kurun.
7. Kanonik domain, SSL, doğru Supabase projesi, secret kapsamı, yedek/restore planı ve log retention doğrulandıktan sonra production promotion yapın.

Bu geliştirme çalışmasında üretim promotion'ı veya uzak Supabase migration'ı yapılmış değildir.
