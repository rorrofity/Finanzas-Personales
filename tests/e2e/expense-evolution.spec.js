// @ts-check
const { test, expect } = require('@playwright/test');
const { CATEGORIES, makeEvolution, installDashboardFixtures, clp } = require('./helpers/expenseFixtures');

async function openDashboard(page, options = {}) {
  const state = await installDashboardFixtures(page, options);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Evolución de gastos', exact: true })).toBeVisible();
  await expect(page.getByRole('table', { name: 'Gastos por categoría y mes' })).toBeVisible();
  return state;
}
async function selectMUI(page, name, option) {
  const control = page.getByRole('combobox', { name, exact: true });
  if (await control.evaluate(element => element.tagName === 'SELECT')) {
    await control.selectOption({ label: option });
    return;
  }
  await control.click();
  await page.getByRole('option', { name: option, exact: true }).click();
}

test.describe('DCE — evolución de gastos con fixtures sin backend', () => {
  test('DCE-01/07/08 ancla la matriz al mes seleccionado y conserva todas las categorías', async ({ page }) => {
    const state = await openDashboard(page, { period: '2025-02' });
    const table = page.getByRole('table', { name: 'Gastos por categoría y mes' });
    const fixture = makeEvolution({ endYear: 2025, endMonth: 2 });
    for (const month of fixture.months) await expect(table.getByRole('columnheader', { name: new RegExp('^' + month.label.replace('.', '\\.')) })).toBeVisible();
    for (const category of CATEGORIES) await expect(table.getByRole('button', { name: `Ver tendencia de ${category.name}`, exact: true })).toBeVisible();
    expect(state.requests.find(r => r.path === '/api/dashboard/expense-evolution').params).toMatchObject({ endYear: '2025', endMonth: '2', months: '6', basis: 'billing', sources: 'tc_nacional' });
    state.verify();
  });

  test('DCE-01 ventana 3/6/12 cambia los meses y cruza el año correctamente', async ({ page }) => {
    const state = await openDashboard(page, { period: '2025-02' });
    const table = page.getByRole('table', { name: 'Gastos por categoría y mes' });
    for (const length of [3, 12, 6]) {
      await selectMUI(page, 'Ventana', `${length} meses`);
      await expect.poll(() => state.requests.filter(r => r.path === '/api/dashboard/expense-evolution').at(-1)?.params.months).toBe(String(length));
      const fixture = makeEvolution({ endYear: 2025, endMonth: 2, months: length });
      await expect(table.getByRole('columnheader', { name: new RegExp('^' + fixture.months[0].label.replace('.', '\\.')) })).toBeVisible();
    }
    state.verify();
  });

  test('DCE-02/04/06 selector de fuente actualiza importes y declara consolidación', async ({ page }) => {
    const state = await openDashboard(page);
    await selectMUI(page, 'Fuente', 'Tarjetas internacionales');
    await expect.poll(() => state.requests.filter(r => r.path === '/api/dashboard/expense-evolution').at(-1)?.params.sources).toBe('tc_internacional');
    await expect(page.getByTestId('expense-current-total')).toContainText(clp(makeEvolution({ sources: 'tc_internacional' }).summary.currentTotal));
    await selectMUI(page, 'Fuente', 'Todas las fuentes');
    await expect(page.getByText(/Suma de registros de las fuentes seleccionadas/i)).toBeVisible();
    await expect(page.getByText(/consolidación.*verificada|verificada.*consolidación/i).first()).toBeVisible();
    state.verify();
  });

  test('DCE-09 celda de otro mes abre su detalle con fecha real y suma consistente', async ({ page }) => {
    const state = await openDashboard(page);
    const fixture = makeEvolution(), first = fixture.months[0];
    await page.getByRole('button', { name: `Ver movimientos de Cuentas en ${first.label}`, exact: true }).click();
    const detail = page.getByTestId('expense-detail');
    await expect(detail).toBeVisible();
    await expect(detail.getByText('Movimiento ficticio A')).toBeVisible();
    expect(state.requests.find(r => r.path.endsWith('/expense-evolution/transactions')).params).toMatchObject({ year: String(first.year), month: String(first.month), categoryId: '1', sources: 'tc_nacional', basis: 'billing' });
    await expect(detail).toContainText(clp(fixture.categories[0].values[0].total));
    await expect(detail).toContainText(/23/);
    await page.getByRole('button', { name: 'Cerrar detalle', exact: true }).click();
    await expect(detail).toBeHidden();
    state.verify();
  });

  test('DCE-09/18 categoría y celdas se operan por teclado', async ({ page }) => {
    const state = await openDashboard(page);
    const category = page.getByRole('table', { name: 'Gastos por categoría y mes' }).getByRole('button', { name: 'Ver tendencia de Cuentas', exact: true });
    await category.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('combobox', { name: 'Categoría', exact: true })).toContainText('Cuentas');
    const label = makeEvolution().months[0].label;
    await page.getByRole('button', { name: `Ver movimientos de Cuentas en ${label}`, exact: true }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('expense-detail')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('expense-detail')).toBeHidden();
    state.verify();
  });

  test('DCE-03/10/12/19 declara cobertura, exclusiones y porcentaje sin base', async ({ page }) => {
    const state = await openDashboard(page, { exclusions: true, zeroBase: true });
    await selectMUI(page, 'Categoría', 'Cuentas');
    await expect(page.getByTestId('expense-coverage')).toContainText(/no verificada|desconocida/i);
    await expect(page.getByText(/sin período|período.*determinado/i)).toBeVisible();
    await expect(page.getByText(/conversión|CLP/i).filter({ hasText: /2/ })).toBeVisible();
    await expect(page.getByText(/Sin base previa/i).first()).toBeVisible();
    await expect(page.locator('body')).not.toContainText(/Infinity|NaN/);
    state.verify();
  });

  test('DCE-12 no confunde un mes futuro con gasto cero certificado', async ({ page }) => {
    const state = await openDashboard(page, { period: '2027-02', empty: true });
    await expect(page.getByText(/futuro/i).first()).toBeVisible();
    await expect(page.getByText(/sin movimientos registrados|sin registros/i).first()).toBeVisible();
    await expect(page.getByTestId('expense-coverage')).toContainText(/no verificada|desconocida/i);
    state.verify();
  });

  test('DCE-14 respuestas de un período anterior no pisan la selección nueva', async ({ page }) => {
    const state = await openDashboard(page, { delay: params => params.endMonth === '9' ? 1000 : 0 });
    await selectMUI(page, 'Mes', 'septiembre');
    await selectMUI(page, 'Mes', 'agosto');
    await expect(page.getByTestId('expense-current-total')).toContainText(clp(makeEvolution({ endMonth: 8 }).summary.currentTotal));
    await page.waitForTimeout(1100);
    await expect(page.getByTestId('expense-current-total')).toContainText(clp(makeEvolution({ endMonth: 8 }).summary.currentTotal));
    state.verify();
  });

  test('DCE-17 un error de lectura se muestra sin inventar gasto cero', async ({ page }) => {
    const state = await installDashboardFixtures(page, { failEvolution: true });
    await page.goto('/');
    await expect(page.getByText(/error.*cargar|no.*cargar/i).first()).toBeVisible();
    await expect(page.getByTestId('expense-current-total')).toHaveCount(0);
    state.verify();
  });

  test('DCE-16 consulta caché offline y declara rango no descargado', async ({ page, context }) => {
    const state = await openDashboard(page), initial = clp(makeEvolution().summary.currentTotal);
    await context.setOffline(true);
    await expect(page.getByText(/sin conexión/i).first()).toBeVisible();
    await expect(page.getByTestId('expense-current-total')).toContainText(initial);
    await selectMUI(page, 'Ventana', '3 meses');
    await expect(page.getByText(/sin.*guardad|no.*descargad|sin.*caché/i).first()).toBeVisible();
    await selectMUI(page, 'Ventana', '6 meses');
    await expect(page.getByTestId('expense-current-total')).toContainText(initial);
    await expect(page.getByText(/guardad|caché|obtenid/i).first()).toBeVisible();
    await context.setOffline(false);
    state.verify();
  });

  test('DCE-18/21 importes y nombres largos no desbordan ni truncan a 375px', async ({ page }, testInfo) => {
    const state = await openDashboard(page, { huge: true });
    const value = page.getByTestId('expense-current-total');
    await expect(value).toContainText(clp(makeEvolution({}, { huge: true }).summary.currentTotal));
    expect(await value.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(testInfo.project.use.viewport.width + 1);
    await expect(page.getByRole('table', { name: 'Gastos por categoría y mes' }).getByRole('button', { name: `Ver tendencia de ${CATEGORIES[11].name}`, exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`expense-evolution-${testInfo.project.name}.png`), fullPage: true });
    state.verify();
  });

  test('DCE-13 Salud Financiera identifica compromisos y conserva porcentaje superior a 100', async ({ page }) => {
    const state = await installDashboardFixtures(page);
    await page.goto('/financial-health');
    await expect(page.getByText('Composición de compromisos', { exact: true })).toBeVisible();
    await expect(page.getByText(/167,5% comprometido/)).toBeVisible();
    await expect(page.getByText('Otros compromisos', { exact: true })).toBeVisible();
    expect(state.requests.filter(r => r.path === '/api/dashboard/categories')).toEqual([]);
    state.verify();
  });

  test('DCE-18 conserva encabezado y categoría visibles al desplazar la matriz', async ({ page }) => {
    const state = await openDashboard(page);
    const matrix = page.getByTestId('expense-matrix');
    expect(await matrix.evaluate(el => el.scrollHeight > el.clientHeight)).toBe(true);
    await matrix.evaluate(el => { el.scrollTop = el.scrollHeight; el.scrollLeft = el.scrollWidth; });
    const positions = await matrix.evaluate(el => {
      const box = el.getBoundingClientRect();
      const header = el.querySelector('thead th').getBoundingClientRect();
      const rows = el.querySelectorAll('tbody tr');
      const label = rows[rows.length - 1].querySelector('th').getBoundingClientRect();
      return { top: box.top, bottom: box.bottom, left: box.left, right: box.right, headerTop: header.top, headerBottom: header.bottom, labelLeft: label.left, labelRight: label.right };
    });
    expect(positions.headerTop).toBeGreaterThanOrEqual(positions.top - 1);
    expect(positions.headerBottom).toBeLessThanOrEqual(positions.bottom + 1);
    expect(positions.labelLeft).toBeGreaterThanOrEqual(positions.left - 1);
    expect(positions.labelRight).toBeLessThanOrEqual(positions.right + 1);
    state.verify();
  });
});
