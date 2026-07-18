// @ts-check
const { defineConfig } = require('@playwright/test');

/**
 * Config Playwright para pruebas de API (Epic 11 — matriz de permisos ACL).
 *
 * Corren contra el backend LOCAL (:3001) usando el fixture `request` de
 * Playwright (sin browser). Requieren PostgreSQL local y usuarios de prueba
 * (los crea el helper tests/api/helpers/users.js vía /api/auth/register).
 *
 * Uso: npm run test:api
 */

const API_URL = process.env.E2E_API_URL || 'http://localhost:3001';

module.exports = defineConfig({
  testDir: './tests/api',
  timeout: 30 * 1000,
  expect: { timeout: 5 * 1000 },
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1, // las pruebas comparten estado de BD (membresías) — secuencial
  reporter: [['list']],
  use: {
    baseURL: API_URL,
  },
  projects: [{ name: 'api' }],
  webServer: {
    command: 'node backend/server.js',
    url: `${API_URL}/api/health`,
    reuseExistingServer: true,
    timeout: 30 * 1000,
  },
});
