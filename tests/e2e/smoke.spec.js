// @ts-check
const { test, expect } = require('@playwright/test');

/**
 * Prueba baseline (smoke) — Fase 0.
 *
 * Objetivo: confirmar que el runner de Playwright funciona contra el
 * entorno LOCAL y que la app carga su pantalla pública de login.
 *
 * No requiere autenticación ni base de datos con datos; solo que el
 * frontend local responda.
 */

test.describe('Baseline / Smoke', () => {
  test('la página de login carga correctamente', async ({ page }) => {
    await page.goto('/login');

    // El formulario de login muestra el título "Iniciar Sesión".
    await expect(
      page.getByRole('heading', { name: /Iniciar Sesión/i })
    ).toBeVisible();

    // Campos de email y contraseña presentes.
    await expect(page.getByLabel(/Correo Electrónico/i)).toBeVisible();
    await expect(page.getByLabel(/Contraseña/i)).toBeVisible();
  });

  test('manifest.json se sirve (base PWA)', async ({ request }) => {
    // Verifica que el manifest exista. En esta fase es el manifest básico;
    // la prueba estricta de campos PWA vive en pwa-install.spec.js (Fase 1).
    const response = await request.get('/manifest.json');
    expect(response.ok()).toBeTruthy();
  });
});
