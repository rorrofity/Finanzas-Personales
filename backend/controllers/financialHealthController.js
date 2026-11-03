const db = require('../config/database');
const { createFinancialHealthController } = require('../services/financialHealthSummaryService');
const { getSummary } = createFinancialHealthController({ db });

/**
 * Obtiene alertas del usuario
 */
const getAlerts = async (req, res) => {
  try {
    const userId = req.user.id;
    
    const result = await db.query(`
      SELECT id, alert_type, severity, title, message, 
             related_month, related_year, is_read, created_at
      FROM financial_alerts
      WHERE user_id = $1 AND is_dismissed = false
      ORDER BY 
        CASE severity 
          WHEN 'critical' THEN 1 
          WHEN 'warning' THEN 2 
          ELSE 3 
        END,
        created_at DESC
      LIMIT 20
    `, [userId]);

    res.json({ alerts: result.rows });
  } catch (error) {
    console.error('Error en getAlerts:', error);
    res.status(500).json({ error: 'Error al obtener alertas' });
  }
};

/**
 * Descarta una alerta
 */
const dismissAlert = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    await db.query(`
      UPDATE financial_alerts
      SET is_dismissed = true
      WHERE id = $1 AND user_id = $2
    `, [id, userId]);

    res.json({ success: true });
  } catch (error) {
    console.error('Error en dismissAlert:', error);
    res.status(500).json({ error: 'Error al descartar alerta' });
  }
};

/**
 * Marca alerta como leída
 */
const markAlertRead = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    await db.query(`
      UPDATE financial_alerts
      SET is_read = true
      WHERE id = $1 AND user_id = $2
    `, [id, userId]);

    res.json({ success: true });
  } catch (error) {
    console.error('Error en markAlertRead:', error);
    res.status(500).json({ error: 'Error al marcar alerta como leída' });
  }
};

module.exports = {
  createFinancialHealthController,
  getSummary,
  getAlerts,
  dismissAlert,
  markAlertRead
};
