// @ts-check
const path = require('path');
const { defineConfig, devices } = require('@playwright/test');

// Fixed loopback address. Deliberately ignores E2E_BASE_URL and all real credentials.
const baseURL = 'http://127.0.0.1:3105';
module.exports = defineConfig({
  testDir: './tests/e2e',
  testMatch: ['expense-evolution.spec.js', 'dashboard-redesign.spec.js', 'compact-totals.spec.js'],
  timeout: 30000,
  expect: { timeout: 8000 },
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: [['list']],
  outputDir: 'test-results/dashboard-fixtures',
  use: { baseURL, serviceWorkers: 'block', screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  projects: [
    { name: 'dashboard-desktop', testIgnore: 'compact-totals.spec.js', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } } },
    { name: 'dashboard-mobile', testIgnore: 'compact-totals.spec.js', use: { ...devices['Desktop Chrome'], viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true } },
    { name: 'dashboard-tablet', testIgnore: 'compact-totals.spec.js', use: { ...devices['Desktop Chrome'], viewport: { width: 768, height: 1024 }, hasTouch: true } },
    { name: 'mobile-375', testMatch: 'compact-totals.spec.js', use: { ...devices['Desktop Chrome'], viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true } },
  ],
  webServer: {
    command: 'node scripts/serve-dashboard-fixtures.js',
    cwd: __dirname,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 15000,
    env: { DASHBOARD_BUILD_DIR: process.env.DASHBOARD_BUILD_DIR || path.join(__dirname, 'build') },
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
