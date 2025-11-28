/**
 * Financial Health Routes
 * Endpoints para el sistema de salud financiera
 */

const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const {
  getSummary,
  getAlerts,
  dismissAlert,
  markAlertRead
} = require('../controllers/financialHealthController');

// Todas las rutas requieren autenticación
router.use(auth);

// GET /api/financial-health/summary - Resumen de salud financiera
router.get('/summary', getSummary);

// GET /api/financial-health/alerts - Lista de alertas
router.get('/alerts', getAlerts);

// PUT /api/financial-health/alerts/:id/dismiss - Descartar alerta
router.put('/alerts/:id/dismiss', dismissAlert);

// PUT /api/financial-health/alerts/:id/read - Marcar como leída
router.put('/alerts/:id/read', markAlertRead);

module.exports = router;
