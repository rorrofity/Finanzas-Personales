const { pool } = require('../config/database');

/**
 * Detecta transacciones sospechosas de ser duplicadas
 * Criterio: misma fecha + mismo monto
 */
async function detectSuspiciousDuplicates(transactionId, userId) {
  try {
    // Obtener la transacción recién insertada
    const txResult = await pool.query(
      'SELECT fecha, monto, tipo FROM transactions WHERE id = $1',
      [transactionId]
    );

    if (txResult.rows.length === 0) {
      return [];
    }

    const tx = txResult.rows[0];

    // Buscar transacciones con misma fecha y monto (excluyendo la actual)
    const query = `
      SELECT id, descripcion, created_at
      FROM transactions
      WHERE user_id = $1
        AND id != $2
        AND fecha = $3
        AND monto = $4
        AND tipo = $5
        AND NOT EXISTS (
          SELECT 1 FROM suspicious_duplicates
          WHERE (transaction_id = $2 AND similar_to_id = transactions.id)
             OR (transaction_id = transactions.id AND similar_to_id = $2)
        )
      ORDER BY created_at DESC
    `;

    const result = await pool.query(query, [
      userId,
      transactionId,
      tx.fecha,
      tx.monto,
      tx.tipo
    ]);

    return result.rows;
  } catch (error) {
    console.error('Error detectando duplicados sospechosos:', error);
    return [];
  }
}

/**
 * Registra un par de transacciones sospechosas
 */
async function flagAsSuspicious(transactionId, similarToId) {
  try {
    await pool.query(
      `INSERT INTO suspicious_duplicates (transaction_id, similar_to_id, status)
       VALUES ($1, $2, 'pending')
       ON CONFLICT (transaction_id, similar_to_id) DO NOTHING`,
      [transactionId, similarToId]
    );
  } catch (error) {
    console.error('Error marcando como sospechoso:', error);
  }
}

/**
 * Obtiene todas las transacciones sospechosas pendientes de revisión
 */
async function getPendingSuspicious(userId) {
  try {
    const query = `
      SELECT 
        sd.id as suspicious_id,
        sd.created_at as detected_at,
        t1.id as transaction1_id,
        t1.fecha as fecha1,
        t1.descripcion as descripcion1,
        t1.monto as monto1,
        t1.created_at as imported1_at,
        t2.id as transaction2_id,
        t2.fecha as fecha2,
        t2.descripcion as descripcion2,
        t2.monto as monto2,
        t2.created_at as imported2_at
      FROM suspicious_duplicates sd
      JOIN transactions t1 ON sd.transaction_id = t1.id
      JOIN transactions t2 ON sd.similar_to_id = t2.id
      WHERE sd.status = 'pending'
        AND t1.user_id = $1
      ORDER BY sd.created_at DESC
    `;

    const result = await pool.query(query, [userId]);
    return result.rows;
  } catch (error) {
    console.error('Error obteniendo duplicados sospechosos:', error);
    return [];
  }
}

/**
 * Cuenta transacciones sospechosas pendientes
 */
async function countPendingSuspicious(userId) {
  try {
    const query = `
      SELECT COUNT(*) as count
      FROM suspicious_duplicates sd
      JOIN transactions t ON sd.transaction_id = t.id
      WHERE sd.status = 'pending'
        AND t.user_id = $1
    `;

    const result = await pool.query(query, [userId]);
    return parseInt(result.rows[0].count);
  } catch (error) {
    console.error('Error contando duplicados sospechosos:', error);
    return 0;
  }
}

/**
 * Resuelve un duplicado sospechoso
 */
async function resolveSuspicious(suspiciousId, action, userId, transactionIdToDelete = null) {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');

    if (action === 'delete' && transactionIdToDelete) {
      // Eliminar la transacción seleccionada
      await client.query(
        'DELETE FROM transactions WHERE id = $1 AND user_id = $2',
        [transactionIdToDelete, userId]
      );

      // Actualizar estado
      await client.query(
        `UPDATE suspicious_duplicates 
         SET status = 'duplicate_removed', 
             reviewed_at = NOW(), 
             reviewed_by = $2
         WHERE id = $1`,
        [suspiciousId, userId]
      );
    } else if (action === 'keep_both') {
      // Solo marcar como revisado
      await client.query(
        `UPDATE suspicious_duplicates 
         SET status = 'kept_both', 
             reviewed_at = NOW(), 
             reviewed_by = $2
         WHERE id = $1`,
        [suspiciousId, userId]
      );
    }

    await client.query('COMMIT');
    return { success: true };
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error resolviendo duplicado sospechoso:', error);
    return { success: false, error: error.message };
  } finally {
    client.release();
  }
}

module.exports = {
  detectSuspiciousDuplicates,
  flagAsSuspicious,
  getPendingSuspicious,
  countPendingSuspicious,
  resolveSuspicious
};
