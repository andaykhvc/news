# Dağıtım ve işletim

Şak Haber, Vercel'deki Next.js uygulaması, Vercel hesabına bağlanan PostgreSQL veritabanı ve ayrı Docker worker ile çalışır. Uygulama kodu tek değişken kullanır: `DATABASE_URL`.

## 1. PostgreSQL

Vercel Marketplace üzerinden bir PostgreSQL sağlayıcısı bağlayın. Sağlayıcının verdiği **pooled** bağlantı adresini Vercel'e `DATABASE_URL` olarak ekleyin. Aynı değeri worker ortamına da koyun. Bu değişken yalnızca sunucuda kalır; `NEXT_PUBLIC_` ile başlamaz.

Yeni, boş veritabanında migration ve güvenli katalog seed'ini uygulayın:

```sh
DATABASE_URL='postgresql://...' pnpm db:migrate
```

Komut migration geçmişini `schema_migrations` tablosunda tutar ve tekrar çalıştırılabilir. `database/seed.sql` ile `database/product-seed.sql` yalnızca kurum, onaylı host, endpoint, yetki ve sorgu sözlüğü ekler; resmî fact veya demo tarih eklemez. Mevcut üretim veritabanına geçerken önce sağlayıcının yedek/PITR durumunu doğrulayın.

## 2. Vercel

- Root Directory: `apps/web`
- `DATABASE_URL`: Vercel PostgreSQL sağlayıcısının pooled URL'si
- `PUBLIC_SITE_URL`: gerçek kanonik HTTPS adresi
- `ADMIN_PASSWORD_SCRYPT`, `ADMIN_SESSION_SECRET`, `ADMIN_OPERATOR`, `ANALYTICS_SALT`: yalnızca sunucu değişkenleri

Uygulama tek bağlantı değişkeniyle çalışır. Yönetici oturumu yerel imzalı cookie'dir; genel kullanıcı hesabı gerekmez. Ortam adlarını, değerlerini göstermeden kontrol etmek için:

```sh
pnpm env:check -- --production
```

## 3. Worker

Worker, resmî kaynakları tarar ve PDF işlemlerini yapar. Bu işlem Vercel sayfa isteğinde çalışmaz.

```sh
docker build -f deploy/worker.Dockerfile -t sak-haber-worker .
docker compose -f deploy/compose.worker.yml up -d --build
```

Worker ortamındaki tek zorunlu veritabanı değeri `DATABASE_URL`'dir. `OPENAI_API_KEY` ve `EXTRACTION_MODEL` birlikte verilirse yalnızca worker aday çıkarımı için kullanılır; public arama ve cevap isteklerinde model çağrısı yapılmaz.

## 4. Yayın öncesi

1. `pnpm db:migrate` ile şema ve seed'i yükleyin.
2. Vercel preview'de arama → kanonik cevap → resmî kanıt akışını kontrol edin.
3. Worker'ı çalıştırın ve `/admin` ekranında kaynak sağlığını inceleyin.
4. Yalnızca güncel kanıtı, doğrulama kaydı ve sağlıklı kaynağı olan fact'leri yayımlayın.
5. `/health` ve worker heartbeat'ini izleyin.

Vercel web uygulaması ile worker aynı PostgreSQL veritabanına bağlanır. Kaynak taraması aksarsa public cevap güveni düşer; eski veri yeni doğrulanmış gibi sunulmaz.
