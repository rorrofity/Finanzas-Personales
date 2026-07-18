// @ts-check
const { test, expect } = require('@playwright/test');

/**
 * Fase 4 — Req 9.6 (actualización SW) y Req 9.11 (standalone viewport).
 *
 * Corre contra el BUILD de producción (playwright.pwa.config.js).
 * - El UpdateBanner debe estar montado en la app real: al despachar el
 *   evento `swUpdated` (el que emite serviceWorkerRegistration.onUpdate),
 *   el banner "Nueva versión disponible" debe aparecer.
 * - El HTML debe declarar viewport-fit=cover (safe-area iOS) y el
 *   manifest display=standalone.
 */

test.describe('Actualización SW (Req 9.6)', () => {
  test('banner "Nueva versión disponible" aparece con SW waiting y Actualizar envía SKIP_WAITING', async ({
    page,
  }) => {
    await page.goto('/login');

    // Simular lo que hace serviceWorkerRegistration.onUpdate al detectar
    // un nuevo SW instalado en estado waiting.
    await page.evaluate(() => {
      window.__skipWaitingMsgs = [];
      const fakeRegistration = {
        waiting: {
          postMessage: (msg) => window.__skipWaitingMsgs.push(msg),
        },
      };
      window.dispatchEvent(
        new CustomEvent('swUpdated', { detail: fakeRegistration })
      );
    });

    await expect(page.getByText(/nueva versión disponible/i)).toBeVisible();

    await page.getByRole('button', { name: /actualizar/i }).click();

    const msgs = await page.evaluate(() => window.__skipWaitingMsgs);
    expect(msgs).toContainEqual({ type: 'SKIP_WAITING' });
  });
});

test.describe('Standalone y safe-area (Req 9.11)', () => {
  test('viewport declara viewport-fit=cover para safe-area iOS', async ({
    page,
  }) => {
    await page.goto('/login');
    const viewport = await page
      .locator('meta[name="viewport"]')
      .getAttribute('content');
    expect(viewport).toContain('viewport-fit=cover');
  });

  test('manifest declara display standalone y theme color', async ({
    page,
    request,
  }) => {
    await page.goto('/login');
    const manifestHref = await page
      .locator('link[rel="manifest"]')
      .getAttribute('href');
    const response = await request.get(manifestHref || '/manifest.json');
    const manifest = await response.json();

    expect(manifest.display).toBe('standalone');
    expect(manifest.theme_color).toBeTruthy();
    expect(manifest.icons.length).toBeGreaterThanOrEqual(8);
  });

  test('la app aplica padding de safe-area en modo standalone', async ({
    page,
  }) => {
    await page.goto('/login');
    // El contenedor raíz debe usar env(safe-area-inset-*) — verificamos que
    // el CSS global lo declare. En producción Emotion inyecta reglas vía
    // CSSOM (insertRule), por lo que hay que revisar document.styleSheets.
    const hasSafeArea = await page.evaluate(() => {
      const inTags = Array.from(document.querySelectorAll('style'))
        .map((s) => s.textContent || '')
        .join('\n')
        .includes('safe-area-inset');
      if (inTags) return true;

      return Array.from(document.styleSheets).some((sheet) => {
        try {
          return Array.from(sheet.cssRules).some((rule) =>
            rule.cssText.includes('safe-area-inset')
          );
        } catch (e) {
          return false;
        }
      });
    });
    expect(hasSafeArea).toBe(true);
  });
});
