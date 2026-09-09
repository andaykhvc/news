# Resmî uç nokta araştırması — 8 Eylül 2026

Bu listedeki sayfalar doğrudan kurum sitelerinden HTTP ile indirildi. Arama sonuçları yalnızca adres bulmak için kullanıldı; kanıt değildir. Tam yanıtlar `sources/education/fixtures` altında değiştirilmeden saklanır. `manifest.json` istek/son URL, HTTP durumu, içerik türü, boyut ve SHA-256 içerir. Capture zamanı araştırma oturumuna yuvarlanmıştır; kaynağın yayın zamanı değildir.

| Kurum    | Etkin uç nokta                                         | Keşif ve ayrıştırma                                                                                     | Kapsam                                                                                                                                   |
| -------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| ÖSYM     | [Duyurular](https://www.osym.gov.tr/Duyurular/Index)   | `a.duyuru-list-item`; detay `.row.title h3`, `.row.content > .col-sm-9`                                 | Yakalanan listede 354 bağlantı, yıl filtresi istemci tarafında; otomatik tüm-yıllar arşivi iddiası yok. Çalışma belge limitiyle sınırlı. |
| MEB      | [Ana sayfa](https://www.meb.gov.tr/)                   | `a.news-title`, kayıtlı ana host altında `/haber/…/tr`; detay `h2.main-title`, `.content.article-detay` | Ana sayfadaki 11 haberlik pencere. Duyuru arşivinin tamamı değildir.                                                                     |
| YÖK      | [Duyurular](https://www.yok.gov.tr/tr/announcements)   | `.item-content h3.title a`; `a[rel=next]`; detay `.post-content h2.title`, `.post-content > div`        | Sayfada 15 kayıt. Gerçek next bağlantısı `?page=2`; varsayılan en fazla 3 sayfa/50 belge.                                                |
| GSB/KYGM | [Duyurular](https://kygm.gsb.gov.tr/Duyurular/)        | `a.duyuruLink`; detay `.Text h3`, `.Text.sesliOku`                                                      | 4 duyuruluk pencere; ana liste en güncel duyuruyu da gösterir. Mantıksal belgeler ayrı `/Duyuru/…` URL'leridir.                          |
| GSB/KYGM | [Haberler](https://kygm.gsb.gov.tr/HaberListesi/1)     | `.post-title a`; detay son breadcrumb başlığı ve `.Text.sesliOku`                                       | Görünen haber penceresi; gözlenmeyen sayfalama URL'si üretilmez.                                                                         |
| YÖKAK    | [Duyurular](https://www.yokak.gov.tr/category/duyuru/) | `h2.entry-title a`; `a.next.page-numbers`; detay `h1.entry-title`, `.entry-content`                     | 10 kayıt; `/category/duyuru/page/2/` ve son sayfa 12 bağlantıları gözlendi.                                                              |

## Ek dosyalar ve yayın zamanı

- [ÖSYM DGS tercih duyurusu](https://www.osym.gov.tr/2026-dgs-tercihlerin-alinmasi) gerçek HTML doğrulama örneğidir. Kaynak metnindeki `2026-DG6` yazım hatası düzeltilmeden korunmuştur. Açık DGS başlığı, konu kimliğini sağlar.
- [ÖSYM KPSS Ortaöğretim kılavuzu](https://dokuman.osym.gov.tr/web//2026/8/basvuru-kilavuzu-ci4pae-27090228.pdf), ÖSYM ana sayfasındaki gerçek bağlantıdan indirilmiş 52 sayfalık PDF'dir. Ayrı `dokuman.osym.gov.tr` host'u açıkça kayıtlıdır. PDF örneği 2. sayfadaki sınav tarihi satırını kanıt olarak kullanır; fiziksel sayfa numarası 1 tabanlıdır.
- YÖK duyurusundaki `personel.yok.gov.tr/tr/document/3020`, `/3021`, `/3022` ek bağlantıları gözlendi. Bu alt alan adı bu teslimde içerik/redirect doğrulamasından geçirilmedi ve allowlist'e alınmadı. Bağlantılar hata/audit kaydında görünür; ana belge korunur.
- E-Devlet, başvuru portalları, sosyal ağlar ve dış konferans siteleri otomatik belge/kanıt kaynağı olmaz.
- YÖKAK `article:published_time` offset içeren yayın metadata'sı sağlar. Diğer sayfalardaki tarih/saat metinleri korunur; yalnızca tarih görüldüğünde yapay saat veya UTC offset'i eklenmez.

## Etkin olmayan alanlar

MEB'in [duyuru arşivi](https://www.meb.gov.tr/meb_duyuruindex.php), JavaScript DataTables ile `meb_duyuruindex_ajax.php` adresine POST yapar (`start`, `length`, sıralama ve `kategori`). Doğrudan deneme “Erişim yetkiniz yok!” yanıtı verdi. Erişim kontrolü aşılmadı; arşiv adaptörü/endpoint'i etkinleştirilmedi. Browser render etmeden haber ana sayfası okunabiliyor.

`www.gsb.gov.tr/` yurt sonuçları ara sayfasına yönleniyor; KYGM'nin doğrudan resmî listeleri kullanılıyor. YÖK kökü `/tr` adresine, YÖKAK kökü `www` host'una yönleniyor; registry nihai adresleri açıkça içeriyor.

Beş kurum aktiftir. Eski çıplak `osym.gov.tr`, `meb.gov.tr`, `yok.gov.tr`, `gsb.gov.tr`, `yokak.gov.tr` kayıtları **candidate** kalır; `include_subdomains=false`. Yalnızca rapordaki açık host kayıtları etkindir. Yeni bulunan bir alt alan adı kendiliğinden etkinleştirilmez.

## Canlı kontrol

Altı endpoint, yeni DNS/IP sabitlemeli taşıyıcıyla birer belge sınırında dry run yapılarak kontrol edildi. Kayıtların küçük olması tam arşiv kapsamı göstermez. CI tüm bu testleri yerel fixture'larla yapar; devlet sitelerinin erişilebilirliğine bağlı değildir.
