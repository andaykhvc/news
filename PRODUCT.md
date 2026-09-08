# Şak Haber ürün ilkeleri

> Şak Haber is not a news generation platform. It is a system that monitors official public information, converts it into verifiable facts, and answers users directly.

Şak Haber, resmî kamu bilgisini izler; kaynağı gösterilebilir, denetlenebilir bilgiye dönüştürür. Kullanıcının güncel yayın hedefi, resmî kaynaklardan duyuruların otomatik toplanıp haber/duyuru olarak yayımlanmasıdır. Bu, uydurma AI metni veya SEO içerik çiftliği oluşturmak anlamına gelmez. İlk şartnamenin soru-cevap modeli ileride kullanılabilecek bir temel olarak saklanır; mevcut aşamada etkin değildir.

```text
SOURCE → DOCUMENT → DOCUMENT VERSION → FACT → EVIDENCE → ANSWER
```

Çalışan ilk aşama `SOURCE → DOCUMENT → DOCUMENT VERSION` zinciridir. Toplama ile yayımlama ayrı kararlardır: veri alımı tek başına bir kaydı kamuya açmaz. Haber yayını aynı sürümlü kaynaklara dayanmalıdır.

1. Doğrudan bilgi/yanıt, uzun açıklamadan önce gelir.
2. Önemli her iddia resmî kaynağa kadar izlenebilir olmalıdır.
3. Tarih, ücret, son başvuru, şart ve durum bilgisi uydurulamaz.
4. Önceki yılın bilgisi güncelmiş gibi sunulamaz; dönem açıkça değerlendirilir.
5. Güncel resmî bilgi doğrulanamıyorsa belirsizlik açıkça gösterilir.
6. Kaynağın ne zaman kontrol edildiği kaydedilir; başarısız kontrol başarılıymış gibi gösterilmez.
7. Tarihsel belgeler denetlenebilir kalır.
8. Kaynak güncellemesi eski belge sürümünü yok edemez.
9. AI ileride yapılandırılmış çıkarımda kullanılabilir; hakikatin kaynağı değildir.
10. Kritik iddialar belge sürümü ve kanıt konumu düzeyinde izlenebilir olmalıdır.
11. Bilgiyi görmek için önce reklam izlemek zorunlu tutulamaz.
12. Küçük sorgu varyasyonları için birbirini tekrarlayan SEO sayfaları üretilmez.
13. Çekirdek belirli bir kuruma bağlı olamaz.
14. Çekirdek yalnızca eğitime bağlı olamaz.
15. Yeni kurumlar adaptör olarak eklenir; çekirdek yeniden yazılmaz.

İlk aday kaynak paketi eğitimle ilişkilidir. Vergi, sosyal güvenlik, vatandaşlık, sağlık veya başka kamu alanları aynı kaynak ve belge modellerini kullanabilir. Kurumlar arasında küresel bir otorite puanı yoktur; gerekiyorsa konu/iddia bağlamındaki yetki kuralları kullanılır.

Bu aşamada gerçek crawler, PDF/OCR, LLM, fact çıkarımı, yayın motoru, nihai haber/yanıt ekranı, admin paneli, reklam veya üretim zamanlaması uygulanmaz.
