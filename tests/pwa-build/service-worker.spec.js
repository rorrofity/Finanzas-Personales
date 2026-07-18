// @ts-check
const { test, expect } = require('@playwright/test');

/**
 * Fase 1 — Req 9.1: registro del Service Worker.
 *
 * Estas pruebas requieren un BUILD de producción servido (ver
 * playwright.pwa.config.js). Verifican que el SW se registre y active,
 * y que el HTML enlace el manifest (instalabilidad básica).
 */

test.describe('PWA / Service Worker (Req 9.1)', () => {
  test('el index.html enlaza el manifest', async ({ page }) => {
    await page.goto('/');
    const manifestHref = await page
      .locator('link[rel="manifest"]')
      .getAttribute('href');
    expect(manifestHref).toBeTruthy();
  });

  test('el Service Worker se registra y activa', async ({ page }) => {
    await page.goto('/');

    // Esperar a que el SW quede listo (controlando o activado).
    const swActive = await page.evaluate(async () => {
      if (!('serviceWorker' in navigator)) return false;
      try {
        const reg = await navigator.serviceWorker.ready;
        return !!(reg && (reg.active || reg.installing || reg.waiting));
      } catch (e) {
        return false;
      }
    });

    expect(swActive).toBeTruthy();
  });

  test('existe al menos una cache de Workbox tras cargar', async ({ page }) => {
    await page.goto('/');
    // Dar tiempo al SW a precachear el App Shell.
    await page.waitForTimeout(3000);

    const cacheNames = await page.evaluate(async () => {
      if (!('caches' in window)) return [];
      return await caches.keys();
    });

    // Workbox crea caches con prefijo 'workbox-precache' u otros.
    expect(cacheNames.length).toBeGreaterThan(0);
  });
});
