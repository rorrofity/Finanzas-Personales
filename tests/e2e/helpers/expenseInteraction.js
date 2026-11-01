const { expect } = require('@playwright/test');

const narrow = page => page.viewportSize().width < 900;

async function categorySurface(page) {
  const surface = narrow(page)
    ? page.getByTestId('expense-category-list')
    : page.getByRole('table', { name: 'Gastos por categoría y mes' });
  await expect(surface).toBeVisible();
  return surface;
}

async function openHistory(page, categoryName) {
  if (!narrow(page)) return;
  const button = page.getByRole('button', { name: `Ver historial de ${categoryName}`, exact: true });
  if (await button.getAttribute('aria-expanded') !== 'true') await button.click();
}

async function trendView(page) {
  if (narrow(page)) await page.getByRole('tab', { name: 'Tendencia', exact: true }).click();
  await expect(page.getByTestId('expense-trend')).toBeVisible();
}

async function categoriesView(page) {
  if (narrow(page)) await page.getByRole('tab', { name: 'Categorías', exact: true }).click();
  return categorySurface(page);
}

async function dataDetails(page) {
  const button = page.getByRole('button', { name: /Detalle de los datos/i });
  if (await button.count() && await button.getAttribute('aria-expanded') !== 'true') await button.click();
}

module.exports = { narrow, categorySurface, openHistory, trendView, categoriesView, dataDetails };
