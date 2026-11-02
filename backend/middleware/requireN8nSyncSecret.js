const crypto = require('crypto');

function configuredSyncOwner(env = process.env) {
  const owner = env.N8N_SYNC_OWNER_USER_ID || env.CARD_STATEMENTS_OWNER_USER_ID || env.FINTOC_OWNER_USER_ID;
  return typeof owner === 'string' && owner ? owner : null;
}

/** Internal N8N channel only; reject before accepting or recording financial payloads. */
function createN8nSyncGuard(env = process.env) {
  return function requireN8nSyncSecret(req, res, next) {
    const expected = env.N8N_SYNC_SECRET;
    if (typeof expected !== 'string' || !expected) {
      return res.status(503).json({ error: 'La sincronización no está configurada.', code: 'N8N_SYNC_NOT_CONFIGURED' });
    }
    const provided = req.headers?.['x-finanzas-sync-key'];
    const digest = value => crypto.createHash('sha256').update(value).digest();
    if (typeof provided !== 'string' || !provided || provided.length > 2048 || !crypto.timingSafeEqual(digest(provided), digest(expected))) {
      return res.status(401).json({ error: 'Sincronización no autorizada.', code: 'N8N_SYNC_UNAUTHORIZED' });
    }
    const owner = configuredSyncOwner(env);
    if (!owner) return res.status(503).json({ error: 'La cuenta de sincronización no está configurada.', code: 'N8N_SYNC_NOT_CONFIGURED' });
    const target = req.body?.userId ?? req.query?.userId;
    if (target !== undefined && target !== owner) {
      return res.status(403).json({ error: 'Esta cuenta no puede utilizar la sincronización bancaria.', code: 'N8N_SYNC_FORBIDDEN' });
    }
    return next();
  };
}
module.exports = { configuredSyncOwner, createN8nSyncGuard, requireN8nSyncSecret: createN8nSyncGuard() };
