import { cacheRead, getCachedRead, fetchWithCache } from '../readCache';

/**
 * Fase 2 — Req 9.3: caché de lectura con IndexedDB.
 *
 * Requiere fake-indexeddb (cargado en src/setupTests.js).
 */
describe('readCache', () => {
  const setOnLine = (value) => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value });
  };

  afterEach(() => {
    setOnLine(true);
  });

  test('cacheRead + getCachedRead persisten y recuperan datos', async () => {
    await cacheRead('clave-1', { hola: 'mundo' });
    const cached = await getCachedRead('clave-1');
    expect(cached).toEqual({ hola: 'mundo' });
  });

  test('getCachedRead devuelve null si no existe la clave', async () => {
    const cached = await getCachedRead('inexistente');
    expect(cached).toBeNull();
  });

  test('fetchWithCache online: llama a la red y cachea el resultado', async () => {
    setOnLine(true);
    const networkFn = jest.fn().mockResolvedValue({ valor: 42 });

    const result = await fetchWithCache('dashboard', networkFn);

    expect(networkFn).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ valor: 42 });

    // Debe haber quedado cacheado.
    const cached = await getCachedRead('dashboard');
    expect(cached).toEqual({ valor: 42 });
  });

  test('fetchWithCache offline: NO llama a la red y devuelve la caché', async () => {
    // Primero cacheamos algo estando online.
    setOnLine(true);
    await fetchWithCache('tx', jest.fn().mockResolvedValue([{ id: 1 }]));

    // Ahora offline: debe devolver caché sin tocar la red.
    setOnLine(false);
    const networkFn = jest.fn().mockResolvedValue([{ id: 999 }]);

    const result = await fetchWithCache('tx', networkFn);

    expect(networkFn).not.toHaveBeenCalled();
    expect(result).toEqual([{ id: 1 }]);
  });

  test('fetchWithCache online con fallo de red: cae a la caché', async () => {
    setOnLine(true);
    await fetchWithCache('tx2', jest.fn().mockResolvedValue([{ id: 7 }]));

    const failing = jest.fn().mockRejectedValue(new Error('network down'));
    const result = await fetchWithCache('tx2', failing);

    expect(result).toEqual([{ id: 7 }]);
  });
});
