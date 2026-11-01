let defaultService;
function loadDefaultService() {
  if (!defaultService) {
    const database = require('../config/database');
    const { createFintocDailySyncService } = require('../services/fintocDailySyncService');
    defaultService = createFintocDailySyncService({
      db: database.pool || database,
      provider: require('../services/fintocReadOnlyService'),
      env: process.env,
    });
  }
  return defaultService;
}

function safeError(res, failure) {
  const knownStatus = [400, 401, 403, 409, 429, 500, 502, 503, 504].includes(failure?.status);
  const knownCode = typeof failure?.code === 'string' && /^FINTOC_[A-Z0-9_]{1,64}$/.test(failure.code);
  const status = knownStatus && knownCode ? failure.status : 500;
  const code = knownStatus && knownCode ? failure.code : 'FINTOC_DAILY_INTERNAL_ERROR';
  const message = status === 400 ? 'Selecciona parámetros válidos para esta consulta.'
    : status === 403 ? 'La conexión solo está disponible para su titular.'
      : 'No se pudo consultar el estado de la sincronización bancaria.';
  return res.status(status).json({ error: message, code });
}

function createFintocDailyController({ getService = loadDefaultService } = {}) {
  async function getDailyStatus(req, res) {
    try {
      const query = req.query || {};
      if (typeof query !== 'object' || Array.isArray(query) || Object.keys(query).length) {
        return res.status(400).json({ error: 'Esta consulta no acepta parámetros.', code: 'FINTOC_DAILY_INVALID_QUERY' });
      }
      return res.json(await getService().getDailyStatus(req.actorId));
    } catch (failure) { return safeError(res, failure); }
  }

  async function getReview(req, res) {
    try { return res.json(await getService().getReview(req.actorId, req.query || {})); }
    catch (failure) { return safeError(res, failure); }
  }

  return { getDailyStatus, getReview };
}

module.exports = { createFintocDailyController, ...createFintocDailyController() };
