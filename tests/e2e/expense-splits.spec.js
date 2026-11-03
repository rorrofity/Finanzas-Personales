const { test, expect } = require('@playwright/test');
const { installDashboardFixtures } = require('./helpers/expenseFixtures');
const entries = [
  { path: '/transactions', api: '/api/transactions', source: 'tc_nacional' },
  { path: '/transactions-intl', api: '/api/intl-unbilled', source: 'tc_internacional' },
  { path: '/checking', api: '/api/checking', source: 'cuenta_corriente' },
];
const id = '11111111-1111-4111-8111-111111111110';
const categories = [{ id: 7, name: 'Calzado ficticio' }, { id: 8, name: 'Ropa ficticia' }];
const initialSplit = { version: '22222222-2222-4222-8222-222222222222', total_clp: '180000.00', parts: [
  { amount_clp: '100000.00', category_id: 7, category_name: 'Calzado ficticio' },
  { amount_clp: '80000.00', category_id: null, category_name: null },
] };
const json = (route, data, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
async function setup(page, entry, { partial = false, readonly = false, fail = false } = {}) {
  const state = await installDashboardFixtures(page, { period: '2026-11' });
  const row = { id, fecha: '2026-11-01', descripcion: 'Salomon ficticio', tipo: entry.source === 'cuenta_corriente' ? 'cargo' : 'gasto',
    category_id: partial ? 8 : null, category_name: partial ? 'Ropa ficticia' : null, monto: '180000.00', amount: '180000.00',
    amount_clp: '180000.00', amount_usd: '200.00', exchange_rate: '900.0000', network: 'visa', brand: 'visa', provider: 'banco_chile',
    year: 2026, month: 11, billing_year: 2026, billing_month: 11, period_year: 2026, period_month: 11, cuotas: 1, split: partial ? initialSplit : null };
  state.row = row; state.original = JSON.stringify({ ...row, split: undefined }); state.splitWrites = []; state.revision = 0;
  const endpoint = '/api/expense-splits/' + entry.source + '/' + id;
  if (readonly) await page.addInitScript(() => localStorage.setItem('activeSpaceOwner::fixture-user', 'fixture-owner'));
  await page.route('**/api/**', async route => {
    const request = route.request(), url = new URL(request.url()), path = url.pathname;
    if (path === '/api/space/memberships' && readonly) return json(route, { spaces: [
      { ownerId: 'fixture-user', ownerName: 'Propio ficticio', isOwner: true, canEdit: true, canDelete: true },
      { ownerId: 'fixture-owner', ownerName: 'Hogar ficticio', isOwner: false, canEdit: false, canDelete: false },
    ] });
    if (path === endpoint) {
      if (request.method() !== 'GET') {
        const body = request.postDataJSON(); state.splitWrites.push({ method: request.method(), body });
        if (readonly) throw new Error('Readonly attempted split write');
        if (fail) return json(route, { code: 'EXPENSE_SPLIT_CONFLICT', error: 'Conflicto ficticio' }, 409);
        expect(body.expectedVersion).toBe(row.split?.version || 0);
        if (request.method() === 'DELETE') row.split = null;
        else {
          expect(request.method()).toBe('PUT');
          expect(body.parts.reduce((sum, part) => sum + Math.round(Number(part.amount_clp) * 100), 0)).toBe(18000000);
          state.revision++;
          row.split = { version: '33333333-3333-4333-8333-' + String(state.revision).padStart(12, '0'), total_clp: '180000.00',
            parts: body.parts.map(part => ({ ...part, category_name: categories.find(cat => cat.id === part.category_id)?.name || null })) };
        }
      }
      return json(route, { source: entry.source, id, currency: 'CLP', total_clp: '180000.00', split: row.split });
    }
    const responses = {
      [entry.api]: entry.source === 'cuenta_corriente' ? { items: [row], total: 1 } : [row],
      '/api/categories': categories, '/api/cards': [],
      '/api/checking/global-balance': { saldo_actual: 500000 },
      '/api/checking/fintoc/status': { provider: 'fintoc', state: 'disabled', readOnly: true, writesEnabled: false },
      '/api/checking/fintoc/bank-balance': { provider: 'fintoc', currency: 'CLP', state: 'available', available: '500000', current: '500000', freshness: 'current' },
      '/api/checking/fintoc/daily-status': { provider: 'fintoc', enabled: true, initialized: true, schedule: '07:00', timezone: 'America/Santiago', state: 'current', pendingReviewCount: 0 },
    };
    if (Object.prototype.hasOwnProperty.call(responses, path)) {
      if (request.method() !== 'GET') { state.writes.push(request.method() + ' ' + path); return route.abort(); }
      return json(route, responses[path]);
    }
    return route.fallback();
  });
  state.assertPreserved = () => expect(JSON.stringify({ ...row, split: undefined })).toBe(state.original);
  return state;
}
async function category(dialog, index, name) {
  await dialog.getByRole('combobox', { name: 'Categoría, parte ' + index, exact: true }).click();
  await dialog.page().getByRole('option', { name, exact: true }).click();
}
async function noOverflow(page) {
  const geometry = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
  expect(geometry.scroll).toBeLessThanOrEqual(geometry.width);
}
for (const entry of entries) {
  test(`dividir, arrastrar, categorizar y deshacer ${entry.source} preserva el cargo`, async ({ page }, testInfo) => {
    const state = await setup(page, entry); await page.goto(entry.path);
    await page.getByRole('button', { name: 'Dividir gasto', exact: true }).click();
    let dialog = page.getByRole('dialog', { name: 'Dividir gasto', exact: true });
    await expect(dialog.getByRole('spinbutton', { name: 'Monto CLP, parte 1', exact: true })).toBeVisible();
    await expect(dialog.getByLabel(/Para quién/)).toHaveCount(0);
    await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click(); expect(state.splitWrites).toHaveLength(0);
    await page.getByRole('button', { name: 'Dividir gasto', exact: true }).click();
    dialog = page.getByRole('dialog', { name: 'Dividir gasto', exact: true });
    const first = dialog.getByRole('spinbutton', { name: 'Monto CLP, parte 1', exact: true });
    await expect(first).toHaveValue('90000');
    await first.fill('100000');
    await expect(dialog.getByRole('spinbutton', { name: 'Monto CLP, parte 2', exact: true })).toHaveValue('80000');
    const slider = dialog.getByRole('slider').first();
    const trackBounds = await dialog.getByRole('img', { name: 'Reparto del total', exact: true }).boundingBox();
    // MUI animates a typed value before dragging: wait for its actual hit target,
    // and also verify the divider visually represents the exact entered share.
    await expect.poll(async () => {
      const thumb = await slider.locator('..').boundingBox();
      return Math.abs((thumb.x + thumb.width / 2 - trackBounds.x) / trackBounds.width - 100000 / 180000);
    }).toBeLessThan(0.003);
    const bounds = await slider.locator('..').boundingBox();
    await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2); await page.mouse.down();
    await page.mouse.move(bounds.x + bounds.width / 2 + 24, bounds.y + bounds.height / 2, { steps: 8 });
    expect(Number(await first.inputValue())).toBeGreaterThan(100000); await page.mouse.up();
    await dialog.getByRole('button', { name: 'Agregar parte', exact: true }).click();
    await expect(dialog.getByRole('spinbutton')).toHaveCount(3);
    await dialog.getByRole('button', { name: 'Partes iguales', exact: true }).click();
    for (let index = 1; index <= 3; index++) {
      await expect(dialog.getByRole('spinbutton', { name: 'Monto CLP, parte ' + index, exact: true })).toHaveValue('60000');
      await category(dialog, index, index === 2 ? 'Ropa ficticia' : 'Calzado ficticio');
    }
    await noOverflow(page);
    if (process.env.EXPENSE_SPLIT_QA_DIR) {
      const fs = require('fs'), path = require('path'); fs.mkdirSync(process.env.EXPENSE_SPLIT_QA_DIR, { recursive: true });
      await page.screenshot({ path: path.join(process.env.EXPENSE_SPLIT_QA_DIR, testInfo.project.name + '-' + entry.source + '-light.png'), fullPage: true });
    }
    await dialog.getByRole('button', { name: 'Confirmar división', exact: true }).click();
    await expect(dialog).toBeHidden(); expect(state.splitWrites).toHaveLength(1); state.assertPreserved();
    await expect(page.getByRole('button', { name: 'Sin categoría (0)', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Editar división', exact: true }).click();
    dialog = page.getByRole('dialog', { name: 'Editar división', exact: true });
    await expect(dialog.getByRole('spinbutton')).toHaveCount(3);
    await dialog.getByRole('button', { name: 'Deshacer división', exact: true }).click();
    await dialog.getByRole('button', { name: 'Confirmar deshacer', exact: true }).click();
    await expect(dialog).toBeHidden(); expect(state.splitWrites).toHaveLength(2); state.assertPreserved();
    await expect(page.getByRole('button', { name: 'Sin categoría (1)', exact: true })).toBeVisible();
    await noOverflow(page); state.verify();
  });
  test(`pendiente parcial ${entry.source} filtra partes y conserva el total`, async ({ page }) => {
    const state = await setup(page, entry, { partial: true }); await page.goto(entry.path);
    await page.getByRole('button', { name: 'Sin categoría (1)', exact: true }).click();
    await expect(page.getByText('Salomon ficticio', { exact: true })).toBeVisible();
    await expect(page.getByText('Sin categoría: $80.000', { exact: true })).toBeVisible();
    await noOverflow(page); expect(state.splitWrites).toHaveLength(0); state.assertPreserved(); state.verify();
  });
}
test('miembro de solo lectura consulta el desglose sin poder editarlo', async ({ page }) => {
  const state = await setup(page, entries[0], { partial: true, readonly: true }); await page.goto('/transactions');
  await expect(page.getByRole('button', { name: 'Editar división', exact: true })).toBeDisabled();
  await expect(page.getByText('Sin categoría: $80.000', { exact: true })).toBeVisible();
  expect(state.splitWrites).toHaveLength(0); state.assertPreserved(); state.verify();
});
test('conflicto conserva borrador y exige recargar antes de sobrescribir', async ({ page }) => {
  const state = await setup(page, entries[0], { fail: true }); await page.goto('/transactions');
  await page.getByRole('button', { name: 'Dividir gasto', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Dividir gasto', exact: true });
  await dialog.getByRole('spinbutton', { name: 'Monto CLP, parte 1', exact: true }).fill('100000');
  await dialog.getByRole('button', { name: 'Confirmar división', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Recargar división', exact: true })).toBeVisible();
  await expect(dialog.getByRole('spinbutton', { name: 'Monto CLP, parte 1', exact: true })).toHaveValue('100000');
  await expect(dialog.getByRole('button', { name: 'Confirmar división', exact: true })).toBeDisabled();
  state.assertPreserved(); expect(state.row.split).toBeNull(); state.verify();
});
test('reparto oscuro admite ajuste con teclado y tacto sin guardar al cancelar', async ({ page }, testInfo) => {
  const state = await setup(page, entries[2]); await page.goto('/checking');
  await page.getByRole('button', { name: 'Apariencia', exact: true }).click();
  await page.getByRole('menuitemradio', { name: 'Oscuro', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-appearance', 'dark');
  await page.getByRole('button', { name: 'Dividir gasto', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Dividir gasto', exact: true });
  const first = dialog.getByRole('spinbutton', { name: 'Monto CLP, parte 1', exact: true });
  await expect(first).toHaveValue('90000');
  const slider = dialog.getByRole('slider').first(); await slider.focus(); await slider.press('ArrowRight');
  await expect(first).toHaveValue('90000.01');
  if (testInfo.project.name !== 'dashboard-desktop') {
    const track = await dialog.getByRole('img', { name: 'Reparto del total', exact: true }).boundingBox();
    await page.touchscreen.tap(track.x + track.width * .75, track.y + track.height / 2);
    expect(Number(await first.inputValue())).toBeGreaterThan(130000);
  }
  await noOverflow(page);
  if (process.env.EXPENSE_SPLIT_QA_DIR) {
    const fs = require('fs'), path = require('path'); fs.mkdirSync(process.env.EXPENSE_SPLIT_QA_DIR, { recursive: true });
    await page.screenshot({ path: path.join(process.env.EXPENSE_SPLIT_QA_DIR, testInfo.project.name + '-checking-dark.png'), fullPage: true });
  }
  await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click();
  expect(state.splitWrites).toHaveLength(0); state.assertPreserved(); state.verify();
});
