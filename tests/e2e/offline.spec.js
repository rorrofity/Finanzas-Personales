// @ts-check
const { test, expect } = require('@playwright/test');

async function mockAuthenticatedSession(page) {
  await page.addInitScript(() => {
    window.localStorage.setItem('token', 'fake-jwt-token');
  });

  await page.route('**/api/auth/profile', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        user: { id: 1, nombre: 'Usuario Test', email: 'test@local.dev' },
      }),
    });
  });

  await page.route('**/api/suspicious/count', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ count: 0 }),
    });
  });
}

async function setFixedPeriod(page, period = '2026-06') {
  await page.addInitScript((seedPeriod) => {
    window.sessionStorage.setItem('period', seedPeriod);
  }, period);
}

async function mockDashboardData(page) {
  await page.route('**/api/dashboard/overview**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        period: { year: 2026, month: 6 },
        balance: { value: 180000, deltaPct: null },
        gastos: { value: 120000, deltaPct: null },
        ingresos: { value: 300000, deltaPct: null },
        tasaAhorro: 0.6, burnRate: null, disponibleHoy: 500000,
        compromisos: { total: 0, tcNoFacturado: 0, cuotas: 0, intl: 0, proyectados: 0 },
        topCategorias: [{ name: 'Comida', total: 100000, pct: 1, deltaPct: null }],
      }),
    });
  });
  await page.route('**/api/dashboard/monthly-history**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        { year: 2026, month: 6, gastosTC: 100000, gastosCC: 20000, ingresosCC: 300000, balance: 180000 },
      ]),
    });
  });

  await page.route('**/api/dashboard/categories**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([{ category_name: 'Comida', total: 100000 }]),
    });
  });

  await page.route('**/api/dashboard/category-evolution**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: [], categories: [] }),
    });
  });
}

async function mockTransactionsData(page) {
  await page.route('**/api/categories**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([{ id: 1, nombre: 'Comida' }]),
    });
  });

  await page.route('**/api/transactions**', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 101,
            fecha: '2026-06-10',
            descripcion: 'Compra supermercado',
            monto: 25000,
            tipo: 'gasto',
            category_id: 1,
            category_name: 'Comida',
            provider: 'bci',
            network: 'visa',
          },
        ]),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true }),
    });
  });

  await page.route('**/api/sync/sync-emails', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ imported: 0, skipped: 0, errors: [], message: 'ok' }),
    });
  });
}

test.describe('Offline UX', () => {
  test('muestra banner de sin conexión en dashboard', async ({ page }) => {
    await mockAuthenticatedSession(page);
    await mockDashboardData(page);

    await page.goto('/');
    await expect(page.getByRole('heading', { name: /Dashboard/i })).toBeVisible();

    await page.context().setOffline(true);
    await page.evaluate(() => window.dispatchEvent(new Event('offline')));

    await expect(page.getByText(/Sin conexión/i)).toBeVisible();
    await expect(page.getByText(/datos guardados/i)).toBeVisible();
  });

  test('deshabilita SyncButton en offline con mensaje claro', async ({ page }) => {
    await mockAuthenticatedSession(page);
    await mockDashboardData(page);

    await page.goto('/');
    await expect(page.getByRole('button', { name: /Sincronizar Emails/i })).toBeVisible();

    await page.context().setOffline(true);
    await page.evaluate(() => window.dispatchEvent(new Event('offline')));

    await expect(page.getByRole('button', { name: /Sincronizar Emails/i })).toBeDisabled();
    await expect(page.locator('main').getByText(/Requiere conexión/i).last()).toBeVisible();
  });

  test('deshabilita acciones de escritura en Transactions cuando está offline', async ({ page }) => {
    await mockAuthenticatedSession(page);
    await mockTransactionsData(page);

    await page.goto('/transactions');
    await expect(page.getByRole('button', { name: /Sincronizar Emails/i })).toBeVisible();

    await page.context().setOffline(true);
    await page.evaluate(() => window.dispatchEvent(new Event('offline')));

    await expect(page.getByRole('button', { name: /^Nueva$/i })).toBeDisabled();
    await expect(page.getByRole('button', { name: /^Importar$/i })).toBeDisabled();

    const editButton = page.locator('button[aria-label="Editar"]');
    const deleteButton = page.locator('button[aria-label="Eliminar"]');

    await expect(editButton.first()).toBeDisabled();
    await expect(deleteButton.first()).toBeDisabled();
  });

  test('refresca datos automáticamente al reconectar', async ({ page }) => {
    await mockAuthenticatedSession(page);
    await setFixedPeriod(page);

    // El balance del dashboard ahora viene del endpoint overview (Epic 12)
    let overviewPayload = {
      period: { year: 2026, month: 6 },
      balance: { value: 180000, deltaPct: null },
      gastos: { value: 120000, deltaPct: null },
      ingresos: { value: 300000, deltaPct: null },
      tasaAhorro: 0.6, burnRate: null, disponibleHoy: 500000,
      compromisos: { total: 0, tcNoFacturado: 0, cuotas: 0, intl: 0, proyectados: 0 },
      topCategorias: [{ name: 'Comida', total: 100000, pct: 1, deltaPct: null }],
    };

    await page.route('**/api/dashboard/overview**', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(overviewPayload) });
    });
    await page.route('**/api/dashboard/monthly-history**', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    });
    await page.route('**/api/dashboard/category-evolution**', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [], categories: [] }) });
    });

    await page.goto('/');
    await expect(page.getByText(/\$180\.000/)).toBeVisible();

    await page.context().setOffline(true);
    await page.evaluate(() => window.dispatchEvent(new Event('offline')));
    await expect(page.getByText(/Sin conexión/i)).toBeVisible();

    overviewPayload = { ...overviewPayload, balance: { value: 230000, deltaPct: null } };

    await page.context().setOffline(false);
    await page.evaluate(() => window.dispatchEvent(new Event('online')));

    await expect(page.getByText(/\$230\.000/)).toBeVisible();
  });
});
