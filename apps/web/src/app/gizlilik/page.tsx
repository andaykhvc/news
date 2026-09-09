export default function Privacy() {
  return (
    <article className="wrap narrow prose">
      <h1>Gizlilik</h1>
      <p>
        Arama yapmak için hesap gerekmez. Arama geçmişini kişisel bir profile
        dönüştürmeyiz. Reklam izleyicisi veya üçüncü taraf analiz betiği
        kullanmıyoruz.
      </p>
      <h2>Topladığımız ölçümler</h2>
      <p>
        Yararlı / yararsız cevap geri bildirimlerini konu ve gün bazında
        sayarız. Eksik konu bildirimi gönderirsen yalnızca tanımlı eğitim
        sözlüğündeki kelimeler ve yıl saklanır. Ham metin, bilinmeyen kelimeler,
        e-posta ve uzun numaralar kaydedilmez. Bildirim göndermek isteğe
        bağlıdır.
      </p>
      <p>
        Bu toplu ölçümler 30 gün tutulur. Kötüye kullanımı sınırlamak için IP
        adresinden günlük değişen anahtarla üretilen geçici bir özet kullanılır.
        Bu özet sorgu veya geri bildirimle birleştirilmez, bir gün sonra
        silinir. Silme işlemi çalışan worker bakımına bağlıdır.
      </p>
      <h2>Teknik kayıtlar</h2>
      <p>
        Barındırma sağlayıcıları standart erişim kayıtları tutabilir; arama
        sayfasının adresi sorgu metnini içerebilir. Aramana kişisel bilgi yazma.
        İşletmeci barındırma günlüklerinin saklama süresini sınırlamalıdır.
      </p>
      <p>
        Yalnızca yönetici oturumu için gerekli, süreli bir çerez kullanılır.
        Resmî kaynak bağlantısını açtığında ilgili kurumun gizlilik kuralları
        geçerlidir.
      </p>
    </article>
  );
}
