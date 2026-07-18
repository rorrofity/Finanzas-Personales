// @ts-check
const { test, expect } = require('@playwright/test');

/**
 * Pruebas de REGRESIÓN — garantizan que la app sigue "operando tal cual"
 * tras los cambios PWA. Cubren rutas públicas y redirección de protegidas.
 *
 * (La regresión autenticada completa —CRUD, N8N sync— se añade cuando estén
 *  configuradas las credenciales de prueba E2E_USER_EMAIL/PASSWORD.)
 */

test.describe('Regresión / Rutas públicas', () => {
  test('login carga con formulario funcional', async ({ page }) => {
    await page.goto('/login');
    await expect(
      page.getByRole('heading', { name: /Iniciar Sesión/i })
    ).toBeVisible();
    await expect(page.getByLabel(/Correo Electrónico/i)).toBeVisible();
    await expect(page.getByLabel(/Contraseña/i)).toBeVisible();
    await expect(
      page.getByRole('button', { name: /Iniciar Sesión/i })
    ).toBeVisible();
  });

  test('register es accesible desde login', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('link', { name: /Regístrate/i }).click();
    await expect(page).toHaveURL(/\/register/);
  });

  test('ruta protegida redirige a login sin sesión', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/login/);
  });
});
