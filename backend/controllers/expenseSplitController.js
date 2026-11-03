const { spaceReadOwner } = require('../utils/spaceReadOwner');

function createExpenseSplitController({ getService = () => require('../services/expenseSplitService') } = {}) {
  const invoke = action => async (req, res) => {
    try {
      if (action === 'get' && (!req.query || typeof req.query !== 'object' || Array.isArray(req.query) || Object.keys(req.query).length)) {
        return res.status(400).json({ error: 'La consulta no acepta parámetros.', code: 'EXPENSE_SPLIT_INVALID' });
      }
      const owner = spaceReadOwner(req), args = [owner, req.params.source, req.params.id];
      if (action !== 'get') args.push(req.body, req.actorId || req.user.id);
      return res.json(await getService()[action](...args));
    } catch (error) {
      const known = [400, 404, 409].includes(error.status) && /^EXPENSE_SPLIT_[A-Z_]+$/.test(error.code || '');
      const status = known ? error.status : 500;
      const messages = { 400: 'Revisa los montos y categorías de la división.', 404: 'Movimiento no encontrado.', 409: 'El movimiento cambió. Recarga la división antes de continuar.', 500: 'No se pudo consultar o guardar la división.' };
      return res.status(status).json({ error: messages[status], code: known ? error.code : 'EXPENSE_SPLIT_INTERNAL_ERROR' });
    }
  };
  return { get: invoke('get'), put: invoke('put'), remove: invoke('remove') };
}
module.exports = { createExpenseSplitController, ...createExpenseSplitController() };
