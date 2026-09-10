import { scryptSync } from 'node:crypto';
import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.spec.ts',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { baseURL: 'http://127.0.0.1:3100', trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    {
      name: 'mobile',
      use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium' },
    },
  ],
  webServer: {
    command: 'pnpm --filter @sak/web start --hostname 127.0.0.1 --port 3100',
    url: 'http://127.0.0.1:3100',
    reuseExistingServer: false,
    timeout: 120000,
    env: {
      NODE_OPTIONS: `--import=${new URL('./tests/e2e/clock.mjs', import.meta.url).href}`,
      PUBLIC_SITE_URL: 'http://127.0.0.1:3100',
      ADMIN_PASSWORD_SCRYPT:
        'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa:' +
        scryptSync(
          'fixture-admin-password-only',
          'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
          64,
        ).toString('hex'),
      ADMIN_SESSION_SECRET: 'fixture-only-session-key-at-least-32-characters',
      ANALYTICS_SALT: 'fixture-only-analytics-salt-at-least-32-characters',
    },
  },
});
