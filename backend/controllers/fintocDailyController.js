const { createHash } = require('crypto');
const { spaceReadOwner } = require('../utils/spaceReadOwner');
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
      return res.json(await getService().getDailyStatus(spaceReadOwner(req)));
    } catch (failure) { return safeError(res, failure); }
  }

  async function getReview(req, res) {
    try {
      const result = await getService().getReview(spaceReadOwner(req), req.query || {});
      if (req.spacePerms?.isOwner === false) {
        return res.json({ total: result.total, limit: result.limit, offset: result.offset,
          items: (result.items || []).map(item => ({
            externalId: 'movement_' + createHash('sha256').update(String(item.externalId)).digest('hex'),
            date: item.date, description: item.description, type: item.type, amount: item.amount,
            status: item.status, reason: item.reason, candidateCount: item.candidateCount,
          })) });
      }
      return res.json(result);
    }
    catch (failure) { return safeError(res, failure); }
  }

  return { getDailyStatus, getReview };
}

module.exports = { createFintocDailyController, ...createFintocDailyController() };
