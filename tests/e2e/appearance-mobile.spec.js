const { test, expect } = require('@playwright/test');
const { CATEGORIES, makeEvolution, installDashboardFixtures, clp } = require('./helpers/expenseFixtures');

async function open(page, options = {}) {
  const state = await installDashboardFixtures(page, options);
  await page.goto('/');
  await expect(page.getByTestId('expense-current-total')).toBeVisible();
  return state;
}

async function appearance(page, name) {
  await page.getByRole('button', { name: 'Apariencia', exact: true }).click();
  await page.getByRole('menuitemradio', { name, exact: true }).click();
}

test.describe('Epic16 — apariencia y lectura móvil', () => {
  test('AP-01/03/05 permite oscuro y claro, conserva la elección al recargar', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    const state = await open(page);
    await appearance(page, 'Oscuro');
    await expect(page.locator('html')).toHaveAttribute('data-appearance', 'dark');
    const dark = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(await page.evaluate(() => localStorage.getItem('finanzas-appearance'))).toBe('dark');
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-appearance', 'dark');
    await appearance(page, 'Claro');
    await expect(page.locator('html')).toHaveAttribute('data-appearance', 'light');
    expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).not.toBe(dark);
    await expect(page.getByTestId('expense-current-total')).toContainText(clp(makeEvolution().summary.currentTotal));
    state.verify();
  });

  test('AP-02 automático sigue el sistema y una elección explícita permanece estable', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    const state = await open(page);
    await appearance(page, 'Automático');
    await page.emulateMedia({ colorScheme: 'dark' });
    await expect(page.locator('html')).toHaveAttribute('data-appearance', 'dark');
    await page.emulateMedia({ colorScheme: 'light' });
    await expect(page.locator('html')).toHaveAttribute('data-appearance', 'light');
    await appearance(page, 'Oscuro');
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.emulateMedia({ colorScheme: 'light' });
    await expect(page.locator('html')).toHaveAttribute('data-appearance', 'dark');
    state.verify();
  });

  test('AP-03 el inicio de sesión permite elegir apariencia sin autenticarse', async ({ page }) => {
    const state = await installDashboardFixtures(page);
    await page.route('**/api/auth/profile', route => route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ message: 'Sin sesión de prueba' }) }));
    await page.goto('/login');
    await appearance(page, 'Oscuro');
    await expect(page.locator('html')).toHaveAttribute('data-appearance', 'dark');
    await expect(page.getByRole('heading', { name: /Iniciar Sesión/i })).toBeVisible();
    state.verify();
  });

  test('AP-04 apariencia y espacios compartidos permanecen accesibles juntos a320px', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'dashboard-mobile', 'Geometría dedicada al AppBar móvil.');
    await page.setViewportSize({ width: 320, height: 812 });
    const state = await installDashboardFixtures(page);
    await page.route('**/api/space/memberships', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ spaces: [
      { ownerId: 'fixture-user', ownerName: 'Usuario de prueba', isOwner: true, canEdit: true, canDelete: true },
      { ownerId: 'shared-household', ownerName: 'Hogar con un nombre largo', isOwner: false, canEdit: false, canDelete: false },
    ] }) }));
    await page.goto('/');
    await expect(page.getByTestId('space-switcher')).toBeVisible();
    const boxes = await page.getByRole('banner').evaluate(element => {
      const bounds = element.getBoundingClientRect();
      return Array.from(element.querySelectorAll('button,[role="combobox"]')).map(control => {
        const box = control.getBoundingClientRect();
        return { left: box.left, right: box.right, top: box.top, bottom: box.bottom, containerLeft: bounds.left, containerRight: bounds.right };
      });
    });
    for (const box of boxes) {
      expect(box.left).toBeGreaterThanOrEqual(box.containerLeft - 1);
      expect(box.right).toBeLessThanOrEqual(box.containerRight + 1);
    }
    await appearance(page, 'Oscuro');
    await expect(page.locator('html')).toHaveAttribute('data-appearance', 'dark');
    state.verify();
  });

  test('MOB-01/03/04 todas las categorías y su historial se leen verticalmente', async ({ page }, testInfo) => {
    test.skip(testInfo.project.use.viewport.width >= 900, 'Vista de categorías vertical en pantallas estrechas.');
    const state = await open(page);
    await expect(page.getByTestId('expense-category-list')).toBeVisible();
    await expect(page.getByRole('table', { name: 'Gastos por categoría y mes' })).toHaveCount(0);
    for (const category of CATEGORIES) {
      await expect(page.getByTestId(`expense-category-card-${category.id}`)).toContainText(category.name);
    }
    const toggle = page.getByRole('button', { name: 'Ver historial de Cuentas', exact: true });
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    const history = page.getByTestId('expense-category-history-1');
    const report = makeEvolution();
    for (const month of report.months) {
      await expect(history.getByRole('button', { name: `Ver movimientos de Cuentas en ${month.label}`, exact: true })).toBeVisible();
    }
    await history.getByRole('button', { name: `Ver movimientos de Cuentas en ${report.months[0].label}`, exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Cuentas', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Cerrar detalle', exact: true }).click();
    state.verify();
  });

  test('MOB-01/08 a320px no hay contenedores que requieran desplazamiento lateral, en ambos modos', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'dashboard-mobile', 'Una comprobación geométrica dedicada a320px.');
    await page.setViewportSize({ width: 320, height: 812 });
    const state = await open(page, { huge: true });
    for (const mode of ['Claro', 'Oscuro']) {
      await appearance(page, mode);
      await page.getByRole('button', { name: `Ver historial de ${CATEGORIES[11].name}`, exact: true }).click();
      const overflow = await page.evaluate(() => Array.from(document.querySelectorAll('main *, [data-testid="expense-category-list"] *')).filter(element => {
        const box = element.getBoundingClientRect(), css = getComputedStyle(element);
        return box.width > 0 && box.height > 0 && ['auto', 'scroll'].includes(css.overflowX) && element.scrollWidth > element.clientWidth + 1;
      }).map(element => ({ tag: element.tagName, testId: element.getAttribute('data-testid') })));
      expect(overflow).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(321);
      const total = page.getByTestId('expense-current-total');
      expect(await total.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
      await page.getByRole('button', { name: `Ver historial de ${CATEGORIES[11].name}`, exact: true }).click();
    }
    state.verify();
  });
});
