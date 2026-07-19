// @ts-check
const { test, expect } = require('@playwright/test');

/**
 * Epic 12 Fase 2 — Dashboard rediseñado (Reqs 12.2–12.7, 12.11).
 */

async function mockAuthenticatedSession(page) {
  await page.addInitScript(() => {
    window.localStorage.setItem('token', 'fake-jwt-token');
    window.sessionStorage.setItem('period', '2026-08');
  });
  await page.route('**/api/auth/profile', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ user: { id: 'u-1', nombre: 'Usuario Test', email: 't@t.cl' } }) })
  );
  await page.route('**/api/suspicious/count', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ count: 0 }) })
  );
  await page.route('**/api/space/**', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ spaces: [], members: [] }) })
  );
}

const OVERVIEW = {
  period: { year: 2026, month: 8 },
  balance: { value: 520000, deltaPct: 12 },
  gastos: { value: 1800000, deltaPct: -5 },
  ingresos: { value: 2320000, deltaPct: 3 },
  tasaAhorro: 0.22,
  burnRate: { dailyAvg: 58000, projectedClose: 1950000 },
  disponibleHoy: 1031242,
  compromisos: { total: 2100000, tcNoFacturado: 1200000, cuotas: 600000, intl: 0, proyectados: 300000 },
  topCategorias: [
    { name: 'Cuentas', total: 700000, pct: 0.38, deltaPct: 4 },
    { name: 'Compras casa', total: 400000, pct: 0.22, deltaPct: -10 },
  ],
};

async function mockDashboard(page, overview = OVERVIEW) {
  await page.route('**/api/dashboard/overview**', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(overview) })
  );
  await page.route('**/api/dashboard/monthly-history**', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([
      { year: 2026, month: 8, monthName: 'Ago', label: 'Ago 2026', gastosTC: 1000000, gastosCC: 800000, ingresosCC: 2320000, balance: 520000 },
    ]) })
  );
  await page.route('**/api/dashboard/category-evolution**', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [{ label: 'Ago 2026', year: 2026, month: 8, Cuentas: 700000 }], categories: ['Cuentas'] }) })
  );
  await page.route('**/api/dashboard/category-transactions**', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ count: 0, total: 0, transactions: [] }) })
  );
}

test.describe('Dashboard rediseñado (Epic 12)', () => {
  test('12.2 muestra stat-cards con valores del overview', async ({ page }) => {
    await mockAuthenticatedSession(page);
    await mockDashboard(page);
    await page.goto('/');

    await expect(page.getByText('Balance', { exact: true })).toBeVisible();
    await expect(page.getByText(/520\.000/)).toBeVisible();
    await expect(page.getByText('Disponible hoy')).toBeVisible();
    await expect(page.getByText(/1\.031\.242/)).toBeVisible();
    // Tasa de ahorro
    await expect(page.getByText('Ahorro')).toBeVisible();
  });

  test('12.3 compromisos próximos colapsado por defecto; expande con tap', async ({ page }) => {
    await mockAuthenticatedSession(page);
    await mockDashboard(page);
    await page.goto('/');

    const compromisos = page.getByText(/Compromisos próximos/i);
    await expect(compromisos).toBeVisible();
    // detalle oculto por defecto
    await expect(page.getByText(/TC no facturado/i)).toBeHidden();
    await compromisos.click();
    await expect(page.getByText(/TC no facturado/i)).toBeVisible();
  });

  test('12.4 top categorías como barras; tap abre el drill-down', async ({ page }) => {
    await mockAuthenticatedSession(page);
    await mockDashboard(page);
    await page.goto('/');

    await expect(page.getByText('Cuentas')).toBeVisible();
    await expect(page.getByText('38%')).toBeVisible();
    await page.getByText('Cuentas').click();
    // El drawer de detalle de categoría se abre (título h6 con la categoría)
    await expect(page.getByRole('heading', { name: 'Cuentas' })).toBeVisible();
  });

  test('12.5 tabs alternan los gráficos; solo uno visible', async ({ page }) => {
    await mockAuthenticatedSession(page);
    await mockDashboard(page);
    await page.goto('/');

    await expect(page.getByRole('tab', { name: /Evolución/i })).toBeVisible();
    await expect(page.getByRole('tab', { name: /categoría/i })).toBeVisible();
  });

  test('12.11 sin overflow horizontal en 375px', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-375', 'Solo mobile.');
    await mockAuthenticatedSession(page);
    await mockDashboard(page);
    await page.goto('/');
    await expect(page.getByText('Balance', { exact: true })).toBeVisible();
    await expect
      .poll(async () => page.evaluate(() => document.documentElement.scrollWidth))
      .toBeLessThanOrEqual(testInfo.project.use.viewport.width + 1);
  });

  test('12.6 período sin datos muestra CTA', async ({ page }) => {
    await mockAuthenticatedSession(page);
    await mockDashboard(page, {
      ...OVERVIEW,
      gastos: { value: 0, deltaPct: null },
      ingresos: { value: 0, deltaPct: null },
      balance: { value: 0, deltaPct: null },
      tasaAhorro: null,
      topCategorias: [],
      compromisos: { total: 0, tcNoFacturado: 0, cuotas: 0, intl: 0, proyectados: 0 },
    });
    await page.goto('/');
    await expect(page.getByText(/Importar o sincronizar/i)).toBeVisible();
  });
});
