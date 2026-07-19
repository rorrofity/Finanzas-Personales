// @ts-check
const { test, expect } = require('@playwright/test');

/**
 * Fix producción: "pantalla ensombrecida al entrar" en el teléfono.
 *
 * Causa: el backdrop del Drawer móvil (z-index < AppBar, por eso la barra
 * superior se ve normal y el resto oscuro). Al reanudar la PWA desde
 * recientes (bfcache/visibilitychange), Android restaura el estado JS con
 * el drawer "abierto" pero el panel fuera de pantalla: queda solo el
 * backdrop, y el toggle desincronizado exige dos toques para limpiar.
 *
 * Contrato: al reanudar la app (pageshow persisted / visibilitychange),
 * el drawer móvil SIEMPRE debe quedar cerrado, sin backdrop.
 */

async function mockAuthenticatedSession(page) {
  await page.addInitScript(() => {
    window.localStorage.setItem('token', 'fake-jwt-token');
  });
  await page.route('**/api/auth/profile', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ user: { id: 'u-1', nombre: 'Usuario Test', email: 't@t.cl' } }),
    });
  });
  await page.route('**/api/suspicious/count', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ count: 0 }) });
  });
  await page.route('**/api/space/**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ spaces: [], members: [] }) });
  });
  await page.route('**/api/categories**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
  });
}

const visibleBackdrops = (page) =>
  page.evaluate(
    () =>
      Array.from(document.querySelectorAll('.MuiBackdrop-root')).filter((b) => {
        const s = getComputedStyle(b);
        const r = b.getBoundingClientRect();
        // Nota: los backdrops son position:fixed (offsetParent siempre null)
        return s.visibility !== 'hidden' && Number(s.opacity) > 0 && r.width > 0;
      }).length
  );

test.describe('Drawer móvil al reanudar la app (fix sombreado)', () => {
  test.beforeEach(async ({}, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-375', 'Solo mobile.');
  });

  test('al reanudar (pageshow persisted) el drawer queda cerrado sin backdrop', async ({ page }) => {
    await mockAuthenticatedSession(page);
    await page.goto('/categories');
    await expect(page.getByRole('heading', { name: /Gestión de Categorías/i })).toBeVisible();

    // Abrir el drawer (backdrop visible)
    await page.getByRole('button', { name: /toggle drawer/i }).click();
    await expect.poll(() => visibleBackdrops(page)).toBeGreaterThan(0);

    // Simular reanudación de la PWA desde recientes (bfcache)
    await page.evaluate(() => {
      window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
      document.dispatchEvent(new Event('visibilitychange'));
    });

    // El drawer debe cerrarse solo: sin backdrop, contenido interactuable
    await expect.poll(() => visibleBackdrops(page)).toBe(0);

    // Y un solo toque en el hamburger debe abrir normalmente (sin desync)
    await page.getByRole('button', { name: /toggle drawer/i }).click();
    await expect.poll(() => visibleBackdrops(page)).toBeGreaterThan(0);
  });
});
