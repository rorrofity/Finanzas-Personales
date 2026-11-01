const service = require('../services/fintocReadOnlyService');

function respondError(res, failure) {
  if (failure instanceof service.FintocReadOnlyError) {
    return res.status(failure.status).json({ error: failure.message, code: failure.code });
  }
  return res.status(500).json({ error: 'No se pudo completar la consulta bancaria.', code: 'FINTOC_INTERNAL_ERROR' });
}

function requireConfiguredOwner(req, res, next) {
  try {
    service.assertOwner(req.actorId);
    return next();
  } catch (failure) { return respondError(res, failure); }
}

function getStatus(req, res) {
  try { return res.json(service.getStatus(req.actorId, req.query)); }
  catch (failure) { return respondError(res, failure); }
}

async function preview(req, res) {
  try { return res.json(await service.preview(req.actorId, req.query)); }
  catch (failure) { return respondError(res, failure); }
}

module.exports = { getStatus, preview, requireConfiguredOwner };
