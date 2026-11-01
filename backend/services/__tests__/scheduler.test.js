/**
 * Epic 13 Fase 2 — Reqs 13.1, 13.2, 13.4, 13.9, 13.13:
 * `runScheduledSync` orquesta la sincronización programada para todos los
 * usuarios que la tengan activada (`auto_sync_enabled = true`), y dispara
 * push solo cuando hay transacciones nuevas.
 */

jest.mock('../../config/database', () => ({ query: jest.fn() }));
jest.mock('../syncService', () => ({ runSync: jest.fn() }));
jest.mock('../pushService', () => ({ notifySync: jest.fn() }));
jest.mock('node-cron', () => ({
  ...jest.requireActual('node-cron'),
  schedule: jest.fn(),
}));

const cron = require('node-cron');
const db = require('../../config/database');
const syncService = require('../syncService');
const pushService = require('../pushService');
const { runScheduledSync, start, stop } = require('../scheduler');

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

describe('scheduler horario HSM-01/02', () => {
  const originalTimes = process.env.SYNC_CRON_TIMES;
  beforeEach(() => {
    delete process.env.SYNC_CRON_TIMES;
    cron.schedule.mockImplementation(() => ({ stop: jest.fn() }));
    db.query.mockReset();
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => {
    stop();
    jest.restoreAllMocks();
    jest.useRealTimers();
    if (originalTimes === undefined) delete process.env.SYNC_CRON_TIMES;
    else process.env.SYNC_CRON_TIMES = originalTimes;
  });

  test.each([
    ['2026-11-02T02:59:59.000Z', '2026-11-02'],
    ['2026-05-15T03:59:59.000Z', '2026-05-15'],
  ])('registra exactamente 17 horas locales y ningún horario nocturno extra (%s)', (now, localDay) => {
    jest.useFakeTimers().setSystemTime(new Date(now));
    start();
    const calls = cron.schedule.mock.calls;
    expect(calls.map(([expr]) => expr)).toEqual(['0 8-23 * * *', '0 0 * * *']);
    const localParts = date => new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(date).reduce((parts, part) => ({ ...parts, [part.type]: part.value }), {});
    const times = calls.flatMap(([expr, , options]) => {
      expect(cron.validate(expr)).toBe(true);
      expect(options).toEqual({ timezone: 'America/Santiago', noOverlap: true });
      const task = cron.createTask(expr, () => {}, options);
      const runs = task.getNextRuns(18).map(localParts);
      task.destroy();
      return runs.filter(p => `${p.year}-${p.month}-${p.day}` === localDay)
        .map(p => `${p.hour}:${p.minute}`);
    }).sort();
    expect(times).toEqual(['00:00', ...Array.from({ length: 16 }, (_, i) => `${String(i + 8).padStart(2, '0')}:00`)]);
  });

  test('conserva expresiones personalizadas, limpiando separadores vacíos', () => {
    process.env.SYNC_CRON_TIMES = ' 15 9 * * * , , 45 20 * * * ';
    start();
    expect(cron.schedule.mock.calls.map(([expr]) => expr)).toEqual(['15 9 * * *', '45 20 * * *']);
  });

  test('iniciar dos veces no duplica tareas; detener permite volver a iniciar', () => {
    start();
    const tasks = cron.schedule.mock.results.map(result => result.value);
    start();
    expect(cron.schedule).toHaveBeenCalledTimes(2);
    stop();
    tasks.forEach(task => expect(task.stop).toHaveBeenCalledTimes(1));
    start();
    expect(cron.schedule).toHaveBeenCalledTimes(4);
  });

  test('el disparador espera la sincronización para que noOverlap cubra toda su duración', async () => {
    let resolveUsers;
    db.query.mockReturnValue(new Promise(resolve => { resolveUsers = resolve; }));
    start();
    const pending = cron.schedule.mock.calls[0][1]();
    expect(pending).toBeInstanceOf(Promise);
    let settled = false;
    pending.then(() => { settled = true; });
    await Promise.resolve();
    expect(settled).toBe(false);
    resolveUsers({ rows: [] });
    await pending;
    expect(settled).toBe(true);
  });

  test('un error consultando usuarios se captura sin dejar una promesa rechazada', async () => {
    db.query.mockRejectedValue(new Error('database unavailable fixture'));
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});
    start();
    await expect(cron.schedule.mock.calls[0][1]()).resolves.toBeUndefined();
    expect(error).toHaveBeenCalledWith(expect.stringContaining('error inesperado'), 'database unavailable fixture');
  });
});
