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
    
    // Determinar URL de N8N según ambiente
    const n8nUrl = process.env.NODE_ENV === 'production'
      ? 'http://localhost:5678/webhook/sync-bank-emails'
      : 'http://localhost:5678/webhook/sync-bank-emails';
    
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
    
    // Extraer resultado
    const result = n8nResponse.data || {};
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
  
  let imported = 0;
  let skipped = 0;
  let errors = [];
  
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
    
    for (const txn of transactions) {
      try {
        // Validar datos mínimos de la transacción (campos requeridos en la tabla)
        if (!txn.fecha || !txn.descripcion || txn.monto === null || txn.monto === undefined || !txn.tipo) {
          errors.push({
            transaction: txn.descripcion || 'Sin descripción',
            error: 'Datos incompletos: se requiere fecha, descripcion, monto y tipo',
            received: { fecha: txn.fecha, descripcion: txn.descripcion, monto: txn.monto, tipo: txn.tipo }
          });
          continue;
        }
        
        // Validar que email_id existe para prevenir duplicados
        if (!txn.email_id) {
          errors.push({
            transaction: txn.descripcion,
            error: 'email_id requerido para prevenir duplicados'
          });
          continue;
        }
        
        // Verificar duplicado por email_id en metadata
        const duplicateCheck = await client.query(
          `SELECT id FROM transactions 
           WHERE user_id = $1 
           AND metadata->>'email_id' = $2
           LIMIT 1`,
          [userId, txn.email_id]
        );
        
        if (duplicateCheck.rows.length > 0) {
          skipped++;
          console.log(`⏭️  Duplicada: ${txn.descripcion} (${txn.email_id})`);
          continue;
        }
        
        // Crear ID de importación
        const importId = uuidv4();
        
        // Calcular período de facturación automáticamente
        const billingPeriod = calculateBillingPeriod(txn.fecha);
        console.log(`📅 Transacción ${txn.descripcion} - Fecha: ${txn.fecha}, Período facturación: ${billingPeriod.year}-${billingPeriod.month}`);
        
        // Registrar en tabla imports con período calculado
        await client.query(
          `INSERT INTO imports 
           (id, user_id, provider, network, product_type, period_year, period_month, created_at)
           VALUES ($1, $2, $3, $4, 'email_sync', $5, $6, NOW())`,
          [
            importId, 
            userId, 
            txn.banco || 'email', // banco_chile, santander, bci, etc.
            txn.tipo_tarjeta || 'unknown', // visa, mastercard
            billingPeriod.year,
            billingPeriod.month
          ]
        );
        
        // Insertar transacción con campos parseados de N8N
        await client.query(
          `INSERT INTO transactions 
           (id, user_id, fecha, descripcion, monto, tipo, 
            categoria, cuotas, import_id, metadata, created_at, updated_at)
           VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())`,
          [
            userId,
            txn.fecha, // Ya viene en formato YYYY-MM-DD desde N8N
            txn.descripcion, // Descripción del comercio parseada
            txn.monto, // Monto numérico parseado
            txn.tipo, // 'gasto' (viene de N8N)
            'Sin categorizar', // categoría por defecto (usuario categoriza después)
            txn.cuotas || 1, // Cuotas (viene de N8N, default 1)
            importId,
            JSON.stringify({
              email_id: txn.email_id, // ID único del email para prevenir duplicados
              subject: txn.subject || '', // Subject del email
              from: txn.from || '', // Remitente
              banco: txn.banco || 'desconocido', // banco_chile
              tipo_transaccion: txn.tipo_transaccion || '', // compra_tc
              tarjeta_ultimos_4: txn.tarjeta_ultimos_4 || '', // 3076
              tipo_tarjeta: txn.tipo_tarjeta || '', // visa/mastercard
              hora: txn.hora || '', // HH:MM
              snippet: txn.snippet || '', // Texto del email para referencia
              source: 'email_sync',
              parsed_at: new Date().toISOString()
            })
          ]
        );
        
        imported++;
        console.log(`✅ Importada: ${txn.descripcion} - $${txn.monto}`);
        
      } catch (txnError) {
        console.error(`❌ Error guardando transacción:`, txnError);
        errors.push({
          transaction: txn.descripcion || 'Desconocida',
          error: txnError.message
        });
      }
    }
    
    await client.query('COMMIT');
    
    console.log(`📊 Resultado final: ${imported} importadas, ${skipped} duplicadas, ${errors.length} errores`);
    
    res.json({
      success: true,
      imported: imported,
      skipped: skipped,
      errors: errors
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

module.exports = router;
