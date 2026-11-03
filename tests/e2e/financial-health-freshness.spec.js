const { test, expect } = require('@playwright/test');
const { installDashboardFixtures } = require('./helpers/expenseFixtures');
const json = (route, data, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
const snapshot = (amount = '765432', patch = {}) => ({ source: 'fintoc', provider: 'fintoc', currency: 'CLP', amount, available: amount, current: amount,
  state: amount === null ? 'unavailable' : 'available', freshness: amount === null ? 'unknown' : 'current',
  bankUpdatedAt: amount === null ? null : '2026-11-02T09:51:26.000Z', queriedAt: amount === null ? null : '2026-11-02T10:00:01.000Z', reason: null, ...patch });
function health(bank) {
  const known = bank.state === 'available' && bank.amount !== null;
  const partial = !known || bank.freshness !== 'current';
  const source = { state: 'available', freshness: 'current', asOf: '2026-11-02T20:00:00.000Z', errorCode: null };
  return { generatedAt: '2026-11-02T20:01:00.000Z', currentDate: '2026-11-02', targetMonth: { year: 2026, month: 11, name: 'Noviembre 2026' },
    checking: { ...bank, currentBalance: known ? Number(bank.amount) : null, lastUpdated: bank.bankUpdatedAt },
    creditCards: { combined: 200000, visa: { total: 120000, unbilled: 100000, installments: 20000, international: 0, payments: 0 }, mastercard: { total: 80000, unbilled: 80000, installments: 0, international: 0, payments: 0 } },
    projected: { income: 1000000, expenses: 100000, details: { income: [{ name: 'Ingreso ficticio', amount: 1000000, fecha: '2026-11-15' }], expenses: [{ name: 'Recurrente ficticio virtual', amount: 100000, fecha: '2026-11-10', virtual: true }] } },
    summary: { totalCommitments: 300000, projectedBalance: known ? Number(bank.amount) + 700000 : null, healthScore: partial ? null : 90, healthStatus: partial ? 'unknown' : 'excellent', conversionPendingCount: 0, amountsPartial: partial, partialReasons: partial ? [known ? 'CHECKING_STALE' : 'CHECKING_UNAVAILABLE'] : [] },
    sources: { checking: { ...bank, asOf: bank.bankUpdatedAt, errorCode: bank.reason }, national: source, international: source, installments: source, projected: source }, alerts: [] };
}
async function setup(page, options = {}) {
  const state = await installDashboardFixtures(page, { period: '2026-11' });
  state.bank = snapshot(options.amount === undefined ? '765432' : options.amount, options.bankPatch); state.healthReads = 0; state.bankReads = 0; state.fail = false;
  if (options.readonly) await page.addInitScript(() => localStorage.setItem('activeSpaceOwner::fixture-user', 'fixture-owner'));
  await page.route('**/api/**', async route => {
    const request = route.request(), url = new URL(request.url());
    if (request.method() !== 'GET') { state.writes.push(request.method() + ' ' + url.pathname); return route.abort(); }
    if (url.pathname === '/api/space/memberships' && options.readonly) return json(route, { spaces: [
      { ownerId: 'fixture-user', ownerName: 'Propio ficticio', isOwner: true, canEdit: true, canDelete: true },
      { ownerId: 'fixture-owner', ownerName: 'Hogar ficticio', isOwner: false, canEdit: false, canDelete: false },
    ] });
    if (url.pathname === '/api/financial-health/summary') { state.healthReads++; if (state.fail) return route.abort(); return json(route, health(state.bank)); }
    if (url.pathname === '/api/dashboard/overview') return json(route, { period: { year: 2026, month: 11 }, disponibleHoy: state.bank.amount === null ? null : Number(state.bank.amount), checking: state.bank, compromisos: { total: 300000, conversionPendingCount: 0 }, topCategorias: [] });
    if (url.pathname === '/api/checking/fintoc/bank-balance') { state.bankReads++; return json(route, state.bank); }
    const responses = { '/api/categories': [], '/api/cards': [], '/api/checking': { items: [], total: 0 },
      '/api/checking/global-balance': { ...state.bank, saldo_actual: state.bank.amount === null ? null : Number(state.bank.amount) },
      '/api/checking/fintoc/status': { provider: 'fintoc', state: 'disabled', readOnly: true, writesEnabled: false },
      '/api/checking/fintoc/daily-status': { provider: 'fintoc', enabled: true, initialized: true, schedule: '07:00', timezone: 'America/Santiago', state: 'current', pendingReviewCount: 0 } };
    if (Object.prototype.hasOwnProperty.call(responses, url.pathname)) return json(route, responses[url.pathname]);
    return route.fallback();
  });
  return state;
}
async function noOverflow(page) { const geometry = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth })); expect(geometry.scroll).toBeLessThanOrEqual(geometry.width); }
test('un único saldo bancario coincide en Salud, Dashboard y Cuenta corriente', async ({ page }) => {
  const state = await setup(page);
  for (const path of ['/financial-health', '/', '/checking']) {
    await page.goto(path); await expect(page.getByText('$765.432', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Saldo calculado', { exact: true })).toHaveCount(0);
    await noOverflow(page);
  }
  expect(state.healthReads).toBeGreaterThan(0); expect(state.bankReads).toBeGreaterThan(0); state.verify();
});
test('Salud se actualiza al regresar al primer plano y con eventos de datos sin llamar al banco', async ({ page }) => {
  const state = await setup(page); await page.goto('/financial-health');
  await expect(page.getByText('$765.432', { exact: true })).toBeVisible();
  state.bank = snapshot('865432'); await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.getByText('$865.432', { exact: true })).toBeVisible();
  state.bank = snapshot('965432'); await page.evaluate(() => window.dispatchEvent(new Event('financialDataChanged')));
  await expect(page.getByText('$965.432', { exact: true })).toBeVisible();
  expect(state.healthReads).toBeGreaterThanOrEqual(3); expect(state.bankReads).toBe(0); state.verify();
});
test('saldo ausente no se convierte en cero ni evaluación saludable', async ({ page }) => {
  const state = await setup(page, { amount: null }); await page.goto('/financial-health');
  await expect(page.getByText(/Saldo disponible bancario/i)).toBeVisible();
  await expect(page.getByText(/Evaluación parcial|Sin datos verificados|No disponible/i).first()).toBeVisible();
  await expect(page.getByText('Excelente', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Proyección fin de mes', { exact: true })).toHaveCount(0); await noOverflow(page); state.verify();
});
test('un cero confirmado por el banco sigue siendo un saldo válido', async ({ page }) => {
  const state = await setup(page, { amount: '0' }); await page.goto('/financial-health');
  await expect(page.getByRole('region', { name: 'Saldo disponible bancario', exact: true }).getByText('$0', { exact: true })).toBeVisible();
  await expect(page.getByText('Saldo bancario no disponible', { exact: true })).toHaveCount(0); await noOverflow(page); state.verify();
});
test('saldo atrasado conserva fecha real y advierte evaluación parcial', async ({ page }) => {
  const state = await setup(page, { bankPatch: { freshness: 'stale', bankUpdatedAt: '2026-10-30T10:00:00.000Z' } }); await page.goto('/financial-health');
  await expect(page.getByText('$765.432', { exact: true })).toBeVisible();
  await expect(page.getByText(/Evaluación parcial/i)).toBeVisible();
  await expect(page.getByRole('alert').filter({ hasText: /saldo bancario tiene más de 24 horas/i })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Vigencia de los datos' })).toContainText('30-10-2026');
  await noOverflow(page); state.verify();
});
test('recurrentes virtuales y período de pago quedan visibles para un miembro lector', async ({ page }) => {
  const state = await setup(page, { readonly: true }); await page.goto('/financial-health');
  await expect(page.getByText('Recurrente ficticio virtual', { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/Compromisos a pagar en noviembre/i)).toBeVisible();
  await page.getByRole('button', { name: 'Actualizar salud financiera', exact: true }).click();
  await expect.poll(() => state.healthReads).toBeGreaterThanOrEqual(2);
  await expect(page.getByTestId('space-switcher')).toContainText('Hogar de Hogar ficticio'); await noOverflow(page); state.verify();
});
test('modo oscuro y copia guardada identifican la falta de actualización', async ({ page }) => {
  const state = await setup(page); await page.goto('/financial-health'); await expect(page.getByText('$765.432', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Apariencia', exact: true }).click(); await page.getByRole('menuitemradio', { name: 'Oscuro', exact: true }).click();
  state.fail = true; await page.getByRole('button', { name: 'Actualizar salud financiera', exact: true }).click();
  await expect(page.getByText(/Datos guardados del|No se pudo actualizar|No pudimos actualizar/i).first()).toBeVisible();
  await expect(page.getByText('$765.432', { exact: true })).toBeVisible(); await expect(page.locator('html')).toHaveAttribute('data-appearance', 'dark'); await noOverflow(page); state.verify();
});
