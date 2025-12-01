const express = require('express');
const router = express.Router();
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const { auth } = require('../middleware/auth');
const { pool } = require('../config/database');

/**
 * Calcula el período de facturación basándose en la fecha de transacción.
 * Regla: Transacciones del 22 de un mes al 21 del siguiente se facturan el mes posterior.
 * 
 * Ejemplos:
 * - 22 oct → 21 nov = Factura en Diciembre
 * - 22 nov → 21 dic = Factura en Enero
 * 
 * @param {Date|string} fecha - Fecha de la transacción (YYYY-MM-DD)
 * @returns {{year: number, month: number}} - Año y mes de facturación
 */
function calculateBillingPeriod(fecha) {
  // Parsear fecha manualmente para evitar problemas de zona horaria
  let year, month, day;
  
  if (typeof fecha === 'string') {
    [year, month, day] = fecha.split('-').map(Number);
  } else {
    // Si es Date, convertir a componentes
    const date = new Date(fecha);
    year = date.getFullYear();
    month = date.getMonth() + 1;
    day = date.getDate();
  }
  
  let billingMonth, billingYear;
  
  if (day >= 22) {
    // Del 22 en adelante → Se factura 2 meses después
    billingMonth = month + 2;
    billingYear = year;
  } else {
    // Del 1 al 21 → Se factura 1 mes después
    billingMonth = month + 1;
    billingYear = year;
  }
  
  // Ajustar si el mes se pasa de 12
  if (billingMonth > 12) {
    billingYear += Math.floor((billingMonth - 1) / 12);
    billingMonth = ((billingMonth - 1) % 12) + 1;
  }
  
  return { year: billingYear, month: billingMonth };
}

/**
 * POST /api/transactions/sync-emails
 * Endpoint principal llamado por el frontend
 * Orquesta la sincronización completa con N8N
 */
router.post('/sync-emails', auth, async (req, res) => {
  const userId = req.user.id;
  const startTime = Date.now();
  
  console.log(`📧 [${new Date().toISOString()}] Sync iniciado para usuario: ${userId}`);
  
  try {
    // Validar que el usuario existe
    const userCheck = await pool.query(
      'SELECT id, nombre FROM users WHERE id = $1',
      [userId]
    );
    
    if (userCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Usuario no encontrado'
      });
    }
    
    // Determinar URL de N8N
    // En producción: N8N corre en el mismo servidor (localhost:5678)
    // En desarrollo: Usar N8N_WEBHOOK_URL del .env o túnel SSH
    const n8nUrl = process.env.N8N_WEBHOOK_URL || 'http://localhost:5678/webhook/sync-bank-emails';
    
    // Llamar a N8N
    let n8nResponse;
    try {
      console.log(`🔄 Llamando a N8N: ${n8nUrl}`);
      n8nResponse = await axios.post(
        n8nUrl,
        {
          userId: userId,
          timestamp: new Date().toISOString(),
          userName: userCheck.rows[0].nombre
        },
        {
          timeout: 60000, // 60 segundos
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );
      console.log(`✅ N8N respondió: ${JSON.stringify(n8nResponse.data)}`);
    } catch (n8nError) {
      console.error('❌ Error llamando N8N:', n8nError.message);
      
      if (n8nError.code === 'ECONNREFUSED') {
        return res.status(503).json({
          success: false,
          message: 'Servicio de sincronización no disponible. Verifica que N8N esté corriendo.',
          error: 'Service unavailable',
          details: 'N8N no está respondiendo en el puerto 5678'
        });
      }
      
      if (n8nError.code === 'ETIMEDOUT' || n8nError.code === 'ECONNABORTED') {
        return res.status(504).json({
          success: false,
          message: 'La sincronización tardó demasiado. Intenta nuevamente.',
          error: 'Timeout'
        });
      }
      
      return res.status(500).json({
        success: false,
        message: 'Error comunicándose con el servicio de sincronización',
        error: n8nError.message
      });
    }
    
    // Extraer resultado - N8N puede devolver en varios formatos
    let result = n8nResponse.data || {};
    
    // Si es un array (formato de webhook con múltiples outputs), extraer el primer item
    if (Array.isArray(result)) {
      // Buscar el primer item que tenga datos de importación
      for (const item of result.flat(2)) {
        if (item && (item.imported !== undefined || item.success !== undefined)) {
          result = item;
          break;
        }
        if (item && item.json && (item.json.imported !== undefined || item.json.success !== undefined)) {
          result = item.json;
          break;
        }
      }
    }
    
    // Si result tiene una propiedad json, usar esa
    if (result.json && typeof result.json === 'object') {
      result = result.json;
    }
    
    console.log('📦 Resultado parseado de N8N:', JSON.stringify(result));
    
    const imported = result.imported || 0;
    const skipped = result.skipped || 0;
    const errors = result.errors || [];
    
    const duration = Date.now() - startTime;
    
    console.log(`📊 Resultado: ${imported} importadas, ${skipped} omitidas, ${errors.length} errores en ${duration}ms`);
    
    // Responder al frontend
    res.json({
      success: true,
      message: imported > 0 
        ? `Se importaron ${imported} transacción${imported !== 1 ? 'es' : ''} nueva${imported !== 1 ? 's' : ''}` 
        : 'No se encontraron transacciones nuevas',
      imported: imported,
      skipped: skipped,
      errors: errors,
      duration: `${duration}ms`
    });
    
  } catch (error) {
    console.error('❌ Error en sincronización:', error);
    
    res.status(500).json({
      success: false,
      message: 'Error al sincronizar transacciones',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Error interno del servidor'
    });
  }
});

/**
 * POST /api/transactions/sync-save
 * Endpoint interno llamado por N8N
 * Guarda las transacciones parseadas en la base de datos
 */
router.post('/sync-save', async (req, res) => {
  const { userId, transactions } = req.body;
  
  console.log(`💾 Guardando ${transactions?.length || 0} transacciones para usuario: ${userId}`);
  
  // Validación de entrada
  if (!userId || !transactions || !Array.isArray(transactions)) {
    return res.status(400).json({
      success: false,
      message: 'Datos inválidos: se requiere userId y transactions[]',
      imported: 0,
      skipped: 0,
      errors: ['Estructura de datos inválida']
    });
  }
  
  let importedCount = 0;
  const importedEmailIds = [];
  let skipped = 0;
  const errors = [];
  
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Verificar que el usuario existe
    const userCheck = await client.query(
      'SELECT id FROM users WHERE id = $1',
      [userId]
    );
    
    if (userCheck.rows.length === 0) {
      throw new Error(`Usuario ${userId} no encontrado`);
    }
    
    // Obtener tipo de cambio para transacciones internacionales (si hay alguna)
    let exchangeRate = null;
    const hasIntlTransactions = transactions.some(t => t.is_international);
    if (hasIntlTransactions) {
      exchangeRate = await getExchangeRate();
      console.log(`💱 Tipo de cambio USD/CLP: ${exchangeRate}`);
    }
    
    for (const txn of transactions) {
      try {
        const isIntl = txn.is_international === true;
        
        // Validar datos mínimos según tipo de transacción
        if (isIntl) {
          if (!txn.fecha || !txn.descripcion || txn.amount_usd === null || txn.amount_usd === undefined) {
            errors.push({
              transaction: txn.descripcion || 'Sin descripción',
              error: 'Datos incompletos para intl: se requiere fecha, descripcion, amount_usd',
              received: { fecha: txn.fecha, descripcion: txn.descripcion, amount_usd: txn.amount_usd }
            });
            continue;
          }
        } else {
          if (!txn.fecha || !txn.descripcion || txn.monto === null || txn.monto === undefined || !txn.tipo) {
            errors.push({
              transaction: txn.descripcion || 'Sin descripción',
              error: 'Datos incompletos: se requiere fecha, descripcion, monto y tipo',
              received: { fecha: txn.fecha, descripcion: txn.descripcion, monto: txn.monto, tipo: txn.tipo }
            });
            continue;
          }
        }
        
        // Validar que email_id existe para prevenir duplicados
        if (!txn.email_id) {
          errors.push({
            transaction: txn.descripcion,
            error: 'email_id requerido para prevenir duplicados'
          });
          continue;
        }
        
        // Calcular período de facturación automáticamente
        const billingPeriod = calculateBillingPeriod(txn.fecha);
        
        if (isIntl) {
          // === TRANSACCIÓN INTERNACIONAL ===
          // Normalizar descripción para comparación (minúsculas, sin espacios múltiples)
          const descNorm = (txn.descripcion || '').toLowerCase().trim().replace(/\s+/g, ' ');
          
          // Verificar duplicado en intl_unbilled con descripción normalizada
          const duplicateIntl = await client.query(
            `SELECT id FROM intl_unbilled 
             WHERE user_id = $1 
             AND fecha = $2 
             AND REGEXP_REPLACE(LOWER(TRIM(descripcion)), '\\s+', ' ', 'g') = $3
             AND amount_usd = $4
             LIMIT 1`,
            [userId, txn.fecha, descNorm, txn.amount_usd]
          );
          
          if (duplicateIntl.rows.length > 0) {
            skipped++;
            importedEmailIds.push(txn.email_id);
            console.log(`⏭️  Intl duplicada: ${txn.descripcion} - US$${txn.amount_usd}`);
            continue;
          }
          
          // Calcular monto en CLP
          const amountCLP = Math.round(txn.amount_usd * exchangeRate);
          const brand = txn.tipo_tarjeta || 'visa';
          
          console.log(`💳 Intl: ${txn.descripcion} - US$${txn.amount_usd} = $${amountCLP} CLP (${brand}), Período: ${billingPeriod.year}-${billingPeriod.month}`);
          
          // Insertar en intl_unbilled
          await client.query(
            `INSERT INTO intl_unbilled 
             (user_id, brand, fecha, descripcion, amount_usd, exchange_rate, amount_clp, tipo, original_fecha, period_year, period_month)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $3, $9, $10)`,
            [
              userId,
              brand,
              txn.fecha,
              txn.descripcion,
              txn.amount_usd,
              exchangeRate,
              amountCLP,
              txn.tipo || 'gasto',
              billingPeriod.year,
              billingPeriod.month
            ]
          );
          
          importedCount++;
          importedEmailIds.push(txn.email_id);
          console.log(`✅ Intl importada: ${txn.descripcion} - US$${txn.amount_usd}`);
          
        } else {
          // === TRANSACCIÓN NACIONAL ===
          // Verificar duplicado por email_id en metadata
          const duplicateByEmailId = await client.query(
            `SELECT id FROM transactions 
             WHERE user_id = $1 
             AND metadata->>'email_id' = $2
             LIMIT 1`,
            [userId, txn.email_id]
          );
          
          if (duplicateByEmailId.rows.length > 0) {
            skipped++;
            importedEmailIds.push(txn.email_id);
            console.log(`⏭️  Duplicada por email_id: ${txn.descripcion} (${txn.email_id})`);
            continue;
          }
          
          // Verificar duplicado por firma (fecha + descripcion + monto)
          const duplicateBySignature = await client.query(
            `SELECT id FROM transactions 
             WHERE user_id = $1 
             AND fecha = $2 
             AND descripcion = $3 
             AND monto = $4
             LIMIT 1`,
            [userId, txn.fecha, txn.descripcion, txn.monto]
          );
          
          if (duplicateBySignature.rows.length > 0) {
            skipped++;
            if (txn.email_id) importedEmailIds.push(txn.email_id);
            console.log(`⏭️  Duplicada por firma: ${txn.descripcion} - $${txn.monto} (${txn.fecha})`);
            continue;
          }
          
          // Crear ID de importación
          const importId = uuidv4();
          
          console.log(`📅 Transacción ${txn.descripcion} - Fecha: ${txn.fecha}, Período facturación: ${billingPeriod.year}-${billingPeriod.month}`);
          
          // Registrar en tabla imports con período calculado
          await client.query(
            `INSERT INTO imports 
             (id, user_id, provider, network, product_type, period_year, period_month, created_at)
             VALUES ($1, $2, $3, $4, 'email_sync', $5, $6, NOW())`,
            [
              importId, 
              userId, 
              txn.banco || 'email',
              txn.tipo_tarjeta || 'unknown',
              billingPeriod.year,
              billingPeriod.month
            ]
          );
          
          // Insertar transacción nacional
          await client.query(
            `INSERT INTO transactions 
             (id, user_id, fecha, descripcion, monto, tipo, 
              categoria, cuotas, import_id, billing_year, billing_month, metadata, created_at, updated_at)
             VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW())`,
            [
              userId,
              txn.fecha,
              txn.descripcion,
              txn.monto,
              txn.tipo,
              'Sin categorizar',
              txn.cuotas || 1,
              importId,
              billingPeriod.year,
              billingPeriod.month,
              JSON.stringify({
                email_id: txn.email_id,
                subject: txn.subject || '',
                from: txn.from || '',
                banco: txn.banco || 'desconocido',
                tipo_transaccion: txn.tipo_transaccion || '',
                tarjeta_ultimos_4: txn.tarjeta_ultimos_4 || '',
                tipo_tarjeta: txn.tipo_tarjeta || '',
                hora: txn.hora || '',
                snippet: txn.snippet || '',
                source: 'email_sync',
                parsed_at: new Date().toISOString()
              })
            ]
          );
          
          importedCount++;
          importedEmailIds.push(txn.email_id);
          console.log(`✅ Importada: ${txn.descripcion} - $${txn.monto}`);
        }
        
      } catch (txnError) {
        console.error(`❌ Error guardando transacción:`, txnError);
        errors.push({
          transaction: txn.descripcion || 'Desconocida',
          error: txnError.message
        });
      }
    }
    
    await client.query('COMMIT');
    
    console.log(`📊 Resultado final: ${importedCount} importadas, ${skipped} duplicadas, ${errors.length} errores`);
    
    res.json({
      success: true,
      imported: importedCount,
      skipped: skipped,
      errors: errors,
      processedEmailIds: importedEmailIds
    });
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error en transacción de BD:', error);
    
    res.status(500).json({
      success: false,
      message: 'Error guardando transacciones en la base de datos',
      error: error.message,
      imported: 0,
      skipped: 0,
      errors: [{ transaction: 'Global', error: error.message }]
    });
  } finally {
    client.release();
  }
});

/**
 * GET /api/transactions/sync-status
 * Endpoint para obtener información sobre la última sincronización
 * (Opcional - para implementación futura)
 */
router.get('/sync-status', auth, async (req, res) => {
  const userId = req.user.id;
  
  try {
    // Obtener la última importación de tipo email_sync
    const lastSync = await pool.query(
      `SELECT i.created_at, i.provider, i.network, COUNT(t.id) as transaction_count
       FROM imports i
       LEFT JOIN transactions t ON t.import_id = i.id
       WHERE i.user_id = $1 AND i.product_type = 'email_sync'
       GROUP BY i.id, i.created_at, i.provider, i.network
       ORDER BY i.created_at DESC
       LIMIT 1`,
      [userId]
    );
    
    if (lastSync.rows.length === 0) {
      return res.json({
        success: true,
        hasSynced: false,
        message: 'No se ha realizado ninguna sincronización aún'
      });
    }
    
    res.json({
      success: true,
      hasSynced: true,
      lastSync: {
        date: lastSync.rows[0].created_at,
        provider: lastSync.rows[0].provider,
        network: lastSync.rows[0].network,
        transactionCount: parseInt(lastSync.rows[0].transaction_count)
      }
    });
    
  } catch (error) {
    console.error('Error obteniendo estado de sync:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener estado de sincronización'
    });
  }
});

/**
 * Obtiene el tipo de cambio USD → CLP
 * Usa una API gratuita con fallback a un valor por defecto
 */
async function getExchangeRate() {
  try {
    // Intentar obtener de API gratuita
    const response = await axios.get('https://api.exchangerate-api.com/v4/latest/USD', {
      timeout: 5000
    });
    return response.data.rates.CLP || 980; // Fallback si no hay CLP
  } catch (error) {
    console.warn('Error obteniendo tipo de cambio, usando valor por defecto:', error.message);
    return 980; // Valor aproximado como fallback
  }
}

/**
 * POST /api/sync/sync-save-intl
 * Endpoint para guardar transacciones internacionales desde N8N
 * Guarda en la tabla intl_unbilled con conversión a CLP
 */
router.post('/sync-save-intl', async (req, res) => {
  console.log('📧 Recibiendo transacciones INTERNACIONALES desde N8N');
  console.log('Body:', JSON.stringify(req.body, null, 2));
  
  const { userId, transactions } = req.body;
  
  if (!userId || !transactions || !Array.isArray(transactions)) {
    console.error('❌ Datos inválidos recibidos');
    return res.status(400).json({
      success: false,
      message: 'Datos inválidos: se requiere userId y transactions[]',
      imported: 0,
      skipped: 0,
      errors: ['Estructura de datos inválida']
    });
  }
  
  let importedCount = 0;
  const importedEmailIds = [];
  let skipped = 0;
  const errors = [];
  
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Verificar que el usuario existe
    const userCheck = await client.query(
      'SELECT id FROM users WHERE id = $1',
      [userId]
    );
    
    if (userCheck.rows.length === 0) {
      throw new Error(`Usuario ${userId} no encontrado`);
    }
    
    // Obtener tipo de cambio actual
    const exchangeRate = await getExchangeRate();
    console.log(`💱 Tipo de cambio USD/CLP: ${exchangeRate}`);
    
    for (const txn of transactions) {
      try {
        // Validar datos mínimos
        if (!txn.fecha || !txn.descripcion || txn.amount_usd === null || txn.amount_usd === undefined) {
          errors.push({
            transaction: txn.descripcion || 'Sin descripción',
            error: 'Datos incompletos: se requiere fecha, descripcion, amount_usd'
          });
          continue;
        }
        
        // Validar email_id para prevenir duplicados
        if (!txn.email_id) {
          errors.push({
            transaction: txn.descripcion,
            error: 'email_id requerido para prevenir duplicados'
          });
          continue;
        }
        
        // Verificar duplicado por email_id
        const duplicateCheck = await client.query(
          `SELECT id FROM intl_unbilled 
           WHERE user_id = $1 
           AND fecha = $2 
           AND descripcion = $3 
           AND amount_usd = $4
           LIMIT 1`,
          [userId, txn.fecha, txn.descripcion, txn.amount_usd]
        );
        
        if (duplicateCheck.rows.length > 0) {
          skipped++;
          importedEmailIds.push(txn.email_id);
          console.log(`⏭️  Intl duplicada: ${txn.descripcion} - US$${txn.amount_usd}`);
          continue;
        }
        
        // Calcular período de facturación
        const billingPeriod = calculateBillingPeriod(txn.fecha);
        
        // Calcular monto en CLP
        const amountCLP = Math.round(txn.amount_usd * exchangeRate);
        
        // Determinar brand (visa/mastercard) por últimos 4 dígitos
        const brand = txn.tipo_tarjeta || 'visa';
        
        console.log(`💳 Intl: ${txn.descripcion} - US$${txn.amount_usd} = $${amountCLP} CLP (${brand})`);
        
        // Insertar en intl_unbilled
        await client.query(
          `INSERT INTO intl_unbilled 
           (user_id, brand, fecha, descripcion, amount_usd, exchange_rate, amount_clp, tipo, original_fecha, period_year, period_month)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $3, $9, $10)`,
          [
            userId,
            brand,
            txn.fecha,
            txn.descripcion,
            txn.amount_usd,
            exchangeRate,
            amountCLP,
            txn.tipo || 'gasto',
            billingPeriod.year,
            billingPeriod.month
          ]
        );
        
        importedCount++;
        importedEmailIds.push(txn.email_id);
        
      } catch (txnError) {
        console.error(`❌ Error procesando transacción intl:`, txnError.message);
        errors.push({
          transaction: txn.descripcion,
          error: txnError.message
        });
      }
    }
    
    await client.query('COMMIT');
    
    console.log(`✅ Sync intl completado: ${importedCount} importadas, ${skipped} saltadas`);
    
    res.json({
      success: true,
      imported: importedCount,
      skipped: skipped,
      errors: errors,
      processedEmailIds: importedEmailIds,
      exchangeRate: exchangeRate
    });
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error en sync intl:', error);
    res.status(500).json({
      success: false,
      message: error.message,
      imported: 0,
      skipped: 0,
      errors: [error.message]
    });
  } finally {
    client.release();
  }
});

module.exports = router;
