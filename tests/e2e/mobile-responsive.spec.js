// @ts-check
const { test, expect } = require('@playwright/test');

/**
 * @param {import('@playwright/test').Page} page
 */
async function mockAuthenticatedSession(page) {
  await page.addInitScript(() => {
    window.localStorage.setItem('token', 'fake-jwt-token');
    window.sessionStorage.setItem('period', '2026-06');
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

/**
 * @param {import('@playwright/test').Page} page
 */
async function expectNoHorizontalOverflow(page) {
  await expect
    .poll(async () => {
      return page.evaluate(() => {
        return document.documentElement.scrollWidth <= window.innerWidth + 1;
      });
    })
    .toBeTruthy();
}

/**
 * @param {import('@playwright/test').Page} page
 */
async function mockTransactionsPage(page) {
  await page.route('**/api/categories', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([{ id: 1, name: 'Comida' }]),
    });
  });

  await page.route('**/api/transactions**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          id: 101,
          fecha: '2026-06-10',
          descripcion: 'Compra supermercado de prueba en mobile',
          monto: 25000,
          tipo: 'gasto',
          category_id: 1,
          category_name: 'Comida',
          provider: 'bci',
          network: 'visa',
        },
      ]),
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

/**
 * @param {import('@playwright/test').Page} page
 */
async function mockTransactionsIntlPage(page) {
  await page.route('**/api/categories', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([{ id: 1, name: 'Viajes' }]),
    });
  });

  await page.route('**/api/intl-unbilled**', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 201,
            fecha: '2026-06-12',
            descripcion: 'Compra internacional de prueba',
            amount_usd: 45.5,
            amount_clp: 43000,
            exchange_rate: 945,
            tipo: 'gasto',
            category_id: 1,
            brand: 'visa',
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

/**
 * @param {import('@playwright/test').Page} page
 */
async function mockCheckingPage(page) {
  await page.route('**/api/checking/global-balance', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ saldo_actual: 500000 }),
    });
  });

  await page.route('**/api/checking?**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        items: [
          {
            id: 1,
            fecha: '2026-06-10',
            descripcion: 'Movimiento cuenta corriente de prueba',
            amount: -25000,
            tipo: 'cargo',
            category_id: 1,
            category_name: 'Hogar',
          },
        ],
      }),
    });
  });

  await page.route('**/api/categories', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([{ id: 1, name: 'Hogar' }]),
    });
  });
}

/**
 * @param {import('@playwright/test').Page} page
 */
async function mockInstallmentsPage(page) {
  await page.route('**/api/installments/plans', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          id: 1,
          brand: 'visa',
          descripcion: 'Notebook 12 cuotas',
          amount_per_installment: 75000,
          total_installments: 12,
          paid_installments: 3,
        },
      ]),
    });
  });

  await page.route('**/api/installments/occurrences**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          id: 11,
          plan_id: 1,
          descripcion: 'Notebook 12 cuotas',
          installment_number: 4,
          total_installments: 12,
          amount: 75000,
          brand: 'visa',
          category_id: 1,
        },
      ]),
    });
  });

  await page.route('**/api/categories', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([{ id: 1, name: 'Tecnología' }]),
    });
  });
}

/**
 * @param {import('@playwright/test').Page} page
 */
async function mockProjectedPage(page) {
  await page.route('**/api/projected**', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            occurrence_id: 301,
            template_id: 501,
            fecha: '2026-06-15',
            nombre: 'Arriendo proyectado',
            tipo: 'gasto',
            monto: 450000,
            category_id: 1,
            category_name: 'Vivienda',
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

  await page.route('**/api/projected/template/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true }),
    });
  });

  await page.route('**/api/categories', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([{ id: 1, name: 'Vivienda' }]),
    });
  });
}

/**
 * @param {import('@playwright/test').Page} page
 */
async function mockDashboardPage(page) {
  await page.route('**/api/dashboard/monthly-history**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        { year: 2026, month: 6, gastosTC: 100000, gastosCC: 50000, ingresosCC: 800000, balance: 650000 },
      ]),
    });
  });

  await page.route('**/api/dashboard/categories**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([{ categoria: 'Comida', total: 100000 }]),
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

/**
 * @param {import('@playwright/test').Page} page
 */
async function mockFinancialHealthPage(page) {
  await page.route('**/api/financial-health/summary**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        checking: { availableNow: 350000 },
        creditCards: { visa: 100000, mastercard: 50000 },
        projected: { income: 1200000 },
        summary: {
          healthScore: 72,
          healthStatus: 'healthy',
          totalCommitments: 550000,
          projectedBalance: 650000,
        },
        alerts: [],
      }),
    });
  });

  await page.route('**/api/dashboard/categories**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([{ categoria: 'Vivienda', total: 250000 }]),
    });
  });
}

test.describe('Mobile responsive UX', () => {
  test.beforeEach(async ({}, testInfo) => {
    test.skip(
      !['mobile-375', 'tablet-768'].includes(testInfo.project.name),
      'Esta suite valida únicamente viewports mobile y tablet.'
    );
  });

  test('Transactions en 375px renderiza cards sin scroll horizontal', async ({ page }) => {
    await mockAuthenticatedSession(page);
    await mockTransactionsPage(page);

    await page.goto('/transactions');

    await expect(page.getByText(/Compra supermercado de prueba en mobile/i)).toBeVisible();
    await expect(page.locator('table')).toHaveCount(0);
    await expectNoHorizontalOverflow(page);
  });

  test('TransactionsIntl en 375px renderiza cards sin overflow horizontal', async ({ page }) => {
    await mockAuthenticatedSession(page);
    await mockTransactionsIntlPage(page);

    await page.goto('/transactions-intl');

    await expect(page.getByText(/Compra internacional de prueba/i)).toBeVisible();
    await expect(page.locator('table')).toHaveCount(0);
    await expectNoHorizontalOverflow(page);
  });

  test('Checking, Installments y Projected son usables en 375px sin tablas anchas', async ({ page }) => {
    await mockAuthenticatedSession(page);
    await mockCheckingPage(page);
    await mockInstallmentsPage(page);
    await mockProjectedPage(page);

    await page.goto('/checking');
    await expect(page.getByRole('heading', { name: /Cuenta Corriente/i })).toBeVisible();
    await expect(page.locator('table')).toHaveCount(0);
    await expectNoHorizontalOverflow(page);

    await page.goto('/installments');
    await expect(page.getByRole('heading', { name: /Compras en Cuotas/i })).toBeVisible();
    await expect(page.locator('table')).toHaveCount(0);
    await expectNoHorizontalOverflow(page);

    await page.goto('/projected-transactions');
    await expect(page.getByRole('heading', { name: /Transacciones Proyectadas/i })).toBeVisible();
    await expect(page.locator('table')).toHaveCount(0);
    await expectNoHorizontalOverflow(page);
  });

  test('Dashboard y FinancialHealth apilan secciones y mantienen gráficos visibles en 375px', async ({ page }) => {
    await mockAuthenticatedSession(page);
    await mockDashboardPage(page);
    await mockFinancialHealthPage(page);

    await page.goto('/');
    await expect(page.getByRole('heading', { name: /Dashboard/i })).toBeVisible();
    await expectNoHorizontalOverflow(page);

    await page.goto('/financial-health');
    await expect(page.getByRole('heading', { name: /Salud Financiera/i })).toBeVisible();
    await expect(page.locator('.recharts-responsive-container').first()).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test('drawer mobile abre y cierra desde hamburguesa en 375px', async ({ page }) => {
    await mockAuthenticatedSession(page);
    await mockDashboardPage(page);

    await page.goto('/');

    await page.getByLabel(/toggle drawer/i).click();
    const transactionsMenuItem = page.getByRole('button', { name: /^Transacciones No Facturadas \(TC\)$/i });
    await expect(transactionsMenuItem).toBeVisible();

    await transactionsMenuItem.click();
    await expect(page).toHaveURL(/\/transactions/);
    await expect(transactionsMenuItem).toHaveCount(0);
  });
});
