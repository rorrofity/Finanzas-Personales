// @ts-check
const { test, expect } = require('@playwright/test');

/**
 * Fase 3 — Epic 11 E2E (UI con API mockeada):
 * 3.T3 dueño administra miembros en Settings
 * 3.T4 miembro ve switcher y entra al espacio compartido (header X-Space-Owner)
 * 3.T5 SyncButton y config deshabilitados para el miembro
 * 3.T2 gating de botones sin can_edit / sin can_delete
 * 3.T6 CreatedByChip visible en contexto compartido
 */

const OWN_ID = 'u-me-000';
const SHARED_OWNER_ID = 'u-rodrigo-111';

async function mockAuthenticatedSession(page) {
  await page.addInitScript(() => {
    window.localStorage.setItem('token', 'fake-jwt-token');
  });

  await page.route('**/api/auth/profile', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        user: { id: OWN_ID, nombre: 'Miembro Test', email: 'miembro@local.dev' },
      }),
    });
  });

  await page.route('**/api/suspicious/count', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ count: 0 }) });
  });
}

/** Mock de memberships: propio + espacio compartido de Rodrigo. */
async function mockSpaces(page, { canEdit = false, canDelete = false, sharedSpace = true } = {}) {
  const spaces = [
    { ownerId: OWN_ID, ownerName: 'Miembro Test', isOwner: true, canEdit: true, canDelete: true },
  ];
  if (sharedSpace) {
    spaces.push({
      ownerId: SHARED_OWNER_ID,
      ownerName: 'Rodrigo',
      isOwner: false,
      canEdit,
      canDelete,
    });
  }
  await page.route('**/api/space/memberships', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ spaces }) });
  });
  await page.route('**/api/space/members', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ members: [] }) });
  });
}

async function mockTransactionsData(page, { createdByName = null } = {}) {
  await page.route('**/api/categories**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ id: 1, name: 'Comida' }]) });
  });
  await page.route('**/api/transactions**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          id: 201,
          fecha: '2026-07-10',
          descripcion: 'Supermercado hogar',
          monto: 45000,
          tipo: 'gasto',
          category_id: 1,
          category_name: 'Comida',
          created_by: 'u-partner',
          created_by_name: createdByName,
        },
      ]),
    });
  });
  await page.route('**/api/sync/sync-emails', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ imported: 0, skipped: 0 }) });
  });
}

test.describe('Espacio compartido — UI (Epic 11)', () => {
  test('3.T4 miembro ve el switcher, cambia a "Hogar" y las peticiones llevan X-Space-Owner', async ({ page }) => {
    await mockAuthenticatedSession(page);
    await mockSpaces(page, { canEdit: true });
    await mockTransactionsData(page);

    await page.goto('/transactions');
    await expect(page.getByText('Supermercado hogar')).toBeVisible();

    // Switcher visible (hay 2 espacios)
    const switcher = page.getByTestId('space-switcher');
    await expect(switcher).toBeVisible();

    // Cambiar al espacio compartido y capturar el header del refetch
    const requestPromise = page.waitForRequest(
      (req) => req.url().includes('/api/transactions') && req.method() === 'GET' &&
        req.headers()['x-space-owner'] === SHARED_OWNER_ID
    );
    await switcher.click();
    await page.getByRole('option', { name: /Hogar de Rodrigo/i }).click();
    await requestPromise;
  });

  test('3.T4b sin membresías NO hay switcher (UX idéntica a hoy)', async ({ page }) => {
    await mockAuthenticatedSession(page);
    await mockSpaces(page, { sharedSpace: false });
    await mockTransactionsData(page);

    await page.goto('/transactions');
    await expect(page.getByText('Supermercado hogar')).toBeVisible();
    await expect(page.getByTestId('space-switcher')).toHaveCount(0);
  });

  test('3.T2+3.T5 en espacio compartido sin can_edit: escritura y sync deshabilitados', async ({ page }) => {
    await mockAuthenticatedSession(page);
    await mockSpaces(page, { canEdit: false, canDelete: false });
    await mockTransactionsData(page);

    await page.goto('/transactions');
    await page.getByTestId('space-switcher').click();
    await page.getByRole('option', { name: /Hogar de Rodrigo/i }).click();

    // Botones de escritura disabled (Req 11.6 borde)
    await expect(page.getByRole('button', { name: /^Nueva$/i })).toBeDisabled();
    await expect(page.getByRole('button', { name: /^Importar$/i })).toBeDisabled();

    // SyncButton solo dueño (Req 11.9)
    await expect(page.getByRole('button', { name: /Sincronizar Emails/i })).toBeDisabled();
  });

  test('3.T6 CreatedByChip visible en contexto compartido', async ({ page }) => {
    await mockAuthenticatedSession(page);
    await mockSpaces(page, { canEdit: true });
    await mockTransactionsData(page, { createdByName: 'Pareja' });

    await page.goto('/transactions');
    await page.getByTestId('space-switcher').click();
    await page.getByRole('option', { name: /Hogar de Rodrigo/i }).click();

    await expect(page.getByText('Pareja').first()).toBeVisible();
  });

  test('4.T3 revocación en vivo: 403 devuelve al espacio propio con aviso', async ({ page }) => {
    await mockAuthenticatedSession(page);
    await mockSpaces(page, { canEdit: true });
    await mockTransactionsData(page);

    await page.goto('/transactions');
    await page.getByTestId('space-switcher').click();
    await page.getByRole('option', { name: /Hogar de Rodrigo/i }).click();

    // El dueño revoca: las siguientes peticiones al espacio devuelven 403
    await page.unroute('**/api/transactions**');
    await page.route('**/api/transactions**', async (route) => {
      if (route.request().headers()['x-space-owner'] === SHARED_OWNER_ID) {
        await route.fulfill({
          status: 403,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'No tienes acceso a este espacio', code: 'SPACE_FORBIDDEN' }),
        });
        return;
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    });

    // Forzar un refetch navegando dentro del espacio compartido
    await page.reload();

    // Aviso + vuelta al espacio propio (Req borde Epic 11)
    await expect(page.getByText(/Perdiste acceso al espacio compartido/i)).toBeVisible();
    await expect(page.getByTestId('space-switcher')).toHaveText(/Mi espacio/i);
  });

  test('3.T3 dueño administra miembros desde Settings (invitar + toggles)', async ({ page }) => {
    await mockAuthenticatedSession(page);
    await mockSpaces(page, { sharedSpace: false });

    let invited = null;
    const membersList = [];
    await page.unroute('**/api/space/members');
    await page.route('**/api/space/members', async (route) => {
      if (route.request().method() === 'POST') {
        invited = route.request().postDataJSON();
        const member = {
          id: 'm-1',
          invitedEmail: invited.email,
          memberName: null,
          status: 'pending',
          canEdit: !!invited.canEdit,
          canDelete: !!invited.canDelete,
          isActive: true,
        };
        membersList.push(member);
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({ member }),
        });
        return;
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ members: membersList }) });
    });

    await page.goto('/settings');
    await expect(page.getByRole('tab', { name: /Espacio compartido/i })).toBeVisible();
    await page.getByRole('tab', { name: /Espacio compartido/i }).click();

    await page.getByLabel(/Email del invitado/i).fill('pareja@test.local');
    await page.getByRole('button', { name: /^Invitar$/i }).click();

    await expect(page.getByText(/pareja@test.local/)).toBeVisible();
    expect(invited.email).toBe('pareja@test.local');
  });
});
