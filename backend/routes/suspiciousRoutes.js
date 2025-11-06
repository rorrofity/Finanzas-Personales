const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/authMiddleware');
const { 
  getPendingSuspicious, 
  countPendingSuspicious,
  resolveSuspicious 
} = require('../utils/suspiciousDetector');

/**
 * GET /api/suspicious/count
 * Obtiene el conteo de transacciones sospechosas pendientes
 */
router.get('/count', authenticateToken, async (req, res) => {
  try {
    const count = await countPendingSuspicious(req.user.id);
    res.json({ count });
  } catch (error) {
    console.error('Error obteniendo conteo de sospechosos:', error);
    res.status(500).json({ error: 'Error al obtener conteo de transacciones sospechosas' });
  }
});

/**
 * GET /api/suspicious
 * Obtiene todas las transacciones sospechosas pendientes de revisión
 */
router.get('/', authenticateToken, async (req, res) => {
  try {
    const suspicious = await getPendingSuspicious(req.user.id);
    res.json({ suspicious });
  } catch (error) {
    console.error('Error obteniendo transacciones sospechosas:', error);
    res.status(500).json({ error: 'Error al obtener transacciones sospechosas' });
  }
});

/**
 * POST /api/suspicious/:id/resolve
 * Resuelve un duplicado sospechoso
 * Body: { action: 'delete' | 'keep_both', transactionIdToDelete?: string }
 */
router.post('/:id/resolve', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { action, transactionIdToDelete } = req.body;

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

    const result = await resolveSuspicious(id, action, req.user.id, transactionIdToDelete);

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
