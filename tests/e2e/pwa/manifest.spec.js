// @ts-check
const { test, expect } = require('@playwright/test');

/**
 * Fase 1 — Req 9.2: manifest.json válido para PWA.
 *
 * El manifest debe declarar: name, short_name, start_url, scope,
 * display=standalone, theme_color, background_color, íconos en múltiples
 * tamaños (incluyendo 192 y 512 con purpose maskable) y shortcuts.
 *
 * Corre contra el dev server (manifest.json es un asset estático).
 */

test.describe('PWA / Manifest (Req 9.2)', () => {
  /** @type {any} */
  let manifest;

  test.beforeEach(async ({ request }) => {
    const response = await request.get('/manifest.json');
    expect(response.ok()).toBeTruthy();
    manifest = await response.json();
  });

  test('declara campos base obligatorios', async () => {
    expect(manifest.name).toBeTruthy();
    expect(manifest.short_name).toBeTruthy();
    expect(manifest.start_url).toBeTruthy();
    expect(manifest.scope).toBeTruthy();
    expect(manifest.display).toBe('standalone');
    expect(manifest.theme_color).toBeTruthy();
    expect(manifest.background_color).toBeTruthy();
  });

  test('incluye íconos 192 y 512 con purpose maskable', async () => {
    const sizes = (manifest.icons || []).map((i) => i.sizes);
    expect(sizes).toContain('192x192');
    expect(sizes).toContain('512x512');

    const hasMaskable = (manifest.icons || []).some(
      (i) => typeof i.purpose === 'string' && i.purpose.includes('maskable')
    );
    expect(hasMaskable).toBeTruthy();
  });

  test('define al menos un shortcut', async () => {
    expect(Array.isArray(manifest.shortcuts)).toBeTruthy();
    expect(manifest.shortcuts.length).toBeGreaterThan(0);
  });

  test('theme_color coincide con la identidad de la app (azul)', async () => {
    // El tema MUI usa azul (#3B82F6). El manifest actual tiene #000000.
    expect(manifest.theme_color.toLowerCase()).not.toBe('#000000');
  });
});
