/**
 * Epic 13 Fase 2 — Reqs 13.1, 13.2, 13.4, 13.9, 13.13:
 * `runScheduledSync` orquesta la sincronización programada para todos los
 * usuarios que la tengan activada (`auto_sync_enabled = true`), y dispara
 * push solo cuando hay transacciones nuevas.
 */

jest.mock('../../config/database', () => ({ query: jest.fn() }));
jest.mock('../syncService', () => ({ runSync: jest.fn() }));
jest.mock('../pushService', () => ({ notifySync: jest.fn() }));

const db = require('../../config/database');
const syncService = require('../syncService');
const pushService = require('../pushService');
const { runScheduledSync } = require('../scheduler');

describe('scheduler.runScheduledSync', () => {
  beforeEach(() => {
    db.query.mockReset();
    syncService.runSync.mockReset();
    pushService.notifySync.mockReset();
  });

  test('itera SOLO usuarios con auto_sync_enabled=true', async () => {
    db.query.mockResolvedValue({ rows: [{ id: 'u1' }, { id: 'u2' }] });
    syncService.runSync.mockResolvedValue({ imported: 0, skipped: 0, error: null });

    await runScheduledSync();

    // La query de selección debe filtrar por auto_sync_enabled
    const selectCall = db.query.mock.calls[0][0];
    expect(selectCall).toMatch(/auto_sync_enabled/i);

    expect(syncService.runSync).toHaveBeenCalledTimes(2);
    expect(syncService.runSync).toHaveBeenCalledWith('u1', 'scheduled');
    expect(syncService.runSync).toHaveBeenCalledWith('u2', 'scheduled');
  });

  test('con imported>0 llama a pushService.notifySync; con imported=0 no', async () => {
    db.query.mockResolvedValue({ rows: [{ id: 'u1' }, { id: 'u2' }] });
    syncService.runSync
      .mockResolvedValueOnce({ imported: 5, skipped: 1, error: null })
      .mockResolvedValueOnce({ imported: 0, skipped: 0, error: null });

    await runScheduledSync();

    expect(pushService.notifySync).toHaveBeenCalledTimes(1);
    expect(pushService.notifySync).toHaveBeenCalledWith('u1', 5);
  });

  test('un error en un usuario no aborta el resto (error-safe)', async () => {
    db.query.mockResolvedValue({ rows: [{ id: 'u1' }, { id: 'u2' }] });
    syncService.runSync
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({ imported: 2, skipped: 0, error: null });

    await expect(runScheduledSync()).resolves.not.toThrow();

    expect(syncService.runSync).toHaveBeenCalledTimes(2);
    expect(pushService.notifySync).toHaveBeenCalledWith('u2', 2);
  });

  test('sin usuarios con auto_sync_enabled, no llama a runSync', async () => {
    db.query.mockResolvedValue({ rows: [] });

    await runScheduledSync();

    expect(syncService.runSync).not.toHaveBeenCalled();
    expect(pushService.notifySync).not.toHaveBeenCalled();
  });
});
