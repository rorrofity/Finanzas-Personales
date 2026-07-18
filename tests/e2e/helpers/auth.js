// @ts-check
/**
 * Helper de autenticación para pruebas E2E.
 *
 * Realiza login programático contra el backend local (POST /api/auth/login)
 * y guarda el JWT en localStorage bajo la clave 'token', tal como lo hace
 * la aplicación real (ver src/contexts/AuthContext.js).
 *
 * Credenciales de prueba: se leen de variables de entorno para NO hardcodear
 * secretos en el repositorio.
 *   E2E_USER_EMAIL    - email del usuario de prueba local
 *   E2E_USER_PASSWORD - contraseña del usuario de prueba local
 *   E2E_API_URL       - base del backend (default http://localhost:3001)
 */

const API_URL = process.env.E2E_API_URL || 'http://localhost:3001';
const TEST_EMAIL = process.env.E2E_USER_EMAIL || '';
const TEST_PASSWORD = process.env.E2E_USER_PASSWORD || '';

/**
 * Obtiene un token JWT haciendo login vía API.
 * @param {import('@playwright/test').APIRequestContext} request
 * @returns {Promise<string>} token JWT
 */
async function getAuthToken(request) {
  if (!TEST_EMAIL || !TEST_PASSWORD) {
    throw new Error(
      'Faltan credenciales de prueba. Define E2E_USER_EMAIL y E2E_USER_PASSWORD ' +
        'en tu entorno local antes de ejecutar las pruebas E2E.'
    );
  }

  const response = await request.post(`${API_URL}/api/auth/login`, {
    data: { email: TEST_EMAIL, password: TEST_PASSWORD },
  });

  if (!response.ok()) {
    throw new Error(
      `Login de prueba falló (${response.status()}). ` +
        'Verifica que el backend local esté corriendo y las credenciales sean válidas.'
    );
  }

  const body = await response.json();
  if (!body.token) {
    throw new Error('La respuesta de login no contiene token.');
  }
  return body.token;
}

/**
 * Autentica una página: inyecta el token en localStorage y navega al inicio.
 * @param {import('@playwright/test').Page} page
 * @param {import('@playwright/test').APIRequestContext} request
 */
async function loginAs(page, request) {
  const token = await getAuthToken(request);

  // Navegar primero para tener un origin válido donde escribir localStorage.
  await page.goto('/');
  await page.evaluate((t) => {
    window.localStorage.setItem('token', t);
  }, token);

  // Recargar para que AuthContext lea el token y cargue el usuario.
  await page.reload();
  return token;
}

module.exports = { getAuthToken, loginAs, API_URL };
