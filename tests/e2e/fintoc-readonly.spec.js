const { test, expect } = require('@playwright/test');
const { installDashboardFixtures, clp } = require('./helpers/expenseFixtures');

const ready = { provider: 'fintoc', state: 'ready', mode: 'test', readOnly: true, writesEnabled: false };
const preview = {
  provider: 'fintoc', mode: 'test', readOnly: true, imported: false,
  period: { year: 2026, month: 10, since: '2026-10-01', until: '2026-10-31' },
  account: { name: 'Cuenta corriente', currency: 'CLP', numberLast4: '1234' },
  queriedAt: '2026-10-31T20:00:00.000Z', bankUpdatedAt: null,
  items: [
    { externalId: 'mov_fictional_a', date: '2026-10-03', description: 'Cargo ficticio de Fintoc con descripción extensa para comprobar lectura completa en una pantalla móvil', type: 'cargo', amount: '12500', status: 'confirmed' },
    { externalId: 'mov_fictional_b', date: '2026-10-04', description: 'Abono ficticio de Fintoc', type: 'abono', amount: '1000000', status: 'confirmed' },
  ], total: 2, coverage: { complete: true, excludedNonConfirmed: 0 },
};

async function fixtures(page, options = {}) {
  const state = await installDashboardFixtures(page);
  state.fintocRequests = [];
  if (options.shared) {
    await page.addInitScript(() => localStorage.setItem('activeSpaceOwner::fixture-user', 'shared-fixture-owner'));
    await page.route('**/api/space/memberships', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ spaces: [
      { ownerId: 'fixture-user', ownerName: 'Mi espacio', isOwner: true, canEdit: true, canDelete: true },
      { ownerId: 'shared-fixture-owner', ownerName: 'Hogar compartido', isOwner: false, canEdit: true, canDelete: true },
    ] }) }));
  }
  await page.route('**/api/categories', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ id: '1', name: 'Cuentas', tipo: 'gasto' }]) }));
  await page.route('**/api/checking**', async route => {
    const request = route.request(), url = new URL(request.url());
    if (request.method() !== 'GET') {
      state.writes.push(`${request.method()} ${url.pathname}`);
      return route.abort();
    }
    const json = (data, status = 200) => route.fulfill({ status, contentType: 'application/json', headers: { 'Cache-Control': 'no-store' }, body: JSON.stringify(data) });
    if (url.pathname.startsWith('/api/checking/fintoc/')) {
      state.fintocRequests.push({ path: url.pathname, params: Object.fromEntries(url.searchParams) });
      if (url.pathname.endsWith('/status')) return json(options.status || ready);
      if (url.pathname.endsWith('/preview')) {
        if (options.fail) return json({ code: 'FINTOC_UPSTREAM_ERROR', error: 'sk_live_NEVER_DISPLAY_THIS_RAW_PROVIDER_ERROR' }, 502);
        return json(preview);
      }
    }
    if (url.pathname === '/api/checking/global-balance') return json({ saldo_actual: 650000 });
    if (url.pathname === '/api/checking') return json({ items: [{ id: 'existing-fictional', fecha: '2026-10-01', descripcion: 'Gasto ficticio ya clasificado', tipo: 'cargo', amount: 7500, category_id: '1', notas: 'Conservar clasificación' }], total: 1 });
    state.unexpected.push(`${request.method()} ${url.pathname}`);
    return route.abort();
  });
  return state;
}

const panel = page => page.getByRole('region', { name: 'Conexión Fintoc' });
const consult = page => panel(page).getByRole('button', { name: 'Consultar movimientos con Fintoc', exact: true });

test.describe('Epic17 — Fintoc de solo lectura', () => {
  test('FRO-01 conexión pendiente no consulta el proveedor ni altera la cartola', async ({ page }) => {
    const state = await fixtures(page, { status: { ...ready, state: 'disabled', mode: null } });
    await page.goto('/checking');
    await expect(panel(page)).toBeVisible();
    await expect(panel(page)).toContainText('Conexión pendiente');
    await expect(consult(page)).toHaveCount(0);
    expect(state.fintocRequests.filter(r => r.path.endsWith('/preview'))).toHaveLength(0);
    await expect(page.getByText('Gasto ficticio ya clasificado', { exact: true })).toBeVisible();
    state.verify();
  });

  test('FRO-06/08/09 consulta explícita muestra pesos exactos y datos de prueba separados', async ({ page }) => {
    const state = await fixtures(page);
    await page.goto('/checking');
    await expect(consult(page)).toBeEnabled();
    expect(state.fintocRequests.filter(r => r.path.endsWith('/preview'))).toHaveLength(0);
    await consult(page).click();
    const movements = panel(page).getByTestId('fintoc-movements');
    await expect(movements).toContainText(preview.items[0].description);
    await expect(movements).toContainText(clp(12500));
    await expect(movements).toContainText(clp(1000000));
    await expect(panel(page)).toContainText('Modo de prueba');
    await expect(panel(page)).toContainText(/sin fecha|no informad|no disponible/i);
    await expect(page.getByText('Gasto ficticio ya clasificado', { exact: true })).toBeVisible();
    await expect(page.getByText('Conservar clasificación', { exact: true })).toBeVisible();
    expect(state.fintocRequests.filter(r => r.path.endsWith('/preview'))).toEqual([{ path: '/api/checking/fintoc/preview', params: { year: '2026', month: '10' } }]);
    const storage = await page.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } }));
    expect(storage).not.toContain(preview.items[0].description);
    expect(storage).not.toContain('mov_fictional');
    state.verify();
  });

  test('FRO-10 no expone errores crudos ni convierte un fallo en movimientos', async ({ page }) => {
    const state = await fixtures(page, { fail: true });
    await page.goto('/checking');
    await consult(page).click();
    await expect(panel(page).getByRole('alert')).toBeVisible();
    await expect(panel(page)).not.toContainText('sk_live_NEVER_DISPLAY');
    await expect(panel(page).getByTestId('fintoc-movements')).toHaveCount(0);
    await expect(consult(page)).toBeEnabled();
    state.verify();
  });

  test('FRO-03 un miembro con permisos de edición no consulta esta conexión', async ({ page }) => {
    const state = await fixtures(page, { shared: true });
    await page.goto('/checking');
    await expect(page.getByTestId('space-switcher')).toContainText('Hogar compartido');
    await expect(page.getByText('Gasto ficticio ya clasificado', { exact: true })).toBeVisible();
    await expect(panel(page)).toHaveCount(0);
    expect(state.fintocRequests).toHaveLength(0);
    state.verify();
  });

  test('FRO-11 cambiar mes elimina la previsualización y requiere otra consulta explícita', async ({ page }) => {
    const state = await fixtures(page);
    await page.goto('/checking');
    await consult(page).click();
    await expect(panel(page).getByTestId('fintoc-movements')).toBeVisible();
    await page.getByRole('combobox', { name: 'Mes', exact: true }).click();
    await page.getByRole('option', { name: 'septiembre', exact: true }).click();
    await expect(panel(page).getByTestId('fintoc-movements')).toHaveCount(0);
    expect(state.fintocRequests.filter(r => r.path.endsWith('/preview'))).toHaveLength(1);
    state.verify();
  });

  test('FRO-11 lectura a320px sin scroll lateral en claro y oscuro', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'dashboard-mobile', 'Geometría específica de teléfono pequeño.');
    await page.setViewportSize({ width: 320, height: 812 });
    const state = await fixtures(page);
    await page.goto('/checking');
    await consult(page).click();
    await expect(panel(page).getByTestId('fintoc-movements')).toBeVisible();
    for (const mode of ['Oscuro', 'Claro']) {
      await page.getByRole('button', { name: 'Apariencia', exact: true }).click();
      await page.getByRole('menuitemradio', { name: mode, exact: true }).click();
      expect(await panel(page).evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
      const overflow = await panel(page).evaluate(element => Array.from(element.querySelectorAll('*')).filter(child => {
        const rect = child.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && child.scrollWidth > child.clientWidth + 1 && ['auto', 'scroll'].includes(getComputedStyle(child).overflowX);
      }).map(child => child.tagName));
      expect(overflow).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(321);
    }
    state.verify();
  });
});
