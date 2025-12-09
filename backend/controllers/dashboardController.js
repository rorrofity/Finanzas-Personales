const db = require('../config/database');

const getMonthlySummary = async (req, res) => {
    try {
        const userId = req.user.id;
        const { startDate, endDate, periodYear, periodMonth } = req.query;

        let rows = [{ gastos: 0, ingresos: 0, pagos: 0 }];
        if (periodYear && periodMonth) {
            // Filtrar por período del import si se especifica
            const summaryByPeriodQuery = `
                SELECT 
                    COALESCE(SUM(CASE WHEN t.tipo = 'gasto' THEN t.monto ELSE 0 END), 0) AS gastos,
                    COALESCE(SUM(CASE WHEN t.tipo = 'ingreso' THEN t.monto ELSE 0 END), 0) AS ingresos,
                    COALESCE(SUM(CASE WHEN t.tipo = 'pago' THEN ABS(t.monto) ELSE 0 END), 0) AS pagos
                FROM transactions t
                LEFT JOIN imports i ON t.import_id = i.id
                WHERE t.user_id = $1
                  AND i.period_year = $2::int
                  AND i.period_month = $3::int
            `;
            const resp = await db.query(summaryByPeriodQuery, [userId, parseInt(periodYear, 10), parseInt(periodMonth, 10)]);
            rows = resp.rows;
        } else if (startDate && endDate) {
            // Nota: t.fecha es de tipo DATE, por lo que comparar con YYYY-MM-DD es suficiente
            const summaryQuery = `
                SELECT 
                    COALESCE(SUM(CASE WHEN t.tipo = 'gasto' THEN t.monto ELSE 0 END), 0) AS gastos,
                    COALESCE(SUM(CASE WHEN t.tipo = 'ingreso' THEN t.monto ELSE 0 END), 0) AS ingresos,
                    COALESCE(SUM(CASE WHEN t.tipo = 'pago' THEN ABS(t.monto) ELSE 0 END), 0) AS pagos
                FROM transactions t
                WHERE t.user_id = $1
                  AND t.fecha >= $2::date
                  AND t.fecha <= $3::date
            `;
            const resp = await db.query(summaryQuery, [userId, startDate, endDate]);
            rows = resp.rows;
        }

        const row = rows[0] || { gastos: 0, ingresos: 0, pagos: 0 };
        // v1: pagos son montos que reducen deuda, por lo que suman al saldo neto
        const saldoNeto = Number(row.ingresos) - Number(row.gastos) + Number(row.pagos);

        return res.json({
            gastos: Number(row.gastos),
            ingresos: Number(row.ingresos),
            pagos: Number(row.pagos),
            saldoNeto
        });
    } catch (error) {
        console.error('Error en getMonthlySummary:', error);
        res.status(500).json({ error: 'Error al obtener resumen mensual' });
    }
};

const getDashboardData = async (req, res) => {
    const userId = req.user.id;

    // Obtener resumen de transacciones del mes actual
    const currentMonthQuery = `
        WITH current_month AS (
            SELECT 
                date_trunc('month', CURRENT_DATE) as month_start,
                (date_trunc('month', CURRENT_DATE) + interval '1 month' - interval '1 day')::date as month_end
        ),
        all_transactions AS (
            SELECT 
                t.*,
                cm.month_start,
                cm.month_end
            FROM transactions t
            CROSS JOIN current_month cm
        ),
        filtered_transactions AS (
            SELECT *,
                   to_char(fecha, 'YYYY-MM-DD') as fecha_str
            FROM all_transactions
            WHERE user_id = $1
        ),
        monthly_totals AS (
            SELECT 
                COALESCE(SUM(CASE WHEN tipo = 'gasto' THEN monto ELSE 0 END), 0) as total_gastos,
                COALESCE(SUM(CASE WHEN tipo = 'ingreso' THEN monto ELSE 0 END), 0) as total_ingresos,
                COALESCE(SUM(CASE WHEN tipo = 'pago' THEN ABS(monto) ELSE 0 END), 0) as total_pagos,
                COUNT(CASE WHEN tipo = 'gasto' THEN 1 END) as num_gastos,
                COUNT(CASE WHEN tipo = 'ingreso' THEN 1 END) as num_ingresos,
                COUNT(CASE WHEN tipo = 'pago' THEN 1 END) as num_pagos,
                (
                    COALESCE(SUM(CASE WHEN tipo = 'gasto' THEN monto ELSE 0 END), 0) -
                    COALESCE(SUM(CASE WHEN tipo = 'pago' THEN ABS(monto) ELSE 0 END), 0)
                ) as deuda_total,
                json_agg(json_build_object(
                    'id', id,
                    'fecha', fecha,
                    'descripcion', descripcion,
                    'monto', monto,
                    'tipo', tipo
                ) ORDER BY fecha DESC) as debug_transactions
            FROM filtered_transactions
        )
        SELECT 
            mt.total_gastos,
            mt.total_ingresos,
            mt.total_pagos,
            mt.num_gastos,
            mt.num_ingresos,
            mt.num_pagos,
            mt.deuda_total,
            mt.debug_transactions
        FROM monthly_totals mt;
    `;

    // Obtener gastos por categoría del mes actual
    const categoriesQuery = `
        SELECT 
            COALESCE(c.name, 'Sin categorizar') as name,
            COUNT(*) as count,
            SUM(t.monto) as total,
            json_agg(json_build_object(
                'id', t.id,
                'descripcion', t.descripcion,
                'monto', t.monto,
                'fecha', t.fecha
            )) as transactions
        FROM transactions t
        LEFT JOIN categories c ON t.category_id = c.id
        WHERE t.user_id = $1 
        AND t.tipo = 'gasto'
        GROUP BY c.name
        ORDER BY total DESC;
    `;

    // Obtener tendencia de gastos de los últimos 6 meses
    const trendQuery = `
        WITH RECURSIVE months AS (
            SELECT 
                date_trunc('month', CURRENT_DATE) as month_start,
                date_trunc('month', CURRENT_DATE) as month_end
            UNION ALL
            SELECT 
                month_start - interval '1 month',
                month_end - interval '1 month'
            FROM months
            WHERE month_start > date_trunc('month', CURRENT_DATE) - interval '5 months'
        )
        SELECT 
            m.month_start::date as mes,
            COALESCE(SUM(CASE WHEN t.tipo = 'gasto' THEN t.monto ELSE 0 END), 0) as total_gastos,
            COALESCE(SUM(CASE WHEN t.tipo = 'ingreso' THEN t.monto ELSE 0 END), 0) as total_ingresos,
            COALESCE(SUM(CASE WHEN t.tipo = 'pago' THEN ABS(t.monto) ELSE 0 END), 0) as total_pagos,
            (
                COALESCE(SUM(CASE WHEN t.tipo = 'gasto' THEN t.monto ELSE 0 END), 0) -
                COALESCE(SUM(CASE WHEN t.tipo = 'pago' THEN ABS(t.monto) ELSE 0 END), 0)
            ) as deuda_mensual
        FROM months m
        LEFT JOIN transactions t ON 
            t.user_id = $1 AND
            t.fecha >= m.month_start::date AND 
            t.fecha < (m.month_start + interval '1 month')::date
        GROUP BY m.month_start
        ORDER BY m.month_start;
    `;

    // Obtener últimas 5 transacciones
    const latestTransactionsQuery = `
        SELECT 
            t.id,
            t.descripcion,
            t.monto,
            t.fecha AT TIME ZONE 'America/Santiago' as fecha,
            t.tipo,
            COALESCE(c.name, 'Sin categorizar') as categoria
        FROM transactions t
        LEFT JOIN categories c ON t.category_id = c.id
        WHERE t.user_id = $1
        ORDER BY t.fecha DESC
        LIMIT 5
    `;

    try {
        // Ejecutar todas las consultas en paralelo
        const [currentMonth, categories, trend, latestTransactions] = await Promise.all([
            db.query(currentMonthQuery, [userId]),
            db.query(categoriesQuery, [userId]),
            db.query(trendQuery, [userId]),
            db.query(latestTransactionsQuery, [userId])
        ]);

        // Preparar la respuesta
        const response = {
            currentMonth: currentMonth.rows[0] || {
                total_gastos: 0,
                total_ingresos: 0,
                total_pagos: 0,
                num_gastos: 0,
                num_ingresos: 0,
                num_pagos: 0,
                deuda_total: 0
            },
            categories: categories.rows || [],
            trend: trend.rows || [],
            latestTransactions: latestTransactions.rows || []
        };

        res.json(response);
    } catch (error) {
        console.error('Error in getDashboardData:', error);
        res.status(500).json({ 
            error: 'Error al obtener datos del dashboard', 
            details: error.message,
            stack: error.stack 
        });
    }
};

/**
 * Get category breakdown for a period
 */
const getCategoryBreakdown = async (req, res) => {
    try {
        const userId = req.user.id;
        const { startDate, endDate, periodYear, periodMonth } = req.query;
        
        let query;
        let params;
        
        if (periodYear && periodMonth) {
            query = `
                SELECT 
                    COALESCE(c.name, 'Sin categoría') as categoria,
                    SUM(ABS(t.monto)) as total,
                    COUNT(*) as count
                FROM transactions t
                LEFT JOIN categories c ON t.category_id = c.id
                LEFT JOIN imports i ON t.import_id = i.id
                WHERE t.user_id = $1
                  AND t.tipo = 'gasto'
                  AND i.period_year = $2
                  AND i.period_month = $3
                GROUP BY c.id, c.name
                ORDER BY total DESC
            `;
            params = [userId, parseInt(periodYear), parseInt(periodMonth)];
        } else if (startDate && endDate) {
            query = `
                SELECT 
                    COALESCE(c.name, 'Sin categoría') as categoria,
                    SUM(ABS(t.monto)) as total,
                    COUNT(*) as count
                FROM transactions t
                LEFT JOIN categories c ON t.category_id = c.id
                WHERE t.user_id = $1
                  AND t.tipo = 'gasto'
                  AND t.fecha >= $2::date
                  AND t.fecha <= $3::date
                GROUP BY c.id, c.name
                ORDER BY total DESC
            `;
            params = [userId, startDate, endDate];
        } else {
            return res.json([]);
        }
        
        const result = await db.query(query, params);
        res.json(result.rows.map(r => ({
            categoria: r.categoria,
            total: Number(r.total),
            count: Number(r.count)
        })));
    } catch (error) {
        console.error('Error in getCategoryBreakdown:', error);
        res.status(500).json({ error: 'Error al obtener categorías' });
    }
};

module.exports = {
    getDashboardData,
    getMonthlySummary,
    getCategoryBreakdown
};
