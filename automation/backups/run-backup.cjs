'use strict';

const path = require('path');
const { spawnSync: defaultSpawnSync } = require('child_process');

function buildChildEnvironment(env) {
  return {
    ...env,
    PGHOST: env.DB_HOST || env.PGHOST || 'localhost',
    PGPORT: env.DB_PORT || env.PGPORT || '5432',
    PGDATABASE: env.DB_NAME || env.PGDATABASE || 'finanzas_personales',
    PGUSER: env.DB_USER || env.PGUSER || '',
    PGPASSWORD: env.DB_PASSWORD || env.PGPASSWORD || '',
    PGAPPNAME: 'finanzas-backup',
    PGCONNECT_TIMEOUT: '15',
    // Last setting wins, so an inherited option cannot enable writes.
    PGOPTIONS: `${env.PGOPTIONS || ''} -c default_transaction_read_only=on`.trim(),
  };
}

function safeSummary(value) {
  if (!value || !['ok', 'skipped', 'failed'].includes(value.status)) return { status: 'failed', code: 'BACKUP_RUNNER_CHILD_FAILED' };
  const result = { status: value.status };
  if (typeof value.code === 'string' && /^[A-Z][A-Z0-9_]{0,79}$/.test(value.code)) result.code = value.code;
  if (value.reason === 'locked') result.reason = 'locked';
  if (typeof value.archive === 'string' && /^backup-\d{4}-\d{2}-\d{2}\.tar\.gz$/.test(value.archive)) result.archive = value.archive;
  for (const key of ['verified', 'existingVerified', 'diskAlertPending', 'backupAlertPending']) {
    if (typeof value[key] === 'boolean') result[key] = value[key];
  }
  for (const key of ['dailyCopies', 'weeklyCopies']) {
    if (Number.isInteger(value[key]) && value[key] >= 0 && value[key] <= 1000) result[key] = value[key];
  }
  if (typeof value.diskUsedPercent === 'number' && value.diskUsedPercent >= 0 && value.diskUsedPercent <= 100) result.diskUsedPercent = value.diskUsedPercent;
  return result;
}

function parseSummary(text) {
  try { return JSON.parse(String(text || '')); } catch (_) { return null; }
}

function runBackup({ argv = [], env = process.env, spawnSync = defaultSpawnSync, appRoot = path.resolve(__dirname, '../..'), writeSummary = () => {} } = {}) {
  const args = [...argv];
  if (!args.includes('--config')) args.unshift('--config', '/etc/finanzas-backup/config.json');
  try {
    const child = spawnSync('/usr/bin/python3', [path.join(appRoot, 'automation/backups/daily_backup.py'), ...args], {
      cwd: appRoot,
      env: buildChildEnvironment(env),
      stdio: ['ignore', 'pipe', 'ignore'],
      encoding: 'utf8',
      maxBuffer: 64 * 1024,
      timeout: 19 * 60 * 1000,
      killSignal: 'SIGTERM',
    });
    const result = safeSummary(parseSummary(child.stdout));
    const status = Number.isInteger(child.status) ? child.status : 1;
    // The engine's normal failure path already sends/deduplicates its own alert.
    // Its pre-engine configuration/verification catch has no alert state yet.
    if (result.status === 'failed' && result.code === 'BACKUP_CONFIGURATION_OR_VERIFICATION_FAILED' && !Object.prototype.hasOwnProperty.call(result, 'backupAlertPending')) {
      let delivered = false;
      try {
        const notification = spawnSync(process.execPath, [path.join(appRoot, 'automation/backups/notify-backup.cjs')], {
          cwd: appRoot, env: buildChildEnvironment(env),
          input: JSON.stringify({ type: 'backup-failed' }),
          stdio: ['pipe', 'pipe', 'ignore'], encoding: 'utf8',
          maxBuffer: 16 * 1024, timeout: 30000, killSignal: 'SIGTERM',
        });
        delivered = notification.status === 0 && parseSummary(notification.stdout)?.delivered === true;
      } catch (_) { /* A missing notification channel leaves the alert pending. */ }
      result.backupAlertPending = !delivered;
    }
    writeSummary(result);
    return status === 0 && result.status === 'failed' ? 1 : status;
  } catch (_) {
    writeSummary({ status: 'failed', code: 'BACKUP_RUNNER_CHILD_FAILED' });
    return 1;
  }
}

if (require.main === module) {
  const appRoot = path.resolve(__dirname, '../..');
  try {
    const loaded = require('dotenv').config({ path: path.join(appRoot, '.env') });
    if (loaded.error) throw new Error('PRIVATE_CONFIGURATION_UNAVAILABLE');
    process.exitCode = runBackup({ appRoot, argv: process.argv.slice(2), writeSummary: result => process.stdout.write(JSON.stringify(result) + '\n') });
  } catch (_) {
    process.stdout.write(JSON.stringify({ status: 'failed', code: 'BACKUP_RUNNER_UNAVAILABLE' }) + '\n');
    process.exitCode = 1;
  }
}

module.exports = { buildChildEnvironment, runBackup };
