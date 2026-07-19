const db = require('../config/database');

/**
 * Compromisos de un período de facturación (Epic 12, K5).
 *
 * Extraído de financialHealthController para no divergir: TC no facturado
 * (gastos - pagos por red, nunca negativo), cuotas activas, internacionales
 * y gastos fijos proyectados del período objetivo.
 */
async function computeCommitments(userId, targetYear, targetMonth) {
  let visaUnbilled = 0, mcUnbilled = 0, visaPagos = 0, mcPagos = 0;
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

  let visaInstallments = 0, mcInstallments = 0;
  const instRes = await db.query(`
    SELECT LOWER(COALESCE(ip.brand, 'unknown')) as brand, SUM(io.amount) as total
    FROM installment_occurrences io
    JOIN installment_plans ip ON io.plan_id = ip.id
    WHERE ip.user_id = $1 AND io.year = $2 AND io.month = $3 AND io.active = true
    GROUP BY LOWER(COALESCE(ip.brand, 'unknown'))
  `, [userId, targetYear, targetMonth]);
  for (const row of instRes.rows) {
    const amount = Number(row.total) || 0;
    if (row.brand === 'visa') visaInstallments = amount;
    else if (row.brand === 'mastercard') mcInstallments = amount;
  }

  let visaIntl = 0, mcIntl = 0;
  const intlRes = await db.query(`
    SELECT LOWER(brand) as brand, SUM(amount_clp) as total
    FROM intl_unbilled
    WHERE user_id = $1 AND period_year = $2 AND period_month = $3 AND tipo = 'gasto'
    GROUP BY LOWER(brand)
  `, [userId, targetYear, targetMonth]);
  for (const row of intlRes.rows) {
    const amount = Number(row.total) || 0;
    if (row.brand === 'visa') visaIntl = amount;
    else if (row.brand === 'mastercard') mcIntl = amount;
  }

  let proyectados = 0;
  const projRes = await db.query(`
    SELECT COALESCE(po.tipo, pt.tipo) as tipo, COALESCE(po.monto, pt.monto) as monto
    FROM projected_occurrences po
    JOIN projected_templates pt ON pt.id = po.template_id
    WHERE po.user_id = $1 AND po.year = $2 AND po.month = $3 AND po.active = true
  `, [userId, targetYear, targetMonth]);
  for (const row of projRes.rows) {
    if (row.tipo === 'gasto') proyectados += Number(row.monto) || 0;
  }

  const visaTotal = visaUnbilled + visaInstallments + visaIntl - visaPagos;
  const mcTotal = mcUnbilled + mcInstallments + mcIntl - mcPagos;
  const total = Math.max(0, visaTotal) + Math.max(0, mcTotal) + proyectados;

  return {
    tcNoFacturado: visaUnbilled + mcUnbilled,
    cuotas: visaInstallments + mcInstallments,
    intl: visaIntl + mcIntl,
    proyectados,
    total,
  };
}

module.exports = { computeCommitments };
