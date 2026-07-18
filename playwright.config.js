// @ts-check
const { defineConfig, devices } = require('@playwright/test');

/**
 * Configuración Playwright para Finanzas Personales PWA.
 *
 * Política Test-First (TEST-001): las pruebas se escriben ANTES de la
 * implementación y deben fallar primero.
 *
 * IMPORTANTE: estas pruebas corren SIEMPRE contra el entorno LOCAL.
 * Nunca apuntar a producción (finanzas.rocketflow.cl).
 *
 * El frontend local corre en http://localhost:3000 (CRA dev server,
 * que proxya /api hacia el backend en :3001).
 *
 * Nota PWA: el Service Worker de CRA solo se registra en un build de
 * producción servido estáticamente. Las pruebas que dependen del SW
 * (Fase 1+) se ejecutarán contra un build servido; ver scripts
 * `serve:build` y la variable de entorno E2E_BASE_URL.
 */

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:3000';

module.exports = defineConfig({
  testDir: './tests/e2e',
  /* Tiempo máximo por prueba */
  timeout: 30 * 1000,
  expect: {
    timeout: 5 * 1000,
  },
  /* Falla el build en CI si quedó un test.only */
  forbidOnly: !!process.env.CI,
  /* Reintentos solo en CI */
  retries: process.env.CI ? 2 : 0,
  /* Workers: 1 en local para evitar choques con datos compartidos */
  workers: process.env.CI ? 1 : 1,
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'playwright-report' }],
  ],
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    {
      name: 'desktop-chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 720 },
      },
    },
    {
      name: 'mobile-375',
      use: {
        ...devices['iPhone SE'],
        viewport: { width: 375, height: 667 },
      },
    },
    {
      name: 'tablet-768',
      use: {
        ...devices['iPad Mini'],
        viewport: { width: 768, height: 1024 },
      },
    },
  ],

  /*
   * webServer: Playwright levanta el entorno local automáticamente si no
   * hay uno corriendo. Usa `npm run dev` (frontend + backend concurrentes).
   * Requiere PostgreSQL local activo y .env configurado.
   */
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
