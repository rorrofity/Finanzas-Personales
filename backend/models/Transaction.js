class Transaction {
  constructor(db) {
    this.query = db.query;
  }

  async importFromCSV(userId, transactionData) {
    let insertedCount = 0;
    let skippedCount = 0;
    const results = [];

    try {
      for (const transaction of transactionData) {
        try {
          // Asegurarse de que la fecha sea un objeto Date
          const fecha = transaction.fecha instanceof Date ? 
            transaction.fecha : 
            new Date(transaction.fecha);

          // Asegurarse de que el monto sea un número
          const monto = typeof transaction.monto === 'number' ? 
            transaction.monto : 
            parseFloat(transaction.monto);

          // Verificar si la transacción ya existe
          const checkQuery = `
            SELECT id FROM transactions 
            WHERE user_id = $1 
            AND fecha = $2 
            AND descripcion = $3 
            AND monto = $4
          `;
          
          const existingTransaction = await this.query(checkQuery, [
            userId,
            fecha,
            transaction.descripcion,
            monto
          ]);

          if (existingTransaction.rows.length > 0) {
            console.log('Transacción duplicada encontrada:', {
              fecha: fecha,
              descripcion: transaction.descripcion,
              monto: monto
            });
            skippedCount++;
            continue;
          }

          // Intentar encontrar una categoría que coincida con el nombre
          const categoryQuery = `
            SELECT id FROM categories 
            WHERE (user_id = $1 OR user_id IS NULL)
            AND LOWER(name) = LOWER($2)
            ORDER BY user_id NULLS LAST
            LIMIT 1
          `;
          
          const categoryResult = await this.query(categoryQuery, [userId, transaction.categoria]);
          const categoryId = categoryResult.rows[0]?.id || null;

          // Insertar la nueva transacción
          const insertQuery = `
            INSERT INTO transactions (
              user_id, 
              fecha, 
              monto, 
              category_id,
              descripcion, 
              tipo,
              cuotas
            ) VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING *
          `;

          const values = [
            userId,
            fecha,
            monto,
            categoryId,
            transaction.descripcion,
            transaction.tipo || 'gasto',
            transaction.cuotas || '01'
          ];

          console.log('Insertando nueva transacción:', {
            fecha: fecha,
            descripcion: transaction.descripcion,
            monto: monto,
            tipo: transaction.tipo || 'gasto'
          });

          const result = await this.query(insertQuery, values);
          results.push(result.rows[0]);
          insertedCount++;
        } catch (error) {
          console.error('Error procesando transacción individual:', error);
          console.error('Datos de la transacción:', transaction);
          // Continuar con la siguiente transacción
          continue;
        }
      }

      const totalProcessed = insertedCount + skippedCount;
      let message = `Procesamiento completado. `;
      if (insertedCount > 0) {
        message += `Se insertaron ${insertedCount} transacciones nuevas. `;
      }
      if (skippedCount > 0) {
        message += `Se omitieron ${skippedCount} transacciones existentes.`;
      }

      return {
        insertedTransactions: results,
        message,
        stats: {
          inserted: insertedCount,
          skipped: skippedCount,
          total: totalProcessed
        }
      };

    } catch (error) {
      console.error('Error completo:', error);
      throw new Error(`Error importando transacciones: ${error.message}`);
    }
  }

  async getAllTransactions(userId) {
    try {
      const query = `
        SELECT t.*, c.name as category_name
        FROM transactions t
        LEFT JOIN categories c ON t.category_id = c.id
        WHERE t.user_id = $1
        ORDER BY t.fecha DESC, t.created_at DESC
      `;
      const result = await this.query(query, [userId]);
      return result.rows;
    } catch (error) {
      console.error('Error completo:', error);
      throw new Error(`Error obteniendo transacciones: ${error.message}`);
    }
  }

  async getTransactionsSummary(userId, startDate, endDate) {
    try {
      const query = `
        SELECT 
          t.tipo,
          c.name as category_name,
          SUM(t.monto) as total_monto,
          COUNT(*) as numero_transacciones
        FROM transactions t
        LEFT JOIN categories c ON t.category_id = c.id
        WHERE 
          t.user_id = $1 AND 
          t.fecha BETWEEN $2 AND $3
        GROUP BY t.tipo, c.name
        ORDER BY total_monto DESC
      `;

      const result = await this.query(query, [userId, startDate, endDate]);
      return result.rows;
    } catch (error) {
      console.error('Error completo:', error);
      throw new Error(`Error obteniendo resumen de transacciones: ${error.message}`);
    }
  }

  async getCategoryBreakdown(userId, year, month) {
    try {
      const query = `
        SELECT 
          c.name as category_name,
          SUM(t.monto) as total_monto,
          COUNT(*) as numero_transacciones
        FROM transactions t
        LEFT JOIN categories c ON t.category_id = c.id
        WHERE 
          t.user_id = $1 AND 
          EXTRACT(YEAR FROM t.fecha) = $2 AND
          EXTRACT(MONTH FROM t.fecha) = $3
        GROUP BY c.name
        ORDER BY total_monto DESC
      `;

      const result = await this.query(query, [userId, year, month]);
      return result.rows;
    } catch (error) {
      console.error('Error completo:', error);
      throw new Error(`Error obteniendo desglose por categoría: ${error.message}`);
    }
  }

  async deleteTransaction(userId, transactionId) {
    try {
      const result = await this.query(
        'DELETE FROM transactions WHERE id = $1 AND user_id = $2 RETURNING *',
        [transactionId, userId]
      );
      
      if (result.rows.length === 0) {
        throw new Error('Transacción no encontrada o no autorizada');
      }
      
      return result.rows[0];
    } catch (error) {
      throw error;
    }
  }

  async deleteMultipleTransactions(userId, transactionIds) {
    try {
      const result = await this.query(
        'DELETE FROM transactions WHERE id = ANY($1) AND user_id = $2 RETURNING *',
        [transactionIds, userId]
      );
      
      if (result.rows.length === 0) {
        throw new Error('No se encontraron transacciones para eliminar');
      }
      
      return result.rows;
    } catch (error) {
      throw error;
    }
  }
}

module.exports = Transaction;
