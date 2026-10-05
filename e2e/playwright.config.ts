/**
 * Browser tests for the website.
 *
 * - Read-only tests (tests/*.spec.ts): access control per role and axe
 *   WCAG 2.2 A/AA checks. Safe to run against production (the default).
 * - Functional tests (tests/functional): create, edit and review things, so
 *   they only run with E2E_LOCAL=1 against a throwaway local Supabase (see
 *   the "functional" job in .github/workflows/tests.yml). They also call the
 *   local edge functions directly to walk a rider's visit end to end.
 */
import { defineConfig, devices } from '@playwright/test';

const local = process.env.E2E_LOCAL === '1';

export default defineConfig({
  testDir: './tests',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  retries: process.env.CI ? 1 : 0,
  // Functional tests share one database, so run one at a time locally.
  workers: local ? 1 : undefined,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'https://pullup-kappa-gray.vercel.app',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'read-only', testIgnore: /functional\//, use: { ...devices['Desktop Chrome'] } },
    ...(local
      ? [{ name: 'functional', testMatch: /functional\/.*\.spec\.ts/, use: { ...devices['Desktop Chrome'] } }]
      : []),
  ],
});
