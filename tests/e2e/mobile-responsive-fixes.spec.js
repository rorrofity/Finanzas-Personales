// @ts-check
const { test, expect } = require('@playwright/test');

/**
 * Fix producción (post Epic 11): páginas que no se ajustan al ancho del
 * teléfono. El helper histórico comparaba contra window.innerWidth, pero en
 * móvil real el navegador hace zoom-out cuando el contenido fuerza más ancho
 * (innerWidth crece) y el problema queda oculto. Aquí se compara contra el
 * ancho FÍSICO del viewport del proyecto.
 *
 * Cubre las páginas que nunca tuvieron auditoría mobile: Settings (tabs),
 * Categorías y Revisar Duplicados — con datos mockeados realistas.
 */

async function mockAuthenticatedSession(page) {
  await page.addInitScript(() => {
    window.localStorage.setItem('token', 'fake-jwt-token');
  });
  await page.route('**/api/auth/profile', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        user: { id: 'u-1', nombre: 'Usuario Test', email: 'test@local.dev' },
      }),
    });
  });
  await page.route('**/api/suspicious/count', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ count: 2 }) });
  });
  await page.route('**/api/space/memberships', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        spaces: [{ ownerId: 'u-1', ownerName: 'Usuario Test', isOwner: true, canEdit: true, canDelete: true }],
      }),
    });
  });
  await page.route('**/api/space/members', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        members: [
          { id: 'm1', invitedEmail: 'pareja.con.email.largo@gmail.com', memberName: 'Pareja De Prueba', status: 'linked', canEdit: true, canDelete: false, isActive: true },
        ],
      }),
    });
  });
}

/** Ancho físico del viewport del proyecto actual. */
const viewportWidth = (testInfo) => testInfo.project.use.viewport.width;

async function expectFitsViewport(page, width) {
  await expect
    .poll(async () =>
      page.evaluate(() => document.documentElement.scrollWidth)
    )
    .toBeLessThanOrEqual(width + 1);
}

test.describe('Ajuste al ancho del teléfono (fix producción)', () => {
  test.beforeEach(async ({}, testInfo) => {
    test.skip(
      !['mobile-375', 'tablet-768'].includes(testInfo.project.name),
      'Suite solo para viewports mobile/tablet.'
    );
  });

  test('Settings (tabs y tablas) cabe en el ancho del dispositivo', async ({ page }, testInfo) => {
    await mockAuthenticatedSession(page);
    await page.route('**/api/cards', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { id: 1, last_four: '4478', network: 'mastercard', holder: 'Rodrigo Pizarro Leeson', label: 'Tarjeta principal del hogar', is_active: true },
          { id: 2, last_four: '3076', network: 'visa', holder: 'Rodrigo Pizarro Leeson', label: 'Secundaria', is_active: true },
        ]),
      });
    });

    await page.goto('/settings');
    await expect(page.getByRole('tab', { name: /Perfil/i })).toBeVisible();
    await expectFitsViewport(page, viewportWidth(testInfo));

    // Tab de tarjetas (tabla)
    await page.getByRole('tab', { name: /Tarjetas/i }).click();
    await expect(page.getByText(/Tarjetas registradas/i)).toBeVisible();
    await expectFitsViewport(page, viewportWidth(testInfo));

    // Tab de espacio compartido (tabla de miembros)
    await page.getByRole('tab', { name: /Espacio compartido/i }).click();
    await expect(page.getByText(/pareja.con.email.largo/i)).toBeVisible();
    await expectFitsViewport(page, viewportWidth(testInfo));
  });

  test('Categorías cabe en el ancho del dispositivo', async ({ page }, testInfo) => {
    await mockAuthenticatedSession(page);
    await page.route('**/api/categories**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { id: 1, name: 'Supermercado y compras grandes del hogar', description: 'Todas las compras de supermercado, ferias y almacenes del mes' },
          { id: 2, name: 'Cuentas y servicios básicos', description: 'Luz, agua, gas, internet, telefonía' },
        ]),
      });
    });

    await page.goto('/categories');
    await expect(page.getByText(/Supermercado y compras/i)).toBeVisible();
    await expectFitsViewport(page, viewportWidth(testInfo));
  });

  test('Revisar Duplicados cabe en el ancho del dispositivo', async ({ page }, testInfo) => {
    await mockAuthenticatedSession(page);
    await page.route('**/api/suspicious', async (route) => {
      if (route.request().url().includes('/count')) return route.fallback();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          suspicious: [
            {
              suspicious_id: 's1',
              detected_at: '2026-07-15T10:00:00Z',
              transaction1_id: 't1',
              fecha1: '2026-07-10',
              descripcion1: 'MERPAGO*COMERCIO CON NOMBRE MUY LARGO SANTIAGO CL',
              monto1: 45990,
              imported1_at: '2026-07-11T10:00:00Z',
              transaction2_id: 't2',
              fecha2: '2026-07-10',
              descripcion2: 'MERCADOPAGO COMERCIO CON NOMBRE MUY LARGO STGO',
              monto2: 45990,
              imported2_at: '2026-07-12T10:00:00Z',
              type: 'national',
            },
          ],
        }),
      });
    });

    await page.goto('/review-duplicates');
    await expect(page.getByText(/Posible duplicado/i)).toBeVisible();
    await expectFitsViewport(page, viewportWidth(testInfo));
  });
});
