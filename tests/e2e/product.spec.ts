import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
test('answer-first homepage and keyboard search lead to canonical evidence', async ({
  page,
}, info) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Ne öğrenmekistiyorsun?',
  );
  await expect(page.locator('html')).toHaveAttribute('lang', 'tr');
  await expect(
    page.getByRole('navigation', { name: 'Ana gezinme' }),
  ).toBeVisible();
  await mkdir('artifacts/screenshots', { recursive: true });
  await page.screenshot({
    path: `artifacts/screenshots/home-${info.project.name}.png`,
    fullPage: true,
  });
  const search = page.getByRole('searchbox');
  await search.fill('YKS ek tercih ne zaman?');
  await search.press('Enter');
  await expect(page).toHaveURL(/\/yks\/2026\/ek-yerlestirme$/);
  await expect(page.locator('.answer-value')).toHaveText(
    '20 Eylül 2026 – 25 Eylül 2026',
  );
  await expect(page.locator('.status')).toHaveText('İleri tarih duyuruldu');
  await expect(
    page.getByText('Son başarılı kaynak kontrolü', { exact: true }),
  ).toBeVisible();
  await expect(page.getByTestId('evidence').getByRole('link')).toHaveAttribute(
    'href',
    'https://www.osym.gov.tr/Duyurular/Index',
  );
  await expect(page.getByTestId('evidence')).toContainText('TEST FİKSTÜRÜ');
  await expect(
    page.getByTestId('evidence').locator('blockquote'),
  ).toContainText('20 Eylül 2026 – 25 Eylül 2026');
  await expect(
    page.getByRole('heading', { name: 'Güncelleme geçmişi' }),
  ).toBeVisible();
  await page.screenshot({
    path: `artifacts/screenshots/answer-${info.project.name}.png`,
    fullPage: true,
  });
  const width = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    viewport: innerWidth,
  }));
  expect(width.scroll).toBeLessThanOrEqual(width.viewport);
});
test('all aliases resolve to a single canonical resource', async ({ page }) => {
  for (const q of [
    'yks ikinci tercih',
    'ek yerleştirme ne zaman',
    'yks ek tercihh',
  ]) {
    await page.goto('/ara?q=' + encodeURIComponent(q));
    await expect(page).toHaveURL(/\/yks\/2026\/ek-yerlestirme$/);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      'href',
      'http://127.0.0.1:3100/yks/2026/ek-yerlestirme',
    );
  }
});
for (const [year, status, fragment] of [
  ['2025', 'İzlenen kaynaklarda bulunamadı', '2025'],
  ['2027', 'Önceki bilgi değiştirildi', 'Yerine geçen'],
  ['2028', 'İnceleme gerekiyor', 'inceleme gerektiren'],
  ['2029', 'İzlenen kaynaklarda bulunamadı', 'tüm resmî arşivi kapsamayabilir'],
  ['2031', 'İnceleme gerekiyor', 'güncel kanıt'],
  ['2032', 'Doğrulanmış cevap yok', 'yayımlamadığı anlamına gelmez'],
]) {
  test(`${year}: safe temporal/coverage resolution`, async ({ page }) => {
    await page.goto(`/yks/${year}/ek-yerlestirme`);
    await expect(page.locator('.status')).toHaveText(status!);
    await expect(page.getByTestId('direct-answer')).toContainText(fragment!);
    await expect(page.locator('.answer-value')).toHaveCount(0);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      'content',
      /noindex/,
    );
  });
}
test('unhealthy source displays its warning before evidence', async ({
  page,
}) => {
  await page.goto('/yks/2030/ek-yerlestirme');
  await expect(page.locator('.status')).toContainText('yeniden kontrol');
  await expect(page.locator('.warning')).toContainText('sağlıksız');
  await expect(page.getByTestId('direct-answer')).toContainText(
    'yeniden doğrulanmalı',
  );
});
test('feedback is explicit, anonymous and same-origin protected', async ({
  page,
  request,
}) => {
  await page.goto('/yks/2026/ek-yerlestirme');
  await page.getByRole('button', { name: 'Evet', exact: true }).click();
  await expect(page).toHaveURL(/\/tesekkurler$/);
  const response = await request.post('/api/feedback', {
    form: { kind: 'helpful', resource: 'yks_extra', year: '2026' },
    headers: { origin: 'https://evil.example' },
  });
  expect(response.status()).toBe(403);
});
test('unknown search and admin cannot leak data or fabricate an answer', async ({
  page,
  request,
}) => {
  await page.goto('/ara?q=' + encodeURIComponent('2026 2025 yks ek tercih'));
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Biraz daha netleştirelim.',
  );
  await expect(page.locator('.answer-value')).toHaveCount(0);
  await page.goto('/admin');
  await expect(
    page.getByRole('heading', { name: 'İşletim paneli' }),
  ).toBeVisible();
  await expect(page.getByText('Kaynak sağlığı ve kapsam')).toHaveCount(0);
  const result = await request.post('/api/admin/review', {
    form: { action: 'publish' },
    headers: { origin: 'http://127.0.0.1:3100' },
  });
  expect(result.status()).toBe(403);
});
test('site still serves a safe answer when data source fails', async ({
  request,
}) => {
  const result = await request.get('/yks/2034/ek-yerlestirme');
  expect(result.status()).toBe(200);
  expect(await result.text()).toContain('Kaynak verisine şu an erişemiyoruz.'); // public request does not invoke crawler/PDF processing
  const sitemap = await request.get('/sitemap.xml');
  expect(await sitemap.text()).not.toContain('/ara?');
});
test('operator session protects inspection and clears on logout', async ({
  page,
}) => {
  await page.goto('/admin');
  await page
    .getByLabel('Yönetici parolası')
    .fill('fixture-admin-password-only');
  await page.getByRole('button', { name: 'Giriş yap', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Kaynak sağlığı ve kapsam' }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Yayın ve inceleme', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Çıkış', exact: true }).click();
  await expect(page.getByLabel('Yönetici parolası')).toBeVisible();
});
test('duplicate search parameters are handled as an unresolved query', async ({
  page,
}) => {
  await page.goto('/ara?q=yks&q=kyk');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Biraz daha netleştirelim.',
  );
});
