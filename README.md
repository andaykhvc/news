# Şak Haber

Şak Haber, doğrudan resmî `gov.tr` kaynaklarından belge toplar; değişmez sürümler, yapılandırılmış iddialar ve kesin kanıt konumları oluşturur. **Prompt 3: Türkçe cevap ürünü** uygulanmıştır. Arama, kanıtlı cevaplar, yönetim ekranı ve kalıcı worker zamanlaması mevcut veri motorunun üzerindedir. [Mühendislik raporu ve üretime geçiş](docs/phase3.md).

```text
SOURCE → DOCUMENT → DOCUMENT VERSION → FACT → EVIDENCE → ANSWER
```

Ayrı backend API sunucusu yoktur. Next.js/Vercel web katmanı, PostgreSQL ve Node.js worker kullanılır; tek seferlik CLI veya kalıcı zamanlayıcı olarak çalışır. Worker uzun süreli taramalar için Vercel sayfa isteğinin içinde çalıştırılmaz. LLM yalnızca aday çıkarır; doğrulama, yetki veya yayın kararı vermez.

## Başlangıç

Node.js 22.14+ (CI: 24), `pnpm 11.19.0`:

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm exec playwright install chromium
pnpm test:e2e
pnpm worker:demo
pnpm worker --source osym --fixture osym-detail.html
pnpm worker --source osym --fixture osym-guide.pdf
pnpm worker --source osym --max-pages 1 --max-documents 1 --dry-run
pnpm dev
```

`worker:demo` eski sentetik sürümleme örneğidir. `--fixture` komutları doğrudan resmî kaynaklardan kaydedilmiş gerçek HTML/PDF dosyalarını okur. Testler ağ ve API anahtarı gerektirmez. `--dry-run` canlı kaynak okuyabilir; veritabanına yazmaz. Worker yalnız birebir ÖSYM `YYYY-YKS: Sınav Sonuçları Açıklandı` ve `YYYY-YKS: Yerleştirme Sonuçları Açıklandı` başlıklarını deterministik aday olarak işler; başarılı kaynak kontrolü, exact evidence ve yayın kapısından sonra bunları otomatik yayımlar. Diğer facts yönetim incelemesi gerektirir.

## Docker ve kalıcı kayıt

Vercel Marketplace'ten bağlanan PostgreSQL sağlayıcısının pooled bağlantı adresini tek `DATABASE_URL` değişkeni olarak Vercel'e ve worker'a ekleyin.

```sh
DATABASE_URL='postgresql://...' pnpm db:migrate
```

`.env.example` içindeki sunucu değişkenlerini kökteki `.env` dosyasına doldurun. Anahtarlar `NEXT_PUBLIC_` değişkeni olamaz. Ortamı açıkça yükleyerek:

```sh
pnpm --filter @sak/worker exec tsx --env-file=../../.env src/main.ts --source osym --write
pnpm --filter @sak/worker exec tsx --env-file=../../.env src/main.ts --version VERSION_UUID --candidates /absolute/path/candidates.json
pnpm --filter @sak/worker exec tsx --env-file=../../.env src/main.ts --version VERSION_UUID --provider openai --write
```

`--candidates` dosyası `{ "candidates": [...] }` biçiminde strict `FactCandidate` çıktısıdır; modele gerek olmadan aynı deterministik doğrulayıcıdan geçer. `--provider openai` için `OPENAI_API_KEY` ve açıkça seçilmiş `EXTRACTION_MODEL` gerekir. Anahtar/model yokken sağlayıcı çalışmaz. Kalıcı taramada `--provider openai` eklenirse yeni belgeler aynı doğrulama hattından geçirilir.

## Komutlar

| Komut                                                      | İşlev                                                                  |
| ---------------------------------------------------------- | ---------------------------------------------------------------------- |
| `pnpm check`                                               | Biçim, lint, paket sınırları, strict tipler, testler, üretim derlemesi |
| `pnpm worker --help`                                       | CLI seçenekleri                                                        |
| `pnpm worker --source all --max-pages 1 --max-documents 1` | Beş kuruma ait altı uç noktada sınırlı dry run                         |
| `pnpm seed:generate`                                       | Registry ve eğitim ontolojisinden seed üretir                          |
| `pnpm db:migrate`                                          | PostgreSQL migration ve güvenli katalog seed'ini uygular               |

## Kaynaklar ve sınırlar

ÖSYM, MEB, YÖK, GSB/KYGM ve YÖKAK adaptörleri vardır. [Doğrulanmış uç noktalar ve erişim sınırları](docs/official-endpoints.md), [işletim ve doğrulama raporu](docs/phase2.md), [mimari](ARCHITECTURE.md), [kaynak politikası](SOURCE_POLICY.md).

MEB dinamik duyuru arşivi erişimi reddettiği için etkin değildir; MEB ana sayfasındaki resmî haber akışı kullanılır. YÖK eklerindeki kayıt dışı alt alan adları otomatik güven kazanmaz. Kısmi arşiv taraması veya boş sonuç, duyuru yapılmadığını kanıtlamaz.

PDF dosyaları boyut/sayfa/süre sınırlarıyla ayrı worker thread içinde ayrıştırılır. Ham dosyalar SHA-256 ile PostgreSQL'de saklanır. OCR yoktur. Karmaşık tablolar, eksik yıllar, yerel saat için belirtilmeyen UTC offset'i ve desteklenmeyen yapılandırılmış değerler inceleme gerektirir. Çelişkiler açık operatör kararı olmadan çözülmez.

Arama ve cevap üretiminde LLM yoktur. Opsiyonel LLM yalnızca worker içinde aday çıkarır. Üretimde yayın için kaynakların sağlıklı olması ve doğrulanmış fact'in yönetim kontrolünden geçmesi gerekir; yalnız yukarıdaki dar, birebir ÖSYM sonuç başlığı kuralı bu akışı otomatik tamamlar. Kalıcı kaynak işleri PostgreSQL lease ile yürür. Çok sunuculu ortak host hız sınırlaması ve ölçekli yük testi henüz yapılmamıştır.

## Vercel

Framework: **Next.js**. Root Directory: **`apps/web`**. Build: `pnpm build`, çıktı dizini **`.next`**. `apps/web/vercel.json` framework ve çıktı ayarını açıkça sabitler. Monorepo kökündeki lockfile/workspace paketlerine erişim açık olmalıdır. `ENABLE_EXPERIMENTAL_COREPACK=1` sabit pnpm sürümünü kullanır. Web isteği veri toplama başlatmaz. Anahtarsız önizleme güvenli biçimde doğrulanmış cevap olmadığını gösterir; gerçek veriler için yalnızca sunucuda `DATABASE_URL` gerekir. Üretimden önce `PUBLIC_SITE_URL` dahil ortamı [dağıtım rehberi](docs/deployment.md) ile doğrulayın.

## Cevap ürünü ve işletim

- `/`: Türkçe arama ve konu rehberi.
- `/ara?q=...`: deterministik Türkçe normalizasyon; eş anlamlar aynı adrese gider.
- `/yks/2026/ek-yerlestirme` gibi `/{konu}/{yıl}/{olay}`: cevap, durum, kurum, zaman, kanıt ve geçmiş.
- `/admin`: imzalı, süreli operatör oturumu; sağlık, adaylar, kaynak hataları, inceleme ve yayın.
- `/health`: veri erişimi ve kaynak güncelliği; gerçek bir hazır olma ölçümüdür.

```sh
pnpm worker:scheduler                    # Ortamı önceden yükleyin
pnpm env:check -- --production          # Web üretim ayarları
pnpm env:check -- --worker --production # Worker üretim ayarları
pnpm data:check -- --offline            # Katalog / ontology uyumu
pnpm data:check                         # Canlı DB üzerinde salt okunur cevap kontrolü
```

Worker Docker tanımı: `deploy/worker.Dockerfile`; başlatma ve gizli değişkenler: [docs/deployment.md](docs/deployment.md). Test verileri uygulamaya veya üretim seed'ine import edilmez.
