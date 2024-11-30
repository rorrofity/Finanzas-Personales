const db = require('../config/database');

const getDashboardData = async (req, res) => {
    try {
        const userId = req.user.id;

        // Obtener resumen de transacciones del mes actual
        // Para tarjetas de crédito:
        // - gastos (montos positivos) aumentan la deuda
        // - ingresos/pagos (montos negativos) disminuyen la deuda
        const currentMonthQuery = `
            SELECT 
                SUM(CASE WHEN tipo = 'gasto' THEN monto ELSE 0 END) as total_gastos,
                ABS(SUM(CASE WHEN tipo = 'ingreso' THEN monto ELSE 0 END)) as total_ingresos,
                ABS(SUM(CASE WHEN tipo = 'pago' THEN monto ELSE 0 END)) as total_pagos,
                COUNT(CASE WHEN tipo = 'gasto' THEN 1 END) as num_gastos,
                COUNT(CASE WHEN tipo = 'ingreso' THEN 1 END) as num_ingresos,
                COUNT(CASE WHEN tipo = 'pago' THEN 1 END) as num_pagos,
                (SUM(CASE WHEN tipo = 'gasto' THEN monto ELSE -monto END)) as deuda_total
            FROM transactions 
            WHERE user_id = $1 
            AND fecha >= date_trunc('month', CURRENT_DATE)
            AND fecha < date_trunc('month', CURRENT_DATE) + interval '1 month'
        `;

        // Obtener gastos por categoría del mes actual
        const categoriesQuery = `
            SELECT 
                COALESCE(c.name, 'Sin categorizar') as categoria,
                SUM(t.monto) as total,
                COUNT(*) as cantidad
            FROM transactions t
            LEFT JOIN categories c ON t.category_id = c.id
            WHERE t.user_id = $1 
            AND t.tipo = 'gasto'
            AND t.fecha >= date_trunc('month', CURRENT_DATE)
            AND t.fecha < date_trunc('month', CURRENT_DATE) + interval '1 month'
            GROUP BY c.name
            ORDER BY total DESC
        `;

        // Obtener tendencia de gastos de los últimos 6 meses
        const trendQuery = `
            SELECT 
                date_trunc('month', fecha) as mes,
                SUM(CASE WHEN tipo = 'gasto' THEN monto ELSE 0 END) as total_gastos,
                ABS(SUM(CASE WHEN tipo = 'ingreso' THEN monto ELSE 0 END)) as total_ingresos,
                ABS(SUM(CASE WHEN tipo = 'pago' THEN monto ELSE 0 END)) as total_pagos,
                (SUM(CASE WHEN tipo = 'gasto' THEN monto ELSE -monto END)) as deuda_mensual
            FROM transactions 
            WHERE user_id = $1 
            AND fecha >= date_trunc('month', CURRENT_DATE) - interval '5 month'
            GROUP BY mes
            ORDER BY mes
        `;

        // Obtener últimas 5 transacciones
        const latestTransactionsQuery = `
            SELECT 
                t.id,
                t.descripcion,
                t.monto,
                t.fecha,
                t.tipo,
                COALESCE(c.name, 'Sin categorizar') as categoria
            FROM transactions t
            LEFT JOIN categories c ON t.category_id = c.id
            WHERE t.user_id = $1
            ORDER BY t.fecha DESC
            LIMIT 5
        `;

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
        console.error('Error obteniendo datos del dashboard:', error);
        res.status(500).json({ 
            message: 'Error al obtener datos del dashboard',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

module.exports = {
    getDashboardData
};
