import { expect, test } from '@playwright/test';

test('answer-first homepage is accessible and keyboard search reaches its canonical route', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Ne öğrenmekistiyorsun?',
  );
  await expect(page.locator('html')).toHaveAttribute('lang', 'tr');
  await expect(
    page.getByRole('navigation', { name: 'Ana gezinme' }),
  ).toBeVisible();
  const search = page.getByRole('searchbox');
  await search.fill('YKS ek tercih ne zaman?');
  await search.press('Enter');
  await expect(page).toHaveURL(/\/yks\/2026\/ek-yerlestirme$/);
  await expect(page.getByTestId('direct-answer')).toContainText(
    'Kaynak verisine şu an erişemiyoruz.',
  );
  await expect(page.locator('.answer-value')).toHaveCount(0);
});

test('equivalent Turkish aliases use one canonical URL without inventing a fact', async ({
  page,
}) => {
  for (const query of [
    'yks ikinci tercih',
    'ek yerleştirme ne zaman',
    'yks ek tercihh',
  ]) {
    await page.goto('/ara?q=' + encodeURIComponent(query));
    await expect(page).toHaveURL(/\/yks\/2026\/ek-yerlestirme$/);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      'href',
      'http://127.0.0.1:3100/yks/2026/ek-yerlestirme',
    );
    await expect(page.locator('.answer-value')).toHaveCount(0);
  }
});

test('unconfigured database stays safely unavailable and admin data remains private', async ({
  page,
  request,
}) => {
  const answer = await request.get('/yks/2034/ek-yerlestirme');
  expect(answer.status()).toBe(200);
  expect(await answer.text()).toContain('Kaynak verisine şu an erişemiyoruz.');
  await page.goto('/admin');
  await expect(
    page.getByText('Yönetici erişimi sunucu ortamında yapılandırılmamış.'),
  ).toBeVisible();
  const mutation = await request.post('/api/admin/review', {
    form: { action: 'publish' },
    headers: { origin: 'http://127.0.0.1:3100' },
  });
  expect(mutation.status()).toBe(403);
});
