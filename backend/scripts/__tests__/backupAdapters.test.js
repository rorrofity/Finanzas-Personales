const fs = require('fs');
const path = require('path');
const { buildChildEnvironment, runBackup } = require('../../../automation/backups/run-backup.cjs');
const { notifyEvent } = require('../../../automation/backups/notify-backup.cjs');

const ENV = {
  DB_HOST: 'db.internal', DB_PORT: '5433', DB_NAME: 'household', DB_USER: 'backup-user',
  DB_PASSWORD: 'private-db-password', PGPASSWORD: 'stale-password',
  CARD_STATEMENTS_OWNER_USER_ID: 'owner-only',
  VAPID_PUBLIC_KEY: 'public-vapid', VAPID_PRIVATE_KEY: 'private-vapid', VAPID_SUBJECT: 'mailto:owner@example.test',
};
const SUB = { endpoint: 'https://push.example.test/private-endpoint', p256dh: 'private-key', auth: 'private-auth' };
function dependencies(rows = [SUB]) {
  const client = { query: jest.fn(async sql => /SELECT/.test(sql) ? { rows } : { rows: [] }), release: jest.fn() };
  const pool = { connect: jest.fn(async () => client), end: jest.fn(async () => {}), on: jest.fn() };
  const Pool = jest.fn(() => pool);
  const webpush = { setVapidDetails: jest.fn(), sendNotification: jest.fn(async () => ({})) };
  return { env: ENV, Pool, webpush, pool, client };
}

describe('backup runner', () => {
  test('passes PostgreSQL credentials only through environment and keeps originals unchanged', () => {
    const result = buildChildEnvironment(ENV);
    expect(result).toMatchObject({ PGHOST: 'db.internal', PGPORT: '5433', PGDATABASE: 'household', PGUSER: 'backup-user', PGPASSWORD: 'private-db-password', PGAPPNAME: 'finanzas-backup' });
    expect(ENV.PGPASSWORD).toBe('stale-password');
    expect(buildChildEnvironment({ ...ENV, PGOPTIONS: '-c default_transaction_read_only=off' }).PGOPTIONS).toBe('-c default_transaction_read_only=off -c default_transaction_read_only=on');
  });
  test('uses defaults and an explicit config without placing credentials in arguments', () => {
    const spawnSync = jest.fn(() => ({ status: 0, stdout: JSON.stringify({ status: 'ok', verified: true }) }));
    expect(runBackup({ argv: ['--config', '/private/config.json'], env: ENV, spawnSync, appRoot: '/srv/finanzas' })).toBe(0);
    expect(spawnSync).toHaveBeenCalledWith('/usr/bin/python3', ['/srv/finanzas/automation/backups/daily_backup.py', '--config', '/private/config.json'], expect.objectContaining({ env: expect.objectContaining({ PGPASSWORD: 'private-db-password' }), stdio: ['ignore', 'pipe', 'ignore'] }));
    expect(JSON.stringify(spawnSync.mock.calls[0].slice(0, 2))).not.toMatch(/private-db-password/);
  });
  test('default config, verification command and failed child status propagate safely', () => {
    const spawnSync = jest.fn(() => ({ status: 7 }));
    expect(runBackup({ argv: [], env: ENV, spawnSync, appRoot: '/srv/finanzas' })).toBe(7);
    expect(spawnSync.mock.calls[0][1]).toEqual(['/srv/finanzas/automation/backups/daily_backup.py', '--config', '/etc/finanzas-backup/config.json']);
    spawnSync.mockReturnValue({ error: new Error('private-db-password') });
    expect(runBackup({ argv: ['--verify', '/private/snapshot.tar.gz'], env: ENV, spawnSync, appRoot: '/srv/finanzas' })).toBe(1);
    expect(spawnSync.mock.calls[1][1]).toEqual(['/srv/finanzas/automation/backups/daily_backup.py', '--config', '/etc/finanzas-backup/config.json', '--verify', '/private/snapshot.tar.gz']);
  });
});

describe('backup runner failure notification fallback', () => {
  test('configuration failure gets one fallback alert and sanitized operational output', () => {
    const output = jest.fn();
    const spawnSync = jest.fn()
      .mockReturnValueOnce({ status: 1, stdout: JSON.stringify({ status: 'failed', code: 'BACKUP_CONFIGURATION_OR_VERIFICATION_FAILED' }), stderr: 'private-db-password' })
      .mockReturnValueOnce({ status: 0, stdout: JSON.stringify({ delivered: true, endpoint: 'private-endpoint' }) });
    expect(runBackup({ argv: [], env: ENV, spawnSync, appRoot: '/srv/finanzas', writeSummary: output })).toBe(1);
    expect(spawnSync).toHaveBeenCalledTimes(2);
    expect(spawnSync.mock.calls[1]).toEqual([process.execPath, ['/srv/finanzas/automation/backups/notify-backup.cjs'], expect.objectContaining({ input: JSON.stringify({ type: 'backup-failed' }), stdio: ['pipe', 'pipe', 'ignore'] })]);
    expect(output).toHaveBeenCalledWith({ status: 'failed', code: 'BACKUP_CONFIGURATION_OR_VERIFICATION_FAILED', backupAlertPending: false });
    expect(JSON.stringify(output.mock.calls)).not.toMatch(/private/);
  });
  test('ordinary engine failure does not send a duplicate notification', () => {
    const output = jest.fn();
    const spawnSync = jest.fn(() => ({ status: 1, stdout: JSON.stringify({ status: 'failed', code: 'TOOL_FAILED', backupAlertPending: true }) }));
    expect(runBackup({ env: ENV, spawnSync, appRoot: '/srv/finanzas', writeSummary: output })).toBe(1);
    expect(spawnSync).toHaveBeenCalledTimes(1);
    expect(output).toHaveBeenCalledWith({ status: 'failed', code: 'TOOL_FAILED', backupAlertPending: true });
  });
  test('failed fallback keeps alert pending and never forwards raw child output', () => {
    const output = jest.fn();
    const spawnSync = jest.fn()
      .mockReturnValueOnce({ status: 1, stdout: JSON.stringify({ status: 'failed', code: 'BACKUP_CONFIGURATION_OR_VERIFICATION_FAILED', secret: 'private-password' }) })
      .mockReturnValueOnce({ status: 1, stdout: 'private-raw-error', stderr: 'private-endpoint' });
    expect(runBackup({ env: ENV, spawnSync, appRoot: '/srv/finanzas', writeSummary: output })).toBe(1);
    expect(output).toHaveBeenCalledWith({ status: 'failed', code: 'BACKUP_CONFIGURATION_OR_VERIFICATION_FAILED', backupAlertPending: true });
    expect(JSON.stringify(output.mock.calls)).not.toMatch(/private/);
  });
  test('unknown child output is replaced with a safe code rather than printed', () => {
    const output = jest.fn();
    const spawnSync = jest.fn(() => ({ status: 1, stdout: 'private-db-password', stderr: 'private-db-password' }));
    expect(runBackup({ env: ENV, spawnSync, appRoot: '/srv/finanzas', writeSummary: output })).toBe(1);
    expect(output).toHaveBeenCalledWith({ status: 'failed', code: 'BACKUP_RUNNER_CHILD_FAILED' });
    expect(spawnSync).toHaveBeenCalledTimes(1);
  });
});

describe('backup notification adapter', () => {
  test('queries only configured owner in a read-only transaction and sends minimal operational payload', async () => {
    const dep = dependencies();
    const result = await notifyEvent({ type: 'disk-high', usedPercent: 85 }, dep);
    expect(result).toEqual({ delivered: true, subscriptions: 1, deliveredCount: 1, failedCount: 0 });
    expect(dep.client.query.mock.calls).toEqual([
      ['BEGIN TRANSACTION READ ONLY'],
      ['SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = $1', ['owner-only']],
      ['COMMIT'],
    ]);
    expect(dep.Pool).toHaveBeenCalledWith(expect.objectContaining({ options: '-c default_transaction_read_only=on', max: 1 }));
    expect(dep.client.release).toHaveBeenCalledTimes(1);
    expect(dep.pool.end).toHaveBeenCalledTimes(1);
    const [subscription, serialized, options] = dep.webpush.sendNotification.mock.calls[0];
    expect(subscription).toEqual({ endpoint: SUB.endpoint, keys: { p256dh: SUB.p256dh, auth: SUB.auth } });
    expect(JSON.parse(serialized)).toMatchObject({ title: 'Finanzas Personales', url: '/settings' });
    expect(JSON.parse(serialized).body).toMatch(/85/);
    expect(options).toMatchObject({ timeout: 15000 });
    expect(serialized).not.toMatch(/owner-only|password|private-endpoint|private-auth/);
  });
  test('missing subscriptions are explicitly undelivered and never claim delivery', async () => {
    const dep = dependencies([]);
    expect(await notifyEvent({ type: 'backup-failed' }, dep)).toEqual({ delivered: false, subscriptions: 0, deliveredCount: 0, failedCount: 0, reason: 'no-subscriptions' });
    expect(dep.webpush.sendNotification).not.toHaveBeenCalled();
  });
  test('expired and failed subscriptions remain untouched; sensitive errors are omitted', async () => {
    const dep = dependencies([SUB, { ...SUB, endpoint: 'second-private' }]);
    dep.webpush.sendNotification.mockRejectedValueOnce({ statusCode: 410, message: SUB.endpoint }).mockRejectedValueOnce(new Error('private-vapid'));
    const result = await notifyEvent({ type: 'backup-failed' }, dep);
    expect(result).toEqual({ delivered: false, subscriptions: 2, deliveredCount: 0, failedCount: 2, reason: 'delivery-failed' });
    expect(dep.client.query.mock.calls.flat().join(' ')).not.toMatch(/DELETE|UPDATE|INSERT/);
    expect(JSON.stringify(result)).not.toMatch(/private|410/);
  });
  test('one successful device is sufficient while failures remain counted', async () => {
    const dep = dependencies([SUB, SUB]);
    dep.webpush.sendNotification.mockRejectedValueOnce(new Error('private-error')).mockResolvedValueOnce({});
    expect(await notifyEvent({ type: 'backup-failed' }, dep)).toEqual({ delivered: true, subscriptions: 2, deliveredCount: 1, failedCount: 1 });
  });
  test.each([
    null, { type: 'other' }, { type: 'disk-high' }, { type: 'disk-high', usedPercent: 84.9 },
    { type: 'disk-high', usedPercent: 101 }, { type: 'backup-failed', body: 'injected' },
  ])('rejects malformed event before reading credentials or accessing database (%j)', async event => {
    const dep = dependencies();
    expect(await notifyEvent(event, dep)).toMatchObject({ delivered: false, reason: 'invalid-event' });
    expect(dep.Pool).not.toHaveBeenCalled();
    expect(dep.webpush.setVapidDetails).not.toHaveBeenCalled();
  });
  test('missing private configuration is safely undelivered and database is not accessed', async () => {
    const dep = dependencies();
    expect(await notifyEvent({ type: 'backup-failed' }, { ...dep, env: {} })).toMatchObject({ delivered: false, reason: 'not-configured' });
    expect(dep.Pool).not.toHaveBeenCalled();
  });
  test('database exception rolls back, releases, closes, and never returns raw detail', async () => {
    const dep = dependencies();
    dep.client.query.mockImplementation(async sql => { if (/SELECT/.test(sql)) throw new Error('private-db-password'); return { rows: [] }; });
    const result = await notifyEvent({ type: 'backup-failed' }, dep);
    expect(result).toMatchObject({ delivered: false, reason: 'database-unavailable' });
    expect(dep.client.query).toHaveBeenLastCalledWith('ROLLBACK');
    expect(dep.client.release).toHaveBeenCalledTimes(1);
    expect(dep.pool.end).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(result)).not.toContain('private-db-password');
  });
});

test('systemd timer is Chile 03:30 with no missed-run catchup and private bounded service', () => {
  const directory = path.resolve(__dirname, '../../../automation/backups');
  expect(fs.readFileSync(path.join(directory, 'finanzas-backup.timer'), 'utf8')).toMatch(/OnCalendar=\*-\*-\* 03:30:00 America\/Santiago/);
  expect(fs.readFileSync(path.join(directory, 'finanzas-backup.timer'), 'utf8')).toMatch(/Persistent=false/);
  const service = fs.readFileSync(path.join(directory, 'finanzas-backup.service'), 'utf8');
  expect(service).toMatch(/Type=oneshot/);
  expect(service).toMatch(/UMask=0077/);
  expect(service).toMatch(/TimeoutStartSec=20min/);
  expect(service).not.toMatch(/docker (stop|restart)|pm2|pg_restore.*--dbname/);
});

test('example preserves the private Docker Compose interpolation environment for recovery', () => {
  const config = require('../../../automation/backups/config.example.json');
  expect(config.privateFiles['docker-compose.env']).toBe('/home/rocketflow/n8n-docker-caddy/.env');
});
