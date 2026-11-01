// @ts-check
const { test, expect } = require('@playwright/test');
const { installDashboardFixtures, makeEvolution, clp } = require('./helpers/expenseFixtures');

/**
 * Epic12 guarantees retained under DCE's accepted amendment of Req12.4/12.5:
 * compact exact values, commitments, category detail, usable trends, empty state,
 * no viewport overflow. All API data is synthetic; no backend is started.
 */
test.describe('Dashboard — garantías de Epic12 con evolución DCE', () => {
  test('12.2 indicadores exactos del alcance y disponible hoy', async ({ page }) => {
    const state = await installDashboardFixtures(page);
    await page.goto('/');
    await expect(page.getByTestId('expense-current-total')).toContainText(clp(makeEvolution().summary.currentTotal));
    await expect(page.getByText('Disponible hoy', { exact: true })).toBeVisible();
    await expect(page.getByText(/1\.031\.242/)).toBeVisible();
    await expect(page.getByText('Variación frente al mes anterior', { exact: true })).toBeVisible();
    state.verify();
  });

  test('12.3 compromisos próximos colapsado por defecto; expande con tap', async ({ page }) => {
    const state = await installDashboardFixtures(page);
    await page.goto('/');
    const compromisos = page.getByText('Compromisos próximos', { exact: true });
    await expect(compromisos).toBeVisible();
    await expect(page.getByText('TC no facturado', { exact: true })).toBeHidden();
    await compromisos.click();
    await expect(page.getByText('TC no facturado', { exact: true })).toBeVisible();
    await expect(page.getByText(/1\.200\.000/)).toBeVisible();
    state.verify();
  });

  test('12.4 enmendado: todas las categorías y celda abre el detalle del mes', async ({ page }) => {
    const state = await installDashboardFixtures(page);
    await page.goto('/');
    const label = makeEvolution().months.at(-1).label;
    await page.getByRole('button', { name: `Ver movimientos de Cuentas en ${label}`, exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Cuentas', exact: true })).toBeVisible();
    await expect(page.getByText('Movimiento ficticio A', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Cerrar detalle', exact: true })).toBeVisible();
    state.verify();
  });

  test('12.5 enmendado: selección cambia la serie sin ocultar la matriz', async ({ page }) => {
    const state = await installDashboardFixtures(page);
    await page.goto('/');
    const select = page.getByRole('combobox', { name: 'Categoría', exact: true });
    await select.selectOption({ label: 'Cuentas' });
    await expect(page.getByTestId('expense-trend')).toHaveAccessibleName('Tendencia de Cuentas');
    await select.selectOption({ label: 'Compras casa' });
    await expect(page.getByTestId('expense-trend')).toHaveAccessibleName('Tendencia de Compras casa');
    await expect(page.getByRole('table', { name: 'Gastos por categoría y mes' })).toBeVisible();
    state.verify();
  });

  test('12.11 sin overflow horizontal en 375px', async ({ page }, testInfo) => {
    test.skip(testInfo.project.use.viewport.width !== 375, 'Solo viewport móvil.');
    const state = await installDashboardFixtures(page);
    await page.goto('/');
    await expect(page.getByTestId('expense-current-total')).toBeVisible();
    await expect.poll(async () => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(376);
    state.verify();
  });

  test('12.6 período sin datos explica consulta e incorporación de movimientos', async ({ page }) => {
    const state = await installDashboardFixtures(page, { empty: true });
    await page.goto('/');
    await expect(page.getByText(/Sin movimientos registrados en el mes seleccionado/)).toBeVisible();
    await expect(page.getByText(/Importar o sincronizar/)).toBeVisible();
    await expect(page.getByTestId('expense-current-total')).toHaveText('$0');
    state.verify();
  });
});
