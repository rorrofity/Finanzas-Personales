// @ts-check
const { test, expect } = require('@playwright/test');
const { OWNER, PARTNER, ensureUser } = require('./helpers/users');

/**
 * Fase 0 — baseline: el runner de API funciona contra el backend local
 * y los usuarios de prueba (dueño + miembro) existen con token válido.
 */

test.describe('Baseline API', () => {
  test('backend local responde health check', async ({ request }) => {
    const res = await request.get('/api/health');
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.database).toBe('connected');
  });

  test('usuarios de prueba (dueño y miembro) obtienen JWT', async ({ request }) => {
    const owner = await ensureUser(request, OWNER);
    const partner = await ensureUser(request, PARTNER);

    expect(owner.token).toBeTruthy();
    expect(partner.token).toBeTruthy();
    expect(owner.user.id).not.toBe(partner.user.id);
  });
});
