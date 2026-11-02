const express = require('express');
const { auth } = require('../middleware/auth');
const { resolveSpace } = require('../middleware/resolveSpace');
const { requireOwner } = require('../middleware/requirePermission');
const { getStatus, preview, requireConfiguredOwner } = require('../controllers/fintocReadOnlyController');
const { getDailyStatus, getReview } = require('../controllers/fintocDailyController');

const { getBankBalance } = require('../controllers/fintocBankBalanceController');

const router = express.Router();

// This namespace is always private and never participates in offline caches.
router.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Vary', 'Authorization, X-Space-Owner');
  next();
});
router.use(auth, resolveSpace);
router.use((req, res, next) => {
  if (req.method === 'GET') return next();
  res.setHeader('Allow', 'GET');
  return res.status(405).json({ error: 'La conexión solo permite consultas de lectura.', code: 'FINTOC_METHOD_NOT_ALLOWED' });
});
router.get('/status', requireOwner, requireConfiguredOwner, getStatus);
router.get('/preview', requireOwner, requireConfiguredOwner, preview);
function requireSavedSpaceOwner(req, res, next) {
  const target = require('../utils/spaceReadOwner').spaceReadOwner(req);
  const configuredOwner = process.env.FINTOC_OWNER_USER_ID;
  if ((configuredOwner && target !== configuredOwner) || (!configuredOwner && !req.spacePerms?.isOwner)) {
    return res.status(403).json({ error: 'No tienes acceso a esta información bancaria.', code: 'FINTOC_FORBIDDEN' });
  }
  return next();
}
router.get('/daily-status', requireSavedSpaceOwner, getDailyStatus);
router.get('/review', requireSavedSpaceOwner, getReview);
router.get('/bank-balance', requireSavedSpaceOwner, getBankBalance);
router.use((req, res) => res.status(404).json({ error: 'Consulta bancaria no disponible.', code: 'FINTOC_NOT_FOUND' }));

module.exports = router;
