/**
 * Epic 13 Fase 1 — Req 13.1, 13.4, 13.5: `runSync` extrae la llamada a N8N
 * (hoy embebida en el endpoint /sync-emails) a una función reutilizable
 * por el disparo manual y el programado.
 *
 * Comportamiento esperado:
 *  - Éxito: llama a axios.post al webhook N8N, retorna {imported, skipped},
 *    y registra una fila en sync_runs con esos valores.
 *  - Error de N8N (red caída, timeout, 500, etc.): NUNCA lanza — retorna
 *    {imported: 0, skipped: 0, error: <mensaje>} y registra el error en
 *    sync_runs (para que el scheduler pueda seguir con el próximo usuario
 *    sin abortar, Req 13.4).
 */

jest.mock('axios');
jest.mock('../../config/database', () => ({ query: jest.fn() }));

const axios = require('axios');
const db = require('../../config/database');
const { runSync } = require('../syncService');

describe('syncService.runSync', () => {
  const USER_ID = 'user-abc';
  const queryMock = db.query;

  beforeEach(() => {
    queryMock.mockReset();
    axios.post.mockReset();
    // Por defecto: SELECT nombre del usuario, luego INSERT en sync_runs
    queryMock.mockImplementation((sql) => {
      if (sql.includes('SELECT') && sql.includes('users')) {
        return Promise.resolve({ rows: [{ id: USER_ID, nombre: 'Rodrigo' }] });
      }
      return Promise.resolve({ rows: [] });
    });
  });

  test('éxito: llama al webhook de N8N y retorna {imported, skipped}', async () => {
    axios.post.mockResolvedValue({ data: { imported: 5, skipped: 2 } });

    const result = await runSync(USER_ID, 'manual');

    expect(axios.post).toHaveBeenCalledTimes(1);
    expect(result).toEqual(expect.objectContaining({ imported: 5, skipped: 2, error: null }));
  });

  test('éxito: registra la corrida en sync_runs con el trigger correcto', async () => {
    axios.post.mockResolvedValue({ data: { imported: 3, skipped: 0 } });

    await runSync(USER_ID, 'scheduled');

    const insertCall = queryMock.mock.calls.find(([sql]) => sql.includes('INSERT INTO sync_runs'));
    expect(insertCall).toBeTruthy();
    const [, params] = insertCall;
    expect(params).toEqual(expect.arrayContaining([USER_ID, 'scheduled', 3, 0]));
  });

  test('error de N8N: NO lanza, retorna error y registra la corrida fallida', async () => {
    axios.post.mockRejectedValue(new Error('connect ECONNREFUSED'));

    const result = await runSync(USER_ID, 'scheduled');

    expect(result.imported).toBe(0);
    expect(result.skipped).toBe(0);
    expect(result.error).toMatch(/ECONNREFUSED/);

    const insertCall = queryMock.mock.calls.find(([sql]) => sql.includes('INSERT INTO sync_runs'));
    expect(insertCall).toBeTruthy();
    const [, params] = insertCall;
    expect(params).toEqual(expect.arrayContaining([USER_ID, 'scheduled']));
  });

  test('formato de respuesta N8N como array (webhook multi-output) se parsea igual', async () => {
    axios.post.mockResolvedValue({
      data: [[{ json: { imported: 1, skipped: 0 } }]],
    });

    const result = await runSync(USER_ID, 'manual');
    expect(result.imported).toBe(1);
  });
});
