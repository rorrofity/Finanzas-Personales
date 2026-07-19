// @ts-check
const { test, expect } = require('@playwright/test');

/**
 * Epic 12 Fase 3 — Req 12.10/12.11: las páginas de transacciones muestran
 * los totales como una fila de stat-cards compactas (3 en una fila, incluso
 * en 375px) en lugar de 3 cards gigantes apiladas.
 */

async function mockAuth(page) {
  await page.addInitScript(() => {
    window.localStorage.setItem('token', 'fake-jwt-token');
    window.sessionStorage.setItem('period', '2026-08');
  });
  await page.route('**/api/auth/profile', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ user: { id: 'u-1', nombre: 'Test', email: 't@t.cl' } }) })
  );
  await page.route('**/api/suspicious/count', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ count: 0 }) })
  );
  await page.route('**/api/space/**', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ spaces: [], members: [] }) })
  );
  await page.route('**/api/categories**', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
  );
  await page.route('**/api/cards**', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
  );
}

/** Los N stat-cards de totales comparten la misma fila (mismo top). */
async function totalsInOneRow(page, testId) {
  return page.evaluate((tid) => {
    const cards = Array.from(document.querySelectorAll(`[data-testid="${tid}"] > *`));
    if (cards.length < 2) return false;
    const tops = cards.map((c) => Math.round(c.getBoundingClientRect().top));
    return tops.every((t) => Math.abs(t - tops[0]) < 4);
  }, testId);
}

test.describe('Totales compactos (Req 12.10)', () => {
  test.beforeEach(async ({}, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-375', 'Solo mobile.');
  });

  test('Transactions: totales en una fila y sin overflow', async ({ page }, testInfo) => {
    await mockAuth(page);
    await page.route('**/api/transactions**', (r) =>
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
    );
    await page.goto('/transactions');
    await expect(page.getByText(/Total Gastos/i).first()).toBeVisible();
    expect(await totalsInOneRow(page, 'totals-row')).toBe(true);
    await expect
      .poll(async () => page.evaluate(() => document.documentElement.scrollWidth))
      .toBeLessThanOrEqual(testInfo.project.use.viewport.width + 1);
  });

  test('Checking: totales en una fila y sin overflow', async ({ page }, testInfo) => {
    await mockAuth(page);
    await page.route('**/api/checking/balance**', (r) =>
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ balance: 1000000 }) })
    );
    await page.route('**/api/checking**', (r) =>
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
    );
    await page.goto('/checking');
    await expect(page.getByText(/Saldo Actual/i).first()).toBeVisible();
    expect(await totalsInOneRow(page, 'totals-row')).toBe(true);
    await expect
      .poll(async () => page.evaluate(() => document.documentElement.scrollWidth))
      .toBeLessThanOrEqual(testInfo.project.use.viewport.width + 1);
  });

  test('ProjectedTransactions: totales en una fila y sin overflow', async ({ page }, testInfo) => {
    await mockAuth(page);
    await page.route('**/api/projected**', (r) =>
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
    );
    await page.goto('/projected-transactions');
    await expect(page.getByText(/Saldo Proyectado/i).first()).toBeVisible();
    expect(await totalsInOneRow(page, 'totals-row')).toBe(true);
    await expect
      .poll(async () => page.evaluate(() => document.documentElement.scrollWidth))
      .toBeLessThanOrEqual(testInfo.project.use.viewport.width + 1);
  });

  test('TransactionsIntl: totales en una fila y sin overflow', async ({ page }, testInfo) => {
    await mockAuth(page);
    await page.route('**/api/intl-unbilled**', (r) =>
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
    );
    await page.goto('/transactions-intl');
    await expect(page.getByText(/Total Gastos/i).first()).toBeVisible();
    expect(await totalsInOneRow(page, 'totals-row')).toBe(true);
    await expect
      .poll(async () => page.evaluate(() => document.documentElement.scrollWidth))
      .toBeLessThanOrEqual(testInfo.project.use.viewport.width + 1);
  });
});
