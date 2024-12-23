const db = require('../config/database');

const getDashboardData = async (req, res) => {
    console.log('=== Dashboard Request ===');
    console.log('User:', req.user);
    console.log('Current Date:', new Date());
    
    const userId = req.user.id;
    console.log('User ID:', userId);

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

        console.log('=== Raw Query Results ===');
        console.log('Current Month Query Result:', {
            rows: currentMonth.rows,
            rowCount: currentMonth.rowCount,
            fields: currentMonth.fields?.map(f => ({ name: f.name, dataTypeID: f.dataTypeID }))
        });
        console.log('Categories Query Result:', {
            rows: categories.rows,
            rowCount: categories.rowCount
        });
        console.log('Trend Query Result:', {
            rows: trend.rows,
            rowCount: trend.rowCount
        });

        // Verificar las fechas de las transacciones
        if (currentMonth.rows[0]?.debug_transactions) {
            console.log('=== Transaction Analysis ===');
            currentMonth.rows[0].debug_transactions.forEach(t => {
                console.log(`Transaction ${t.id}:`, {
                    fecha: t.fecha,
                    descripcion: t.descripcion,
                    monto: t.monto,
                    tipo: t.tipo
                });
            });

            // Calcular totales manualmente para verificar
            const manualTotals = currentMonth.rows[0].debug_transactions.reduce((acc, t) => {
                if (t.tipo === 'gasto') {
                    acc.total_gastos += parseFloat(t.monto);
                } else if (t.tipo === 'ingreso') {
                    acc.total_ingresos += parseFloat(t.monto);
                } else if (t.tipo === 'pago') {
                    acc.total_pagos += Math.abs(parseFloat(t.monto));
                }
                return acc;
            }, { total_gastos: 0, total_ingresos: 0, total_pagos: 0 });

            console.log('Manual calculation of totals:', manualTotals);
            console.log('Query calculation of totals:', {
                total_gastos: currentMonth.rows[0].total_gastos,
                total_ingresos: currentMonth.rows[0].total_ingresos,
                total_pagos: currentMonth.rows[0].total_pagos
            });
        } else {
            console.log('No transactions found for the current month');
            console.log('Current Date:', new Date());
            console.log('Month Start:', new Date().setDate(1));
            console.log('Month End:', new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0));
        }

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

        console.log('=== Final Response ===');
        console.log('Current Month:', response.currentMonth);
        console.log('Categories:', response.categories);
        console.log('Trend:', response.trend);
        console.log('Latest Transactions:', response.latestTransactions);

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

module.exports = {
    getDashboardData
};
