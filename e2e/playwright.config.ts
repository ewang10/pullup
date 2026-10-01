/**
 * Browser tests for the website: access control per role and automated
 * accessibility (axe, WCAG 2.2 A/AA) on public and signed-in pages.
 *
 * Read-only against a running deployment (production by default), signing in
 * with the public demo accounts shown on the login page. Point it elsewhere
 * with E2E_BASE_URL.
 */
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'https://pullup-kappa-gray.vercel.app',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
