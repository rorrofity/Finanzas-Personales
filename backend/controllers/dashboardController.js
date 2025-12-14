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
 * mode=projected: TC nacional + internacional + gastos proyectados (para Salud Financiera)
 * mode=monthly: TC + cuenta corriente del mes (para Dashboard histórico)
 */
const getCategoryBreakdown = async (req, res) => {
    try {
        const userId = req.user.id;
        const { periodYear, periodMonth, mode = 'projected' } = req.query;
        
        if (!periodYear || !periodMonth) {
            return res.json([]);
        }
        
        const year = parseInt(periodYear);
        const month = parseInt(periodMonth);
        
        let query;
        
        if (mode === 'projected') {
            // Para Salud Financiera: TC nacional + internacional + gastos proyectados
            query = `
                WITH combined AS (
                    -- TC no facturado nacional (por periodo de facturación)
                    SELECT 
                        t.category_id,
                        ABS(t.monto) as amount,
                        'tc_nacional' as source
                    FROM transactions t
                    LEFT JOIN imports i ON t.import_id = i.id
                    WHERE t.user_id = $1
                      AND t.tipo = 'gasto'
                      AND i.period_year = $2
                      AND i.period_month = $3
                    
                    UNION ALL
                    
                    -- TC no facturado internacional (por periodo)
                    SELECT 
                        iu.category_id,
                        iu.amount_clp as amount,
                        'tc_internacional' as source
                    FROM intl_unbilled iu
                    WHERE iu.user_id = $1
                      AND iu.period_year = $2
                      AND iu.period_month = $3
                      AND iu.tipo = 'gasto'
                    
                    UNION ALL
                    
                    -- Gastos fijos proyectados
                    SELECT 
                        pt.category_id,
                        COALESCE(po.monto, pt.monto) as amount,
                        'proyectado' as source
                    FROM projected_templates pt
                    LEFT JOIN projected_occurrences po 
                        ON po.template_id = pt.id 
                        AND po.year = $2 
                        AND po.month = $3
                    WHERE pt.user_id = $1
                      AND pt.tipo = 'gasto'
                )
                SELECT 
                    COALESCE(c.name, 'Sin categoría') as categoria,
                    SUM(combined.amount) as total,
                    COUNT(*) as count
                FROM combined
                LEFT JOIN categories c ON combined.category_id = c.id
                GROUP BY c.id, c.name
                ORDER BY total DESC
            `;
        } else {
            // Para Dashboard: TC + cuenta corriente del mes (por fecha calendario)
            // Calcular rango de fechas del mes
            const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
            const lastDay = new Date(year, month, 0).getDate();
            const endDate = `${year}-${String(month).padStart(2, '0')}-${lastDay}`;
            
            query = `
                WITH combined AS (
                    -- TC Nacional (por fecha real de transacción)
                    SELECT 
                        t.category_id,
                        ABS(t.monto) as amount,
                        'tc_nacional' as source
                    FROM transactions t
                    WHERE t.user_id = $1
                      AND t.tipo = 'gasto'
                      AND t.fecha >= $2::date
                      AND t.fecha <= $3::date
                    
                    UNION ALL
                    
                    -- TC internacional (por fecha real)
                    SELECT 
                        iu.category_id,
                        iu.amount_clp as amount,
                        'tc_internacional' as source
                    FROM intl_unbilled iu
                    WHERE iu.user_id = $1
                      AND iu.fecha >= $2::date
                      AND iu.fecha <= $3::date
                      AND iu.tipo = 'gasto'
                    
                    UNION ALL
                    
                    -- Cuenta corriente (cargos del mes, excluyendo pago TC)
                    SELECT 
                        ct.category_id,
                        ct.amount,
                        'cuenta_corriente' as source
                    FROM checking_transactions ct
                    WHERE ct.user_id = $1
                      AND ct.year = $4
                      AND ct.month = $5
                      AND ct.tipo = 'cargo'
                      AND LOWER(ct.descripcion) NOT LIKE '%pago%tarjeta%'
                      AND LOWER(ct.descripcion) NOT LIKE '%pago tc%'
                      AND LOWER(ct.descripcion) NOT LIKE '%cargo por pago tc%'
                      AND LOWER(ct.descripcion) NOT LIKE '%pago tarjeta de credito%'
                )
                SELECT 
                    COALESCE(c.name, 'Sin categoría') as categoria,
                    SUM(combined.amount) as total,
                    COUNT(*) as count
                FROM combined
                LEFT JOIN categories c ON combined.category_id = c.id
                GROUP BY c.id, c.name
                ORDER BY total DESC
            `;
            
            const result = await db.query(query, [userId, startDate, endDate, year, month]);
            return res.json(result.rows.map(r => ({
                categoria: r.categoria,
                total: Number(r.total),
                count: Number(r.count)
            })));
        }
        
        const result = await db.query(query, [userId, year, month]);
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

/**
 * Get monthly history with detailed breakdown
 * Returns: gastos TC (nacional + intl), gastos CC, ingresos CC, balance
 */
const getMonthlyHistory = async (req, res) => {
    try {
        const userId = req.user.id;
        const { months = 6 } = req.query;
        const numMonths = Math.min(parseInt(months) || 6, 12);
        
        // Generate list of last N months
        const now = new Date();
        const monthsList = [];
        for (let i = 0; i < numMonths; i++) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            monthsList.push({ year: d.getFullYear(), month: d.getMonth() + 1 });
        }
        
        const results = [];
        const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
        
        for (const { year, month } of monthsList) {
            // Calcular rango de fechas del mes calendario
            const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
            const lastDay = new Date(year, month, 0).getDate();
            const endDate = `${year}-${String(month).padStart(2, '0')}-${lastDay}`;
            
            // TC Nacional (gastos) - filtrar por fecha real de transacción
            const tcNacionalRes = await db.query(`
                SELECT COALESCE(SUM(ABS(t.monto)), 0) as total
                FROM transactions t
                WHERE t.user_id = $1
                  AND t.tipo = 'gasto'
                  AND t.fecha >= $2::date
                  AND t.fecha <= $3::date
            `, [userId, startDate, endDate]);
            
            // TC Internacional (gastos) - filtrar por fecha real
            const tcIntlRes = await db.query(`
                SELECT COALESCE(SUM(amount_clp), 0) as total
                FROM intl_unbilled
                WHERE user_id = $1
                  AND fecha >= $2::date
                  AND fecha <= $3::date
                  AND tipo = 'gasto'
            `, [userId, startDate, endDate]);
            
            // Cuenta Corriente - Cargos (gastos) EXCLUYENDO pagos de tarjeta de crédito
            const ccCargosRes = await db.query(`
                SELECT COALESCE(SUM(amount), 0) as total
                FROM checking_transactions
                WHERE user_id = $1
                  AND year = $2
                  AND month = $3
                  AND tipo = 'cargo'
                  AND LOWER(descripcion) NOT LIKE '%pago%tarjeta%'
                  AND LOWER(descripcion) NOT LIKE '%pago tc%'
                  AND LOWER(descripcion) NOT LIKE '%cargo por pago tc%'
                  AND LOWER(descripcion) NOT LIKE '%pago tarjeta de credito%'
            `, [userId, year, month]);
            
            // Pago de TC (para referencia, no se suma a gastos)
            const pagoTCRes = await db.query(`
                SELECT COALESCE(SUM(amount), 0) as total
                FROM checking_transactions
                WHERE user_id = $1
                  AND year = $2
                  AND month = $3
                  AND tipo = 'cargo'
                  AND (LOWER(descripcion) LIKE '%pago%tarjeta%'
                       OR LOWER(descripcion) LIKE '%pago tc%'
                       OR LOWER(descripcion) LIKE '%cargo por pago tc%'
                       OR LOWER(descripcion) LIKE '%pago tarjeta de credito%')
            `, [userId, year, month]);
            
            // Cuenta Corriente - Abonos (ingresos)
            const ccAbonosRes = await db.query(`
                SELECT COALESCE(SUM(amount), 0) as total
                FROM checking_transactions
                WHERE user_id = $1
                  AND year = $2
                  AND month = $3
                  AND tipo = 'abono'
            `, [userId, year, month]);
            
            const gastosTC = Number(tcNacionalRes.rows[0]?.total || 0) + Number(tcIntlRes.rows[0]?.total || 0);
            const gastosCC = Number(ccCargosRes.rows[0]?.total || 0);
            const pagoTC = Number(pagoTCRes.rows[0]?.total || 0);
            const ingresosCC = Number(ccAbonosRes.rows[0]?.total || 0);
            // Balance real = Ingresos CC - Gastos CC (sin pago TC)
            const balanceReal = ingresosCC - gastosCC;
            // Gastos totales para categorías = TC + CC (sin pago TC)
            const gastosTotal = gastosTC + gastosCC;
            
            results.push({
                year,
                month,
                monthName: monthNames[month - 1],
                label: `${monthNames[month - 1]} ${year}`,
                gastosTC,
                gastosCC,
                pagoTC,
                ingresosCC,
                gastosTotal,
                balance: balanceReal
            });
        }
        
        // Return in chronological order (oldest first)
        res.json(results.reverse());
    } catch (error) {
        console.error('Error in getMonthlyHistory:', error);
        res.status(500).json({ error: 'Error al obtener histórico mensual' });
    }
};

/**
 * Get category evolution over last N months
 * Returns: array of months with category breakdown for stacked area chart
 */
const getCategoryEvolution = async (req, res) => {
    try {
        const userId = req.user.id;
        const { months = 6 } = req.query;
        const numMonths = Math.min(parseInt(months) || 6, 12);
        
        // Generate list of last N months
        const now = new Date();
        const monthsList = [];
        for (let i = 0; i < numMonths; i++) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            monthsList.push({ year: d.getFullYear(), month: d.getMonth() + 1 });
        }
        
        const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
        const results = [];
        const allCategories = new Set();
        
        for (const { year, month } of monthsList) {
            // Calcular rango de fechas del mes calendario
            const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
            const lastDay = new Date(year, month, 0).getDate();
            const endDate = `${year}-${String(month).padStart(2, '0')}-${lastDay}`;
            
            // Combine TC + CC (excluding pago TC) by category - filtrar por fecha calendario
            const query = `
                WITH combined AS (
                    -- TC Nacional (por fecha real)
                    SELECT 
                        t.category_id,
                        ABS(t.monto) as amount
                    FROM transactions t
                    WHERE t.user_id = $1
                      AND t.tipo = 'gasto'
                      AND t.fecha >= $2::date
                      AND t.fecha <= $3::date
                    
                    UNION ALL
                    
                    -- TC Internacional (por fecha real)
                    SELECT 
                        iu.category_id,
                        iu.amount_clp as amount
                    FROM intl_unbilled iu
                    WHERE iu.user_id = $1
                      AND iu.fecha >= $2::date
                      AND iu.fecha <= $3::date
                      AND iu.tipo = 'gasto'
                    
                    UNION ALL
                    
                    -- Cuenta corriente (cargos, excluyendo pago TC)
                    SELECT 
                        ct.category_id,
                        ct.amount
                    FROM checking_transactions ct
                    WHERE ct.user_id = $1
                      AND ct.year = $4
                      AND ct.month = $5
                      AND ct.tipo = 'cargo'
                      AND LOWER(ct.descripcion) NOT LIKE '%pago%tarjeta%'
                      AND LOWER(ct.descripcion) NOT LIKE '%pago tc%'
                      AND LOWER(ct.descripcion) NOT LIKE '%cargo por pago tc%'
                      AND LOWER(ct.descripcion) NOT LIKE '%pago tarjeta de credito%'
                )
                SELECT 
                    COALESCE(c.name, 'Sin categoría') as categoria,
                    SUM(combined.amount) as total
                FROM combined
                LEFT JOIN categories c ON combined.category_id = c.id
                GROUP BY c.id, c.name
                ORDER BY total DESC
            `;
            
            const catRes = await db.query(query, [userId, startDate, endDate, year, month]);
            
            const monthData = {
                year,
                month,
                label: `${monthNames[month - 1]} ${year}`,
                categories: {}
            };
            
            catRes.rows.forEach(row => {
                const catName = row.categoria;
                allCategories.add(catName);
                monthData.categories[catName] = Number(row.total);
            });
            
            results.push(monthData);
        }
        
        // Normalize: ensure all months have all categories
        const categoriesArray = Array.from(allCategories);
        const normalizedResults = results.map(m => {
            const normalized = { label: m.label, year: m.year, month: m.month };
            categoriesArray.forEach(cat => {
                normalized[cat] = m.categories[cat] || 0;
            });
            return normalized;
        });
        
        res.json({
            data: normalizedResults.reverse(), // chronological order
            categories: categoriesArray
        });
    } catch (error) {
        console.error('Error in getCategoryEvolution:', error);
        res.status(500).json({ error: 'Error al obtener evolución de categorías' });
    }
};

module.exports = {
    getDashboardData,
    getMonthlySummary,
    getCategoryBreakdown,
    getMonthlyHistory,
    getCategoryEvolution
};
