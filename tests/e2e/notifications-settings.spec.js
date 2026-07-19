// @ts-check
const { test, expect } = require('@playwright/test');

/**
 * Epic 13 Fase 4 — E2E (UI con API mockeada):
 * 4.T3 Settings muestra "Automatización" solo al dueño; toggle sync programada
 * 4.T4 activar notificaciones pide permiso (mock concedido) → subscribe; prueba
 */

const OWN_ID = 'u-owner-000';
const MEMBER_ID = 'u-member-111';

async function mockAuthenticatedSession(page, { userId = OWN_ID, nombre = 'Dueño Test' } = {}) {
  await page.addInitScript(() => {
    window.localStorage.setItem('token', 'fake-jwt-token');
  });
  await page.route('**/api/auth/profile', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ user: { id: userId, nombre, email: 'test@local.dev' } }),
    });
  });
  await page.route('**/api/suspicious/count', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ count: 0 }) });
  });
}

async function mockSpaces(page, { isOwner = true } = {}) {
  const spaces = isOwner
    ? [{ ownerId: OWN_ID, ownerName: 'Dueño Test', isOwner: true, canEdit: true, canDelete: true }]
    : [
        { ownerId: MEMBER_ID, ownerName: 'Miembro Test', isOwner: true, canEdit: true, canDelete: true },
        { ownerId: OWN_ID, ownerName: 'Dueño Test', isOwner: false, canEdit: true, canDelete: false },
      ];
  await page.route('**/api/space/memberships', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ spaces }) });
  });
  await page.route('**/api/space/members', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ members: [] }) });
  });
}

async function mockCards(page) {
  await page.route('**/api/cards', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
  });
}

test.describe('Automatización (sync programada + push) en Settings — Epic 13', () => {
  test('4.T3a el dueño ve la pestaña Automatización', async ({ page }) => {
    await mockAuthenticatedSession(page);
    await mockSpaces(page);
    await mockCards(page);
    await page.route('**/api/sync/settings', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ autoSyncEnabled: false }) });
    });

    await page.goto('/settings');
    await expect(page.getByRole('tab', { name: /Automatización/i })).toBeVisible();
  });

  test('4.T3b un miembro (viendo un espacio ajeno) NO ve la pestaña Automatización', async ({ page }) => {
    await mockAuthenticatedSession(page, { userId: MEMBER_ID, nombre: 'Miembro Test' });
    await mockSpaces(page, { isOwner: false });
    await mockCards(page);

    await page.goto('/settings');
    // El switcher cambia al espacio compartido -> ya no es dueño ahí
    const switcher = page.getByTestId('space-switcher');
    if (await switcher.count()) {
      await switcher.click();
      await page.getByRole('option', { name: /Hogar de Dueño Test/i }).click();
    }
    await expect(page.getByRole('tab', { name: /Automatización/i })).toHaveCount(0);
  });

  test('4.T3c activar el toggle de sync programada llama PUT /sync/settings', async ({ page }) => {
    await mockAuthenticatedSession(page);
    await mockSpaces(page);
    await mockCards(page);

    let putBody = null;
    await page.route('**/api/sync/settings', async (route) => {
      if (route.request().method() === 'PUT') {
        putBody = route.request().postDataJSON();
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ autoSyncEnabled: putBody.autoSyncEnabled }) });
        return;
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ autoSyncEnabled: false }) });
    });
    await page.route('**/api/sync/runs', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ runs: [] }) });
    });

    await page.goto('/settings');
    await page.getByRole('tab', { name: /Automatización/i }).click();

    await page.getByRole('checkbox', { name: /Sincronizar automáticamente/i }).click();

    await expect.poll(() => putBody).toEqual({ autoSyncEnabled: true });
  });

  test('4.T4 activar notificaciones pide permiso y suscribe; botón de prueba envía push', async ({ page, context, browserName }) => {
    await mockAuthenticatedSession(page);
    await mockSpaces(page);
    await mockCards(page);
    await page.route('**/api/sync/settings', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ autoSyncEnabled: false }) });
    });
    await page.route('**/api/sync/runs', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ runs: [] }) });
    });

    if (browserName === 'webkit') {
      // mobile-375/tablet-768 emulan iPhone/iPad con el motor WebKit real:
      // ahí la Push API no está disponible fuera de una PWA instalada
      // (misma limitación de iOS documentada en spec.md Epic 13). Se
      // verifica que la UI lo explique en vez de mostrar un checkbox roto.
      await page.goto('/settings');
      await page.getByRole('tab', { name: /Automatización/i }).click();
      await expect(page.getByText(/no soporta notificaciones push/i)).toBeVisible();
      await expect(page.getByRole('checkbox', { name: /Notificaciones push/i })).toHaveCount(0);
      return;
    }

    await page.route('**/api/push/vapid-public-key', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ publicKey: 'BAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' }) });
    });
    let subscribeCalled = false;
    await page.route('**/api/push/subscribe', async (route) => {
      subscribeCalled = true;
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
    });
    let testCalled = false;
    await page.route('**/api/push/test', async (route) => {
      testCalled = true;
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
    });

    await context.grantPermissions(['notifications']);
    // Mockear el pushManager del SW: jsdom real del navegador Chromium
    // headless soporta Notification, pero no siempre PushManager en test.
    await page.addInitScript(() => {
      const fakeSubscription = {
        endpoint: 'https://fcm.googleapis.com/fcm/send/e2e-fake',
        toJSON: () => ({
          endpoint: 'https://fcm.googleapis.com/fcm/send/e2e-fake',
          keys: { p256dh: 'fake-p256dh', auth: 'fake-auth' },
        }),
        unsubscribe: async () => true,
      };
      // navigator.serviceWorker.ready es un getter nativo en Chromium real
      // (a diferencia de jsdom): hay que redefinirlo con defineProperty,
      // una asignación directa se ignora silenciosamente.
      if (navigator.serviceWorker) {
        Object.defineProperty(navigator.serviceWorker, 'ready', {
          configurable: true,
          get: () =>
            Promise.resolve({
              pushManager: {
                subscribe: async () => fakeSubscription,
                getSubscription: async () => null,
              },
            }),
        });
      }
    });

    await page.goto('/settings');
    await page.getByRole('tab', { name: /Automatización/i }).click();

    await page.getByRole('checkbox', { name: /Notificaciones push/i }).click();

    await expect.poll(() => subscribeCalled).toBe(true);

    await page.getByRole('button', { name: /Enviar prueba/i }).click();
    await expect.poll(() => testCalled).toBe(true);
  });
});
