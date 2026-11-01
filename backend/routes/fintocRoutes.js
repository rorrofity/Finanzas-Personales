const express = require('express');
const { auth } = require('../middleware/auth');
const { resolveSpace } = require('../middleware/resolveSpace');
const { requireOwner } = require('../middleware/requirePermission');
const { getStatus, preview, requireConfiguredOwner } = require('../controllers/fintocReadOnlyController');

const router = express.Router();

// This namespace is always private and never participates in offline caches.
router.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Vary', 'Authorization, X-Space-Owner');
  next();
});
router.use(auth, resolveSpace, requireOwner, requireConfiguredOwner);
router.use((req, res, next) => {
  if (req.method === 'GET') return next();
  res.setHeader('Allow', 'GET');
  return res.status(405).json({ error: 'La conexión solo permite consultas de lectura.', code: 'FINTOC_METHOD_NOT_ALLOWED' });
});
router.get('/status', getStatus);
router.get('/preview', preview);
router.use((req, res) => res.status(404).json({ error: 'Consulta bancaria no disponible.', code: 'FINTOC_NOT_FOUND' }));

module.exports = router;
