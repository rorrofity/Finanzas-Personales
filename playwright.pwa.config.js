// @ts-check
const { defineConfig, devices } = require('@playwright/test');

/**
 * Config Playwright DEDICADA a pruebas que requieren el Service Worker.
 *
 * El SW de CRA (InjectManifest) SOLO se registra en un build de producción
 * servido estáticamente — no en el dev server. Por eso estas pruebas:
 *   1. Construyen la app (`npm run build`).
 *   2. La sirven con `serve` en el puerto 3100.
 *
 * Corre contra LOCAL únicamente. No requiere backend para verificar el
 * registro del SW y la instalabilidad (la app pública basta).
 *
 * Uso: npm run test:e2e:pwa
 */

const PWA_PORT = 3100;
const BASE_URL = `http://localhost:${PWA_PORT}`;

module.exports = defineConfig({
  testDir: './tests/pwa-build',
  timeout: 60 * 1000,
  expect: { timeout: 10 * 1000 },
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'pwa-chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: `npm run build && npx serve -s build -l ${PWA_PORT}`,
    url: BASE_URL,
    reuseExistingServer: false,
    timeout: 180 * 1000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
