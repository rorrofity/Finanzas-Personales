// @ts-check
/**
 * Helper de usuarios de prueba para la suite de API (Epic 11).
 *
 * Asegura la existencia de los usuarios vía /api/auth (register o login)
 * y retorna tokens JWT. Credenciales SOLO locales, nunca de producción.
 */

const OWNER = {
  nombre: 'E2E Owner',
  email: process.env.E2E_USER_EMAIL || 'e2e@test.local',
  password: process.env.E2E_USER_PASSWORD || 'E2eTest!2026',
};

const PARTNER = {
  nombre: 'E2E Partner',
  email: 'e2e.partner@test.local',
  password: 'E2ePartner!2026',
};

const THIRD = {
  nombre: 'E2E Third',
  email: 'e2e.third@test.local',
  password: 'E2eThird!2026',
};

/**
 * Login; si el usuario no existe, lo registra.
 * @param {import('@playwright/test').APIRequestContext} request
 * @param {{nombre:string,email:string,password:string}} u
 * @returns {Promise<{token:string, user:{id:string,email:string}}>}
 */
async function ensureUser(request, u) {
  const login = await request.post('/api/auth/login', {
    data: { email: u.email, password: u.password },
  });
  if (login.ok()) {
    const body = await login.json();
    return { token: body.token, user: body.user };
  }

  const reg = await request.post('/api/auth/register', {
    data: { nombre: u.nombre, email: u.email, password: u.password },
  });
  if (!reg.ok()) {
    throw new Error(`No se pudo crear usuario de prueba ${u.email}: ${reg.status()}`);
  }
  const body = await reg.json();
  return { token: body.token, user: body.user };
}

/** Headers estándar autenticados. @param {string} token */
const authHeaders = (token, extra = {}) => ({
  Authorization: `Bearer ${token}`,
  'Content-Type': 'application/json',
  ...extra,
});

/** Headers para operar sobre el espacio de otro usuario. */
const spaceHeaders = (token, ownerId) =>
  authHeaders(token, { 'X-Space-Owner': ownerId });

module.exports = { OWNER, PARTNER, THIRD, ensureUser, authHeaders, spaceHeaders };
