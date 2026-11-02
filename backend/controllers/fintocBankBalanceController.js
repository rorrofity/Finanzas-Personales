const { spaceReadOwner } = require('../utils/spaceReadOwner');
function createFintocBankBalanceController({ getService = () => require('../services/fintocBankBalanceService') } = {}) {
  async function getBankBalance(req, res) {
    try {
      const query = req.query || {};
      if (typeof query !== 'object' || Array.isArray(query) || Object.keys(query).length) {
        return res.status(400).json({ error: 'Esta consulta no acepta parámetros.', code: 'FINTOC_BALANCE_INVALID_QUERY' });
      }
      return res.json(await getService().getBankBalance(spaceReadOwner(req)));
    } catch (failure) {
      const known = typeof failure?.code === 'string' && /^FINTOC_[A-Z0-9_]{1,64}$/.test(failure.code)
        && [400, 401, 403, 429, 500, 502, 503, 504].includes(failure.status);
      return res.status(known ? failure.status : 500).json({
        error: failure?.status === 403 ? 'El saldo bancario solo está disponible para su titular.' : 'No se pudo consultar el saldo bancario.',
        code: known ? failure.code : 'FINTOC_BALANCE_INTERNAL_ERROR',
      });
    }
  }
  return { getBankBalance };
}
module.exports = { createFintocBankBalanceController, ...createFintocBankBalanceController() };
