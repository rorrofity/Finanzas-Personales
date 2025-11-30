const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const db = require('../config/database');

/**
 * GET /api/billing/periods
 * Get all billing periods for the user
 */
router.get('/periods', auth, async (req, res) => {
  try {
    const result = await db.query(`
      SELECT * FROM billing_periods 
      WHERE user_id = $1 
      ORDER BY billing_year DESC, billing_month DESC
    `, [req.user.id]);
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error getting billing periods:', error);
    res.status(500).json({ error: 'Error al obtener períodos de facturación' });
  }
});

/**
 * GET /api/billing/periods/:year/:month
 * Get a specific billing period
 */
router.get('/periods/:year/:month', auth, async (req, res) => {
  try {
    const { year, month } = req.params;
    
    const result = await db.query(`
      SELECT * FROM billing_periods 
      WHERE user_id = $1 AND billing_year = $2 AND billing_month = $3
    `, [req.user.id, year, month]);
    
    if (result.rows.length === 0) {
      // Return a suggested period based on default rule (day 22)
      const prevMonth = parseInt(month) === 1 ? 12 : parseInt(month) - 1;
      const prevYear = parseInt(month) === 1 ? parseInt(year) - 1 : parseInt(year);
      const prevPrevMonth = prevMonth === 1 ? 12 : prevMonth - 1;
      const prevPrevYear = prevMonth === 1 ? prevYear - 1 : prevYear;
      
      return res.json({
        exists: false,
        suggested: {
          billing_year: parseInt(year),
          billing_month: parseInt(month),
          period_start: `${prevPrevYear}-${String(prevPrevMonth).padStart(2, '0')}-23`,
          period_end: `${prevYear}-${String(prevMonth).padStart(2, '0')}-22`
        }
      });
    }
    
    res.json({ exists: true, period: result.rows[0] });
  } catch (error) {
    console.error('Error getting billing period:', error);
    res.status(500).json({ error: 'Error al obtener período de facturación' });
  }
});

/**
 * POST /api/billing/periods
 * Create or update a billing period
 */
router.post('/periods', auth, async (req, res) => {
  try {
    const { billing_year, billing_month, period_start, period_end } = req.body;
    
    // Validate inputs
    if (!billing_year || !billing_month || !period_start || !period_end) {
      return res.status(400).json({ error: 'Faltan campos requeridos' });
    }
    
    // Upsert the billing period
    const result = await db.query(`
      INSERT INTO billing_periods (user_id, billing_year, billing_month, period_start, period_end)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (user_id, billing_year, billing_month)
      DO UPDATE SET 
        period_start = EXCLUDED.period_start,
        period_end = EXCLUDED.period_end,
        updated_at = NOW()
      RETURNING *
    `, [req.user.id, billing_year, billing_month, period_start, period_end]);
    
    res.json({ 
      success: true, 
      period: result.rows[0],
      message: 'Período de facturación guardado'
    });
  } catch (error) {
    console.error('Error saving billing period:', error);
    res.status(500).json({ error: 'Error al guardar período de facturación' });
  }
});

/**
 * POST /api/billing/recalculate/:year/:month
 * Recalculate transactions for a billing period
 * Finds all transactions within the period's date range and assigns them to this billing period
 */
router.post('/recalculate/:year/:month', auth, async (req, res) => {
  try {
    const { year, month } = req.params;
    const userId = req.user.id;
    
    // Get the billing period configuration
    const periodResult = await db.query(`
      SELECT * FROM billing_periods 
      WHERE user_id = $1 AND billing_year = $2 AND billing_month = $3
    `, [userId, year, month]);
    
    if (periodResult.rows.length === 0) {
      return res.status(404).json({ error: 'Período de facturación no configurado' });
    }
    
    const period = periodResult.rows[0];
    
    // Update transactions that fall within this period's date range
    const updateResult = await db.query(`
      UPDATE transactions
      SET 
        billing_year = $1,
        billing_month = $2,
        updated_at = NOW()
      WHERE user_id = $3
        AND fecha >= $4
        AND fecha <= $5
      RETURNING id
    `, [
      period.billing_year,
      period.billing_month,
      userId,
      period.period_start,
      period.period_end
    ]);
    
    const updatedCount = updateResult.rows.length;
    
    res.json({
      success: true,
      message: `${updatedCount} transacciones actualizadas`,
      updated: updatedCount,
      period: {
        billing_year: period.billing_year,
        billing_month: period.billing_month,
        period_start: period.period_start,
        period_end: period.period_end
      }
    });
  } catch (error) {
    console.error('Error recalculating transactions:', error);
    res.status(500).json({ error: 'Error al recalcular transacciones' });
  }
});

/**
 * DELETE /api/billing/periods/:year/:month
 * Delete a billing period configuration
 */
router.delete('/periods/:year/:month', auth, async (req, res) => {
  try {
    const { year, month } = req.params;
    
    await db.query(`
      DELETE FROM billing_periods 
      WHERE user_id = $1 AND billing_year = $2 AND billing_month = $3
    `, [req.user.id, year, month]);
    
    res.json({ success: true, message: 'Período eliminado' });
  } catch (error) {
    console.error('Error deleting billing period:', error);
    res.status(500).json({ error: 'Error al eliminar período' });
  }
});

module.exports = router;
