# Şak Haber

Resmî Türk kamu kaynaklarını otomatik takip etmek ve doğrulanabilir duyuruları yayımlamak için TypeScript temeli.

**Güncel hedef:** kullanıcı, resmî kaynaklardan otomatik haber/duyuru toplanmasını ve yayımlanmasını istiyor. Ayrı bir backend API uygulaması yok. Next.js web katmanı, Supabase/PostgreSQL kalıcı kayıtları ve tek çalıştırmalık Node.js toplama işi yeterli. İlk teknik şartnamedeki fact/evidence/answer modelleri ileride kullanılabilecek pasif temellerdir; çalışan bir soru-cevap ürünü veya AI haber üretimi değildir.

Bu aşama **Prompt 1: altyapı** kapsamındadır. Gerçek kurum adaptörü, canlı tarama, otomatik yayın kararı, son kullanıcı arayüzü veya üretim zamanlaması henüz yoktur. Örnek iş tamamen çevrimdışı ve sentetiktir.

## Kurulum

Node.js 22.14+ (CI: Node 24) ve `pnpm 11.19.0` gerekir.

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm worker:demo
pnpm dev
```

Web: `http://localhost:3000`. `/health` paketlerin web uygulamasında çalıştığını gösterir; veritabanı sağlık kontrolü değildir. Ana sayfa yalnızca geliştirme iskeletidir ve indekslemeye kapalıdır. Derleme ve örnek iş için şifre/API anahtarı gerekmez.

## Komutlar

| Komut                               | İşlev                                                                      |
| ----------------------------------- | -------------------------------------------------------------------------- |
| `pnpm format` / `pnpm format:check` | Biçimlendirme / kontrol                                                    |
| `pnpm lint`                         | ESLint, paket sınırları ve seed tutarlılığı                                |
| `pnpm typecheck`                    | Tüm paketler, web, worker ve testler için strict TypeScript                |
| `pnpm test`                         | Vitest birim testleri ve PGlite PostgreSQL migration testleri              |
| `pnpm build`                        | Paket tip derlemeleri ve Next.js üretim derlemesi                          |
| `pnpm worker:demo`                  | Ağsız `new_document → unchanged → new_version` örneği                      |
| `pnpm worker`                       | Kurulu adaptör durumunu yazıp çıkar; daemon/scheduler değildir             |
| `pnpm seed:generate`                | Tek kayıt defterinden SQL seed üretir                                      |
| `pnpm db:start`                     | Yerel Supabase'i başlatır; Docker gerekir                                  |
| `pnpm db:reset`                     | **Yalnızca bu yerel projenin verilerini siler**, migration ve seed uygular |
| `pnpm db:lint`                      | Çalışan yerel PostgreSQL için SQL denetimi                                 |

## Yerel veritabanı

`supabase/config.toml` projeye özel `sak-haber` kimliği ve 56321 API / 56322 PostgreSQL portlarını kullanır. Başka yerel Supabase projeleriyle varsayılan port çakışmasını önler.

Tam yerel geliştirme ortamı için `pnpm db:start`; yalnızca bu aşamada gereken hizmetler için:

```sh
pnpm exec supabase start -x gotrue,realtime,storage-api,imgproxy,mailpit,postgres-meta,studio,edge-runtime,logflare,vector,supavisor
```

CLI ilk kurulum sırasında şema hazırlığı için dışlanan hizmetlerin bazı imajlarını da indirebilir. Bu, ürüne bu hizmetlerin eklendiği anlamına gelmez.

Canlı worker bağlantısı ileride gerektiğinde `.env.example` dosyasını `.env` olarak kopyalayıp yerel/proje sunucu anahtarını girin. `SUPABASE_SERVICE_ROLE_KEY` yalnızca server/worker içindir; `NEXT_PUBLIC_` önekine taşınmaz. Web iskeleti bu anahtarı kullanmaz. Worker paket dizininden çalışırken kök ortam dosyasını açıkça yükleyin:

```sh
pnpm --filter @sak/worker exec tsx --env-file=../../.env src/main.ts --endpoint REGISTERED_ENDPOINT_UUID
```

Henüz gerçek adaptör bulunmadığından bu komut uygun bir hata verir. Kaynak eklemek yalnızca URL girmekten ibaret değildir; [kaynak politikası](SOURCE_POLICY.md) ve [adaptör rehberi](sources/README.md) uygulanır.

## Depo

```text
apps/
  web/                  Next.js App Router iskeleti ve /health
  worker/               Tek iş sınırı, CLI ve ağsız örnek
packages/
  domain/               Saf modeller, yaşam döngüleri ve Zod şemaları
  database/             Supabase repository'leri ve test belleği
  source-sdk/           Adaptör sözleşmeleri ve enjekte edilen HTTP taşıyıcısı
  ingestion/            Genel veri alımı, tekrar deneme, hash ve persistence portları
  validation/           URL, registry, kanıt ve yayın önkoşulları
  shared/               Result ve JSON logger
sources/
  registry.json         Beş kurum ve alan adı: yalnızca aday
  fixtures/             Açıkça işaretlenmiş sentetik çevrimdışı veri
supabase/
  migrations/           Sürümlenen PostgreSQL şeması ve atomik kayıt RPC'si
  seed.sql              registry.json dosyasından üretilir
tests/                  Birim ve PostgreSQL davranış testleri
scripts/                Paket sınırları ve seed üretimi
.github/workflows/      CI
```

## Sürüm tercihleri

Bağımlılıklar ve lockfile sabitlenmiştir. Başlangıçta doğrulanan Next.js 16.3.4, React 19.2.8, Zod 4.5.4, Supabase JS 2.116.0 kullanılır. TypeScript 7 mevcut olmasına rağmen `typescript-eslint 8.70.0` `<6.1` gerektirdiği için araçların desteklediği son kararlı sürüm 6.0.3 seçilmiştir. Yükseltmelerde uyumluluk yeniden kontrol edilmelidir.

## Sonraki aşama

1. İlk kurumun gerçek uç noktalarını ve yönlendirme/alan adı politikasını doğrulamak.
2. Onaylanan kaynakları açıkça etkinleştirmek; fixture tabanlı ilk gerçek adaptörü yazmak.
3. DNS/IP sabitlemeli ağ çıkışı, robots/poll politikası, oran sınırı ve kalıcı yeniden deneme planını eklemek.
4. PDF/binary indirme, ham dosya saklama ve sayfa/konum temelli metin çıkarımı.
5. Doğrulanmış duyurudan yayın kaydına geçiş, düzeltme/geri çekme akışı ve halka açık haber ekranı.
6. Worker için üretim tetiklemesi, kilit/lease, yarım kalmış crawl kurtarma ve işletim politikası.

Redis, vektör veritabanı, LLM veya ayrı API sunucusu bu temelin gereksinimi değildir.

Ayrıntılar: [PRODUCT.md](PRODUCT.md), [SOURCE_POLICY.md](SOURCE_POLICY.md), [ARCHITECTURE.md](ARCHITECTURE.md).
