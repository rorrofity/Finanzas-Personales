/**
 * Financial Health Controller
 * Calcula y retorna el estado de salud financiera del usuario
 */

const db = require('../config/database');

/**
 * Calcula el health score basado en la proyección
 */
function calculateHealthScore(projectedBalance, totalCommitments, currentBalance) {
  if (totalCommitments === 0 || currentBalance === 0) {
    return { score: 50, status: 'unknown' };
  }

  const coverageRatio = currentBalance / totalCommitments;
  let score = 50;

  if (projectedBalance > 0) {
    const retentionRate = projectedBalance / currentBalance;
    score += Math.min(retentionRate * 50, 50);
  } else {
    const deficitRate = Math.abs(projectedBalance) / totalCommitments;
    score -= Math.min(deficitRate * 50, 50);
  }

  if (coverageRatio > 2) score += 10;
  if (coverageRatio > 3) score += 10;

  score = Math.max(0, Math.min(100, Math.round(score)));

  let status;
  if (score >= 80) status = 'excellent';
  else if (score >= 60) status = 'healthy';
  else if (score >= 40) status = 'warning';
  else status = 'critical';

  return { score, status };
}

/**
 * Obtiene el resumen de salud financiera
 */
const getSummary = async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Fecha actual en timezone Chile
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-CA', { 
      timeZone: 'America/Santiago', 
      year: 'numeric', 
      month: '2-digit',
      day: '2-digit'
    });
    const parts = formatter.formatToParts(now).reduce((acc, p) => { 
      acc[p.type] = p.value; 
      return acc; 
    }, {});
    
    const currentYear = Number(parts.year);
    const currentMonth = Number(parts.month);
    const currentDate = `${parts.year}-${parts.month}-${parts.day}`;
    
    // Accept year/month from query params, default to next month
    let targetYear = req.query.year ? Number(req.query.year) : currentYear;
    let targetMonth = req.query.month ? Number(req.query.month) : currentMonth + 1;
    
    // Handle month overflow if using defaults
    if (!req.query.month && targetMonth > 12) {
      targetMonth = 1;
      targetYear++;
    }
    
    const monthNames = [
      'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
      'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
    ];

    // 1. Obtener saldo cuenta corriente actual (usar known_balance que es el saldo real)
    let checkingBalance = 0;
    try {
      const checkingRes = await db.query(`
        SELECT COALESCE(known_balance, initial_balance, 0) as saldo_actual
        FROM checking_balances
        WHERE user_id = $1 AND year = $2 AND month = $3
      `, [userId, currentYear, currentMonth]);
      
      if (checkingRes.rows.length > 0) {
        checkingBalance = Number(checkingRes.rows[0].saldo_actual) || 0;
      }
    } catch (e) {
      console.warn('Error obteniendo saldo cuenta corriente:', e.message);
    }

    // 2. Obtener transacciones TC que se pagan el mes siguiente (billing_year/billing_month)
    let visaUnbilled = 0, mcUnbilled = 0, visaPagos = 0, mcPagos = 0;
    try {
      const txRes = await db.query(`
        SELECT 
          LOWER(COALESCE(i.network, 'unknown')) as network,
          t.tipo,
          SUM(ABS(t.monto)) as total
        FROM transactions t
        LEFT JOIN imports i ON t.import_id = i.id
        WHERE t.user_id = $1 
          AND COALESCE(t.billing_year, EXTRACT(YEAR FROM t.fecha)) = $2 
          AND COALESCE(t.billing_month, EXTRACT(MONTH FROM t.fecha)) = $3
          AND t.tipo IN ('gasto', 'pago')
        GROUP BY LOWER(COALESCE(i.network, 'unknown')), t.tipo
      `, [userId, targetYear, targetMonth]);
      
      for (const row of txRes.rows) {
        const amount = Number(row.total) || 0;
        if (row.network === 'visa') {
          if (row.tipo === 'gasto') visaUnbilled = amount;
          if (row.tipo === 'pago') visaPagos = amount;
        } else if (row.network === 'mastercard') {
          if (row.tipo === 'gasto') mcUnbilled = amount;
          if (row.tipo === 'pago') mcPagos = amount;
        }
      }
    } catch (e) {
      console.warn('Error obteniendo transacciones TC:', e.message);
    }

    // 3. Obtener cuotas del mes objetivo
    let visaInstallments = 0, mcInstallments = 0;
    try {
      const instRes = await db.query(`
        SELECT 
          LOWER(COALESCE(ip.brand, 'unknown')) as brand,
          SUM(io.amount) as total
        FROM installment_occurrences io
        JOIN installment_plans ip ON io.plan_id = ip.id
        WHERE ip.user_id = $1 
          AND io.year = $2 
          AND io.month = $3
          AND io.active = true
        GROUP BY LOWER(COALESCE(ip.brand, 'unknown'))
      `, [userId, targetYear, targetMonth]);
      
      for (const row of instRes.rows) {
        const amount = Number(row.total) || 0;
        if (row.brand === 'visa') visaInstallments = amount;
        else if (row.brand === 'mastercard') mcInstallments = amount;
      }
    } catch (e) {
      console.warn('Error obteniendo cuotas:', e.message);
    }

    // 4. Obtener transacciones internacionales del mes objetivo
    // period_year/period_month ya representan el mes de facturación
    let visaIntl = 0, mcIntl = 0;
    try {
      const intlRes = await db.query(`
        SELECT 
          LOWER(brand) as brand,
          SUM(amount_clp) as total
        FROM intl_unbilled
        WHERE user_id = $1 
          AND period_year = $2 
          AND period_month = $3
          AND tipo = 'gasto'
        GROUP BY LOWER(brand)
      `, [userId, targetYear, targetMonth]);
      
      for (const row of intlRes.rows) {
        const amount = Number(row.total) || 0;
        if (row.brand === 'visa') visaIntl = amount;
        else if (row.brand === 'mastercard') mcIntl = amount;
      }
    } catch (e) {
      console.warn('Error obteniendo transacciones internacionales:', e.message);
    }

    // 5. Obtener gastos/ingresos proyectados del mes
    let projectedExpenses = 0, projectedIncome = 0;
    const expenseDetails = [];
    const incomeDetails = [];
    
    try {
      // Usar la tabla projected_occurrences directamente (ya materializada)
      const projRes = await db.query(`
        SELECT 
          COALESCE(po.nombre, pt.nombre) as nombre,
          COALESCE(po.tipo, pt.tipo) as tipo,
          COALESCE(po.monto, pt.monto) as monto
        FROM projected_occurrences po
        JOIN projected_templates pt ON pt.id = po.template_id
        WHERE po.user_id = $1
          AND po.year = $2 
          AND po.month = $3
          AND po.active = true
      `, [userId, targetYear, targetMonth]);
      
      for (const row of projRes.rows) {
        const amount = Number(row.monto) || 0;
        if (row.tipo === 'gasto') {
          projectedExpenses += amount;
          expenseDetails.push({ name: row.nombre, amount });
        } else if (row.tipo === 'ingreso') {
          projectedIncome += amount;
          incomeDetails.push({ name: row.nombre, amount });
        }
      }
    } catch (e) {
      console.warn('Error obteniendo proyectados:', e.message);
    }

    // 6. Calcular totales
    const visaTotal = visaUnbilled + visaInstallments + visaIntl - visaPagos;
    const mcTotal = mcUnbilled + mcInstallments + mcIntl - mcPagos;
    const ccCombined = Math.max(0, visaTotal) + Math.max(0, mcTotal);
    
    const totalCommitments = ccCombined + projectedExpenses;
    const projectedBalance = checkingBalance + projectedIncome - totalCommitments;
    
    // 7. Calcular health score
    const { score: healthScore, status: healthStatus } = calculateHealthScore(
      projectedBalance, 
      totalCommitments, 
      checkingBalance
    );

    // 8. Generar alertas
    const alerts = [];
    
    if (projectedBalance < 0) {
      alerts.push({
        type: 'critical',
        title: 'Proyección Negativa',
        message: `Tu proyección para ${monthNames[targetMonth - 1]} es negativa: ${formatCLP(projectedBalance)}`
      });
    } else if (projectedBalance < checkingBalance * 0.2) {
      alerts.push({
        type: 'warning',
        title: 'Saldo Bajo Proyectado',
        message: `Tu saldo proyectado es muy bajo: ${formatCLP(projectedBalance)}`
      });
    }

    // Respuesta
    res.json({
      currentDate,
      targetMonth: {
        year: targetYear,
        month: targetMonth,
        name: `${monthNames[targetMonth - 1]} ${targetYear}`
      },
      checking: {
        currentBalance: checkingBalance,
        lastUpdated: new Date().toISOString()
      },
      creditCards: {
        visa: {
          unbilled: visaUnbilled,
          installments: visaInstallments,
          international: visaIntl,
          payments: visaPagos,
          total: Math.max(0, visaTotal)
        },
        mastercard: {
          unbilled: mcUnbilled,
          installments: mcInstallments,
          international: mcIntl,
          payments: mcPagos,
          total: Math.max(0, mcTotal)
        },
        combined: ccCombined
      },
      projected: {
        expenses: projectedExpenses,
        income: projectedIncome,
        details: {
          expenses: expenseDetails,
          income: incomeDetails
        }
      },
      summary: {
        totalCommitments,
        projectedBalance,
        healthScore,
        healthStatus
      },
      alerts
    });

  } catch (error) {
    console.error('Error en getSummary:', error);
    res.status(500).json({ error: 'Error al obtener resumen de salud financiera' });
  }
};

/**
 * Formatea número a CLP
 */
function formatCLP(amount) {
  return new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP'
  }).format(amount);
}

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
  getSummary,
  getAlerts,
  dismissAlert,
  markAlertRead
};
