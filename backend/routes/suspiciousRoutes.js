const express = require('express');
const router = express.Router();
const { auth: authenticateToken } = require('../middleware/auth');
const { 
  getPendingSuspicious, 
  countPendingSuspicious,
  resolveSuspicious 
} = require('../utils/suspiciousDetector');
const IntlUnbilled = require('../models/IntlUnbilled');
const db = require('../config/database');

const intlModel = new IntlUnbilled(db);

/**
 * GET /api/suspicious/count
 * Obtiene el conteo de transacciones sospechosas pendientes (nacionales + intl)
 */
router.get('/count', authenticateToken, async (req, res) => {
  try {
    const nationalCount = await countPendingSuspicious(req.user.id);
    const intlCount = await intlModel.countPendingSuspicious(req.user.id);
    res.json({ count: nationalCount + intlCount, national: nationalCount, intl: intlCount });
  } catch (error) {
    console.error('Error obteniendo conteo de sospechosos:', error);
    res.status(500).json({ error: 'Error al obtener conteo de transacciones sospechosas' });
  }
});

/**
 * GET /api/suspicious
 * Obtiene todas las transacciones sospechosas pendientes de revisión (nacionales + intl)
 */
router.get('/', authenticateToken, async (req, res) => {
  try {
    // Obtener duplicados nacionales
    const nationalSuspicious = await getPendingSuspicious(req.user.id);
    
    // Obtener duplicados internacionales y normalizarlos al mismo formato
    const intlSuspicious = await intlModel.getPendingSuspicious(req.user.id);
    const normalizedIntl = intlSuspicious.map(item => ({
      suspicious_id: item.suspicious_id,
      detected_at: item.detected_at,
      transaction1_id: item.intl1_id,
      fecha1: item.fecha1,
      descripcion1: item.descripcion1,
      monto1: item.amount_clp1, // Usar CLP para consistencia visual
      amount_usd1: item.amount_usd1,
      imported1_at: item.imported1_at,
      transaction2_id: item.intl2_id,
      fecha2: item.fecha2,
      descripcion2: item.descripcion2,
      monto2: item.amount_clp2,
      amount_usd2: item.amount_usd2,
      imported2_at: item.imported2_at,
      type: 'intl' // Marcar como internacional para el frontend
    }));
    
    // Marcar nacionales
    const normalizedNational = nationalSuspicious.map(item => ({
      ...item,
      type: 'national'
    }));
    
    // Combinar y ordenar por fecha de detección
    const combined = [...normalizedNational, ...normalizedIntl]
      .sort((a, b) => new Date(b.detected_at) - new Date(a.detected_at));
    
    res.json({ suspicious: combined });
  } catch (error) {
    console.error('Error obteniendo transacciones sospechosas:', error);
    res.status(500).json({ error: 'Error al obtener transacciones sospechosas' });
  }
});

/**
 * POST /api/suspicious/:id/resolve
 * Resuelve un duplicado sospechoso (nacional o intl)
 * Body: { action: 'delete' | 'keep_both', transactionIdToDelete?: string, type?: 'national' | 'intl' }
 */
router.post('/:id/resolve', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { action, transactionIdToDelete, type } = req.body;

    if (!action || !['delete', 'keep_both'].includes(action)) {
      return res.status(400).json({ 
        error: 'Acción inválida. Debe ser "delete" o "keep_both"' 
      });
    }

    if (action === 'delete' && !transactionIdToDelete) {
      return res.status(400).json({ 
        error: 'Se requiere transactionIdToDelete cuando action es "delete"' 
      });
    }

    let result;
    if (type === 'intl') {
      // Resolver duplicado internacional
      result = await intlModel.resolveSuspicious(id, action, req.user.id, transactionIdToDelete);
    } else {
      // Resolver duplicado nacional (default)
      result = await resolveSuspicious(id, action, req.user.id, transactionIdToDelete);
    }

    if (!result.success) {
      return res.status(500).json({ 
        error: result.error || 'Error al resolver duplicado sospechoso' 
      });
    }

    res.json({ 
      success: true, 
      message: action === 'delete' 
        ? 'Transacción duplicada eliminada exitosamente' 
        : 'Ambas transacciones marcadas como válidas'
    });
  } catch (error) {
    console.error('Error resolviendo duplicado sospechoso:', error);
    res.status(500).json({ error: 'Error al resolver duplicado sospechoso' });
  }
});

module.exports = router;
