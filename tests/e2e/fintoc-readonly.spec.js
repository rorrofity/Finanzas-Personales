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
const bankBalance = { provider: 'fintoc', currency: 'CLP', state: 'available', available: '1234567', current: '1200000',
  bankUpdatedAt: '2026-10-31T19:00:00.000Z', queriedAt: '2026-10-31T20:00:00.000Z', freshness: 'current' };
const dailyStatus = {
  provider: 'fintoc', enabled: true, schedule: '07:00', timezone: 'America/Santiago',
  state: 'needs_review', initialized: true, cutoverDate: '2026-10-31',
  lastSuccessAt: '2026-10-31T20:00:00.000Z', bankUpdatedAt: '2026-10-31T19:00:00.000Z',
  bankFreshness: 'current', coverage: { since: '2026-08-01', until: '2026-10-31', complete: true },
  pendingReviewCount: 23, importedTotal: 0,
  lastRun: { trigger: 'initial', status: 'success', inserted: 0, linked: 1, review: 23 }, lastErrorCode: null,
};
const reviewItems = Array.from({ length: 23 }, (_, index) => ({
  externalId: `mov_review_${index}`, date: '2026-10-03',
  description: `Pendiente ficticio ${index + 1} con descripción extensa para comprobar que el historial se lee completo en el teléfono`,
  type: index % 2 ? 'abono' : 'cargo', amount: index === 0 ? '12500' : String(1000 + index),
  status: 'confirmed', reason: index % 2 ? 'ambiguous_match' : 'initial_unmatched', candidateCount: index % 2 ? 2 : 0,
}));

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
      if (url.pathname.endsWith('/bank-balance')) {
        if (options.failBalance) return json({ error: 'sk_live_NEVER_DISPLAY_BALANCE_ERROR' }, 502);
        if (options.forbidBalance) return json({ error: 'PRIVATE' }, 403);
        return json(options.bankBalance || bankBalance);
      }
      if (url.pathname.endsWith('/status')) return json(options.status || ready);
      if (url.pathname.endsWith('/daily-status')) return json(options.dailyStatus || dailyStatus);
      if (url.pathname.endsWith('/review')) {
        if (options.failReview) return json({ code: 'FINTOC_DAILY_INTERNAL_ERROR', error: 'sk_live_NEVER_DISPLAY_REVIEW_ERROR' }, 500);
        const offset = Number(url.searchParams.get('offset') || 0);
        const limit = Number(url.searchParams.get('limit') || 20);
        return json({ items: reviewItems.slice(offset, offset + limit), total: reviewItems.length, limit, offset });
      }
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

  test('HRO-07 miembro consulta saldo y estado guardados sin consultar proveedor', async ({ page }) => {
    const state = await fixtures(page, { shared: true });
    await page.goto('/checking');
    await expect(page.getByTestId('space-switcher')).toContainText('Hogar compartido');
    await expect(page.getByText('Gasto ficticio ya clasificado', { exact: true })).toBeVisible();
    await expect(panel(page)).toHaveCount(0);
    await expect(page.getByText(clp(Number(bankBalance.available)), { exact: true })).toBeVisible();
    expect(state.fintocRequests.some(r=>r.path.endsWith('/bank-balance'))).toBe(true);
    expect(state.fintocRequests.some(r=>r.path.endsWith('/daily-status'))).toBe(true);
    expect(state.fintocRequests.some(r=>r.path.endsWith('/status')||r.path.endsWith('/preview'))).toBe(false);
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

test.describe('Epic18 — sincronización diaria de cuenta corriente', () => {
  const daily = page => page.getByRole('region', { name: 'Sincronización diaria Fintoc', exact: true });

  test('FDS-02/12 informa horario, fecha bancaria y alcance sin disparar consultas bancarias', async ({ page }) => {
    const state = await fixtures(page);
    await page.goto('/checking');
    await expect(daily(page)).toContainText('Todos los días a las 07:00 · America/Santiago');
    await expect(daily(page)).toContainText('Última consulta completa:');
    await expect(daily(page)).toContainText('Última actualización bancaria:');
    await expect(daily(page)).toContainText('Solo cuenta corriente; las tarjetas mantienen su sincronización actual.');
    await expect(daily(page)).toContainText('23 pendientes · 0 importados');
    expect(state.fintocRequests.filter(r => r.path.endsWith('/preview') || r.path.endsWith('/review'))).toHaveLength(0);
    state.verify();
  });

  test('FDS-04/14 muestra pendientes exactos y paginación sin modificar la cartola clasificada', async ({ page }) => {
    const state = await fixtures(page);
    await page.goto('/checking');
    await daily(page).getByRole('button', { name: 'Ver movimientos pendientes', exact: true }).click();
    const list = daily(page).getByRole('list', { name: 'Movimientos pendientes de revisión' });
    await expect(list.getByRole('listitem')).toHaveCount(20);
    await expect(list).toContainText(clp(12500));
    await expect(list).toContainText('Movimiento de la historia inicial sin una coincidencia inequívoca.');
    await daily(page).getByRole('button', { name: 'Ver más pendientes', exact: true }).click();
    await expect(list.getByRole('listitem')).toHaveCount(23);
    await expect(page.getByText('Gasto ficticio ya clasificado', { exact: true })).toBeVisible();
    await expect(page.getByText('Conservar clasificación', { exact: true })).toBeVisible();
    expect(state.fintocRequests.filter(r => r.path.endsWith('/review')).map(r => r.params)).toEqual([{ limit: '20', offset: '0' }, { limit: '20', offset: '20' }]);
    expect(state.fintocRequests.filter(r => r.path.endsWith('/preview'))).toHaveLength(0);
    state.verify();
  });

  test('FDS-12 consultar hoy no oculta una fecha bancaria desactualizada', async ({ page }) => {
    const state = await fixtures(page, { dailyStatus: { ...dailyStatus, state: 'stale', bankFreshness: 'stale', bankUpdatedAt: '2026-10-01T10:00:00.000Z' } });
    await page.goto('/checking');
    await expect(daily(page)).toContainText('Información bancaria desactualizada');
    await expect(daily(page).getByRole('alert')).toContainText('El banco no registra una actualización en las últimas 24 horas.');
    state.verify();
  });

  test('FDS-13 un fallo de revisión conserva los registros y oculta el error crudo', async ({ page }) => {
    const state = await fixtures(page, { failReview: true });
    await page.goto('/checking');
    await daily(page).getByRole('button', { name: 'Ver movimientos pendientes', exact: true }).click();
    await expect(daily(page).getByRole('alert')).toContainText('No se pudo consultar la lista de pendientes.');
    await expect(daily(page)).not.toContainText('sk_live_NEVER_DISPLAY');
    await expect(page.getByText('Conservar clasificación', { exact: true })).toBeVisible();
    state.verify();
  });

  test('FDS-14 a320px los pendientes se leen verticalmente en ambos temas', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'dashboard-mobile', 'Geometría específica de teléfono pequeño.');
    await page.setViewportSize({ width: 320, height: 812 });
    const state = await fixtures(page);
    await page.goto('/checking');
    await daily(page).getByRole('button', { name: 'Ver movimientos pendientes', exact: true }).click();
    await expect(daily(page).getByRole('listitem')).toHaveCount(20);
    for (const mode of ['Oscuro', 'Claro']) {
      await page.getByRole('button', { name: 'Apariencia', exact: true }).click();
      await page.getByRole('menuitemradio', { name: mode, exact: true }).click();
      expect(await daily(page).evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(321);
    }
    state.verify();
  });
});


test.describe('FBA — saldo bancario exacto', () => {
  test('disponible, contable, fecha y diferencia se muestran sin redondeo ni duplicar movimientos', async ({ page }, testInfo) => {
    const state = await fixtures(page);
    await page.goto('/checking');
    const bank = page.getByRole('region', { name: 'Saldo bancario Fintoc' });
    await expect(bank.getByTestId('bank-available-value')).toHaveText('$1.234.567');
    await expect(bank).toContainText('Saldo contable: $1.200.000');
    await expect(bank).toContainText('Diferencia con el historial: $584.567');
    await expect(bank).toContainText('Actualización bancaria:');
    await expect(page.getByTestId('totals-row')).toContainText('Saldo calculado');
    await expect(page.getByTestId('totals-row')).toContainText('$650.000');
    await expect(bank).not.toContainText('$1.235K');
    expect(state.fintocRequests.filter(r => r.path.endsWith('/bank-balance'))).toEqual([{ path: '/api/checking/fintoc/bank-balance', params: {} }]);
    expect(state.fintocRequests.filter(r => r.path.endsWith('/preview'))).toHaveLength(0);
    await expect.poll(async () => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(testInfo.project.use.viewport.width + 1);
    const storage = await page.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } }));
    expect(storage).not.toContain('1234567');
    state.verify();
  });

  test('tema oscuro y saldo desactualizado conservan la cifra y advierten su fecha', async ({ page }, testInfo) => {
    const state = await fixtures(page, { bankBalance: { ...bankBalance, freshness: 'stale' } });
    await page.addInitScript(() => localStorage.setItem('finanzas-appearance', 'dark'));
    await page.goto('/checking');
    await expect(page.locator('html')).toHaveAttribute('data-appearance', 'dark');
    const bank = page.getByRole('region', { name: 'Saldo bancario Fintoc' });
    await expect(bank.getByTestId('bank-available-value')).toHaveText('$1.234.567');
    await expect(bank.getByRole('alert')).toContainText('más de 24 horas');
    await expect.poll(async () => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(testInfo.project.use.viewport.width + 1);
    state.verify();
  });

  test('sin snapshot o con fallo no presenta el cálculo como saldo del banco', async ({ page }) => {
    const state = await fixtures(page, { bankBalance: { ...bankBalance, state: 'unavailable', available: null, current: null, bankUpdatedAt: null, queriedAt: null, freshness: 'unknown' } });
    await page.goto('/checking');
    const bank = page.getByRole('region', { name: 'Saldo bancario Fintoc' });
    await expect(bank).toContainText('Saldo bancario no disponible');
    await expect(bank.getByTestId('bank-available-value')).toHaveCount(0);
    await expect(page.getByTestId('totals-row')).toContainText('Saldo calculado');
    state.verify();
  });

  test('un error no expone información del banco', async ({ page }) => {
    const state = await fixtures(page, { failBalance: true });
    await page.goto('/checking');
    const bank = page.getByRole('region', { name: 'Saldo bancario Fintoc' });
    await expect(bank.getByRole('alert')).toContainText('No se pudo consultar el saldo bancario');
    await expect(bank).not.toContainText('sk_live_NEVER_DISPLAY');
    await expect(bank.getByTestId('bank-available-value')).toHaveCount(0);
    state.verify();
  });
});
