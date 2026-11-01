const SCHEDULE = '07:00';
const EXPRESSION = '0 7 * * *';
const TIMEZONE = 'America/Santiago';

let defaultService;
function loadDefaultService() {
  if (!defaultService) {
    const database = require('../config/database');
    const { createFintocDailySyncService } = require('./fintocDailySyncService');
    defaultService = createFintocDailySyncService({
      db: database.pool || database,
      provider: require('./fintocReadOnlyService'),
      env: process.env,
    });
  }
  return defaultService;
}

function createFintocDailyScheduler({ env = process.env, cron, service = loadDefaultService, logger = console } = {}) {
  let task = null;
  let running = false;
  const allowed = () => env.FINTOC_ENABLED === 'true'
    && env.FINTOC_PERSONAL_FREE_ACCESS_CONFIRMED === 'true'
    && env.FINTOC_DAILY_SYNC_ENABLED === 'true';
  const state = () => ({ scheduled: Boolean(task), schedule: SCHEDULE, timezone: TIMEZONE });
  const safeCode = (failure) => typeof failure?.code === 'string' && /^FINTOC_[A-Z0-9_]{1,64}$/.test(failure.code)
    ? failure.code : 'FINTOC_DAILY_FAILED';

  async function execute() {
    if (!allowed() || running) return;
    running = true;
    try {
      const engine = typeof service === 'function' ? service() : service;
      const result = await engine.run({ trigger: 'scheduled' });
      if (result?.status === 'error') logger.warn('[fintoc-daily] execution failed', safeCode({ code: result.errorCode }));
      return result;
    } catch (failure) {
      logger.warn('[fintoc-daily] execution failed', safeCode(failure));
      return undefined;
    } finally {
      running = false;
    }
  }

  function stop() {
    if (task) {
      task.stop();
      if (typeof task.destroy === 'function') task.destroy();
      task = null;
    }
  }

  function start() {
    if (!allowed()) {
      stop();
      return state();
    }
    if (!task) {
      try {
        task = (cron || require('node-cron')).schedule(EXPRESSION, execute, { timezone: TIMEZONE });
        logger.info('[fintoc-daily] scheduled 07:00 America/Santiago');
      } catch (_) {
        logger.warn('[fintoc-daily] scheduling failed', 'FINTOC_DAILY_SCHEDULE_ERROR');
      }
    }
    return state();
  }

  return { start, stop, getState: state };
}

module.exports = { createFintocDailyScheduler, ...createFintocDailyScheduler() };
