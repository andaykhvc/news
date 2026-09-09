# Şak Haber

Şak Haber, doğrudan resmî `gov.tr` kaynaklarından belge toplar; değişmez sürümler, yapılandırılmış iddialar ve kesin kanıt konumları oluşturur. **Prompt 2: veri alımı ve doğrulama** uygulanmıştır. Son kullanıcı ekranı ve yayın deneyimi Prompt 3 kapsamındadır.

```text
SOURCE → DOCUMENT → DOCUMENT VERSION → FACT → EVIDENCE → ANSWER
```

Ayrı backend API sunucusu yoktur. Next.js/Vercel web katmanı, PostgreSQL/Supabase ve tek çalıştırmalık Node.js worker kullanılır. Worker uzun süreli taramalar için Vercel sayfa isteğinin içinde çalıştırılmaz. LLM yalnızca aday çıkarır; doğrulama, yetki veya yayın kararı vermez.

## Başlangıç

Node.js 22.14+ (CI: 24), `pnpm 11.19.0`:

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm worker:demo
pnpm worker --source osym --fixture osym-detail.html
pnpm worker --source osym --fixture osym-guide.pdf
pnpm worker --source osym --max-pages 1 --max-documents 1 --dry-run
pnpm dev
```

`worker:demo` eski sentetik sürümleme örneğidir. `--fixture` komutları doğrudan resmî kaynaklardan kaydedilmiş gerçek HTML/PDF dosyalarını okur. Testler ağ ve API anahtarı gerektirmez. `--dry-run` canlı kaynak okuyabilir; veritabanına yazmaz. CLI hiçbir koşulda yayın yapmaz.

## Docker ve kalıcı kayıt

Yerel proje `sak-haber`, API portu **56321**, PostgreSQL portu **56322**. Başka projelerin Docker hizmetlerini etkilemez.

```sh
pnpm exec supabase start -x gotrue,realtime,storage-api,imgproxy,mailpit,postgres-meta,studio,edge-runtime,logflare,vector,supavisor
pnpm exec supabase migration up --local
# Yeni kurulumda seed db reset tarafından uygulanır. Mevcut yerel veriyi koruyarak seed uygulamak için:
docker exec -i supabase_db_sak-haber psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/seed.sql
```

`.env.example` içindeki sunucu değişkenlerini kökteki `.env` dosyasına doldurun. Anahtarlar `NEXT_PUBLIC_` değişkeni olamaz. Ortamı açıkça yükleyerek:

```sh
pnpm --filter @sak/worker exec tsx --env-file=../../.env src/main.ts --source osym --write
pnpm --filter @sak/worker exec tsx --env-file=../../.env src/main.ts --version VERSION_UUID --candidates /absolute/path/candidates.json
pnpm --filter @sak/worker exec tsx --env-file=../../.env src/main.ts --version VERSION_UUID --provider openai --write
```

`--candidates` dosyası `{ "candidates": [...] }` biçiminde strict `FactCandidate` çıktısıdır; modele gerek olmadan aynı deterministik doğrulayıcıdan geçer. `--provider openai` için `OPENAI_API_KEY` ve açıkça seçilmiş `EXTRACTION_MODEL` gerekir. Anahtar/model yokken sağlayıcı çalışmaz. Kalıcı taramada `--provider openai` eklenirse yeni belgeler aynı doğrulama hattından geçirilir.

## Komutlar

| Komut                                                      | İşlev                                                                   |
| ---------------------------------------------------------- | ----------------------------------------------------------------------- |
| `pnpm check`                                               | Biçim, lint, paket sınırları, strict tipler, testler, üretim derlemesi  |
| `pnpm worker --help`                                       | CLI seçenekleri                                                         |
| `pnpm worker --source all --max-pages 1 --max-documents 1` | Beş kuruma ait altı uç noktada sınırlı dry run                          |
| `pnpm seed:generate`                                       | Registry ve eğitim ontolojisinden seed üretir                           |
| `pnpm db:lint`                                             | Yerel PostgreSQL fonksiyonlarını denetler                               |
| `pnpm db:reset`                                            | **Bu yerel projenin verilerini siler**; normal güncellemede kullanılmaz |

## Kaynaklar ve sınırlar

ÖSYM, MEB, YÖK, GSB/KYGM ve YÖKAK adaptörleri vardır. [Doğrulanmış uç noktalar ve erişim sınırları](docs/official-endpoints.md), [işletim ve doğrulama raporu](docs/phase2.md), [mimari](ARCHITECTURE.md), [kaynak politikası](SOURCE_POLICY.md).

MEB dinamik duyuru arşivi erişimi reddettiği için etkin değildir; MEB ana sayfasındaki resmî haber akışı kullanılır. YÖK eklerindeki kayıt dışı alt alan adları otomatik güven kazanmaz. Kısmi arşiv taraması veya boş sonuç, duyuru yapılmadığını kanıtlamaz.

PDF dosyaları boyut/sayfa/süre sınırlarıyla ayrı worker thread içinde ayrıştırılır. Ham dosyalar SHA-256 ile PostgreSQL'de saklanır. OCR yoktur. Karmaşık tablolar, eksik yıllar, yerel saat için belirtilmeyen UTC offset'i ve desteklenmeyen yapılandırılmış değerler inceleme gerektirir. Çelişkiler açık operatör kararı olmadan çözülmez.

Canlı LLM çağrısı, üretim zamanlayıcısı, yarım kalan iş kurtarma, ölçekli yük testi ve kullanıcıya açık yayın servisi bu teslimde etkinleştirilmemiştir. Prompt 3; yanıt/arama deneyimi, kullanıcı ekranları ve bu kontrolleri zorunlu kullanan yayın katmanını kuracaktır.

## Vercel

Framework: **Next.js**. Root Directory: **`apps/web`**. Build: `pnpm build`, çıktı dizini varsayılan. Monorepo kökündeki lockfile/workspace paketlerine erişim açık olmalıdır. `ENABLE_EXPERIMENTAL_COREPACK=1` sabit pnpm sürümünü kullanır. Web iskeleti veri toplama işi başlatmaz ve servis anahtarı gerektirmez.
