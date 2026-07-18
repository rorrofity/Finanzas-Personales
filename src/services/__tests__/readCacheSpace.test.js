import {
  cacheRead,
  getCachedRead,
  clearReadCache,
} from '../readCache';
import { setActiveSpaceOwner } from '../activeSpace';

/**
 * Fase 4 Epic 11 — Reqs 11.14 / 11.15:
 * el caché de lectura se llavea por espacio activo (sin fugas entre
 * espacios en offline) y se limpia por completo al cerrar sesión.
 */
describe('readCache por espacio (Reqs 11.14, 11.15)', () => {
  afterEach(async () => {
    setActiveSpaceOwner(null);
    await clearReadCache();
  });

  test('la misma clave en espacios distintos guarda entradas separadas', async () => {
    // Espacio propio
    setActiveSpaceOwner(null);
    await cacheRead('transactions:list', ['propias']);

    // Espacio compartido
    setActiveSpaceOwner('owner-abc');
    expect(await getCachedRead('transactions:list')).toBeNull();
    await cacheRead('transactions:list', ['del hogar']);
    expect(await getCachedRead('transactions:list')).toEqual(['del hogar']);

    // De vuelta al propio: los datos del hogar NO se filtran
    setActiveSpaceOwner(null);
    expect(await getCachedRead('transactions:list')).toEqual(['propias']);
  });

  test('clearReadCache elimina todas las entradas de todos los espacios', async () => {
    setActiveSpaceOwner(null);
    await cacheRead('k1', 'a');
    setActiveSpaceOwner('owner-abc');
    await cacheRead('k1', 'b');

    await clearReadCache();

    expect(await getCachedRead('k1')).toBeNull();
    setActiveSpaceOwner(null);
    expect(await getCachedRead('k1')).toBeNull();
  });
});
