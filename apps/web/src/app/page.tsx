import { answerStatusSchema } from '@sak/domain';

export default function Home() {
  const status = answerStatusSchema.parse('unverified');
  return (
    <main>
      <h1>Şak Haber</h1>
      <p>Resmî kamu bilgilerini doğrulanabilir yanıtlara dönüştüren sistem.</p>
      <p>
        Altyapı geliştirme aşamasında. Henüz doğrulanmış yanıt yayımlanmıyor.
      </p>
      <small>Durum: {status}</small>
    </main>
  );
}
