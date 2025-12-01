const { detectSuspiciousDuplicates, flagAsSuspicious } = require('../utils/suspiciousDetector');

class Transaction {
  constructor(db) {
    this.query = db.query;
  }

  async removeUniqueConstraint() {
    try {
      const query = `
        ALTER TABLE transactions 
        DROP CONSTRAINT IF EXISTS transactions_user_id_fecha_descripcion_monto_key;
      `;
      await this.query(query);
      console.log('Restricción de unicidad eliminada con éxito');
    } catch (error) {
      console.error('Error al eliminar la restricción de unicidad:', error);
      // No lanzamos el error aquí para permitir que la importación continúe incluso si la restricción ya no existe
    }
  }

  async importFromCSV(userId, transactionData, importId = null, billingYear = null, billingMonth = null) {
    let insertedCount = 0;
    let skippedCount = 0;
    const results = [];

    try {
      // Eliminar la restricción de unicidad antes de comenzar
      await this.removeUniqueConstraint();

      console.log('=== INICIO DE IMPORTACIÓN ===');
      console.log('Usuario:', userId);
      console.log('Transacciones a procesar:', transactionData.length);
      
      // Obtener las transacciones existentes ANTES de comenzar la importación
      const existingTransactionsQuery = `
        SELECT fecha, descripcion, monto 
        FROM transactions 
        WHERE user_id = $1
      `;
      
      const existingTransactionsResult = await this.query(existingTransactionsQuery, [userId]);
      console.log('Transacciones existentes encontradas:', existingTransactionsResult.rows.length);
      
      // Crear un conjunto de transacciones existentes para búsqueda rápida
      const existingTransactions = new Set();
      existingTransactionsResult.rows.forEach(t => {
        // Formatear la fecha para que coincida con el formato de las nuevas transacciones
        const fecha = t.fecha instanceof Date ? t.fecha : new Date(t.fecha);
        const fechaStr = fecha.toISOString().split('T')[0];
        const key = `${fechaStr}-${t.descripcion}-${t.monto}`;
        existingTransactions.add(key);
      });

      // Procesar todas las transacciones nuevas
      for (const [index, transaction] of transactionData.entries()) {
        try {
          console.log(`\nProcesando transacción ${index + 1}/${transactionData.length}`);
          
          // Asegurarse de que la fecha sea un objeto Date
          const fecha = transaction.fecha instanceof Date ? 
            transaction.fecha : 
            new Date(transaction.fecha);

          // Formatear la fecha para la comparación
          const fechaStr = fecha.toISOString().split('T')[0];

          // Asegurarse de que el monto sea un número
          const monto = typeof transaction.monto === 'number' ? 
            transaction.monto : 
            parseFloat(transaction.monto);

          // Crear una clave única para esta transacción
          const transactionKey = `${fechaStr}-${transaction.descripcion}-${monto}`;
          console.log('Clave de transacción:', transactionKey);

          // Solo verificar contra las transacciones que existían antes de comenzar
          if (existingTransactions.has(transactionKey)) {
            console.log('Transacción duplicada encontrada en base de datos:', {
              fecha: fechaStr,
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

          // Calcular billing period si no se proporciona explícitamente
          // Regla: día >= 22 → factura 2 meses después; día < 22 → 1 mes después
          let txBillingYear = billingYear;
          let txBillingMonth = billingMonth;
          
          if (!txBillingYear || !txBillingMonth) {
            const day = fecha.getDate();
            const month = fecha.getMonth() + 1;
            const year = fecha.getFullYear();
            
            if (day >= 22) {
              txBillingMonth = month + 2;
              txBillingYear = year;
            } else {
              txBillingMonth = month + 1;
              txBillingYear = year;
            }
            
            // Ajustar si el mes se pasa de 12
            if (txBillingMonth > 12) {
              txBillingYear += Math.floor((txBillingMonth - 1) / 12);
              txBillingMonth = ((txBillingMonth - 1) % 12) + 1;
            }
          }

          // Insertar la nueva transacción con período de facturación
          const insertQuery = `
            INSERT INTO transactions (
              user_id, 
              fecha, 
              monto, 
              category_id,
              descripcion, 
              tipo,
              cuotas,
              import_id,
              billing_year,
              billing_month
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            RETURNING *
          `;

          const values = [
            userId,
            fecha,
            monto,
            categoryId,
            transaction.descripcion,
            transaction.tipo || 'gasto',
            transaction.cuotas || '01',
            importId,
            txBillingYear,
            txBillingMonth
          ];

          const result = await this.query(insertQuery, values);
          const insertedTx = result.rows[0];
          console.log('Insertando nueva transacción:', {
            fecha: fechaStr,
            descripcion: transaction.descripcion,
            monto: monto,
            tipo: transaction.tipo || 'gasto'
          });

          // Detectar posibles duplicados (misma fecha + mismo monto pero descripción diferente)
          try {
            const suspiciousMatches = await detectSuspiciousDuplicates(insertedTx.id, userId);
            if (suspiciousMatches.length > 0) {
              console.log(`⚠️  Posible duplicado detectado para ${transaction.descripcion}:`, 
                suspiciousMatches.map(m => m.descripcion));
              // Marcar cada par como sospechoso
              for (const match of suspiciousMatches) {
                await flagAsSuspicious(insertedTx.id, match.id);
              }
            }
          } catch (suspiciousError) {
            console.error('Error detectando duplicados sospechosos:', suspiciousError);
            // No interrumpir la importación por este error
          }

          results.push(insertedTx);
          insertedCount++;
        } catch (error) {
          console.error('Error procesando transacción:', error);
          if (error.code === '23505') { // Error de duplicado
            console.log('Transacción duplicada detectada, saltando:', {
              fecha: fechaStr,
              descripcion: transaction.descripcion,
              monto: monto
            });
            skippedCount++;
          } else {
            // Para otros errores, los registramos pero continuamos con la siguiente transacción
            console.error('Error al procesar la transacción, continuando con la siguiente:', error);
          }
        }
      }

      return {
        message: 'Importación completada con éxito',
        stats: {
          total: transactionData.length,
          inserted: insertedCount,
          skipped: skippedCount
        },
        insertedTransactions: results
      };

    } catch (error) {
      console.error('Error en importFromCSV:', error);
      throw error;
    }
  }

  async getAllTransactions(userId, orderBy = 'fecha', orderDirection = 'DESC', startDate = null, endDate = null, periodYear = null, periodMonth = null) {
    try {
      // Validar los campos de ordenamiento permitidos
      const allowedFields = ['fecha', 'descripcion', 'monto', 'category_name', 'tipo', 'provider', 'network'];
      const field = allowedFields.includes(orderBy) ? orderBy : 'fecha';
      
      // Validar la dirección del ordenamiento
      const direction = orderDirection.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

      // Construir la consulta con ordenamiento dinámico
      // Filtrar por billing_year/billing_month (período de pago) en lugar de fecha de transacción
      const query = `
        SELECT 
          t.*, 
          c.name as category_name,
          i.provider,
          i.network
        FROM transactions t
        LEFT JOIN categories c ON t.category_id = c.id
        LEFT JOIN imports i ON t.import_id = i.id
        WHERE t.user_id = $1
        ${periodYear && periodMonth ? 'AND (COALESCE(t.billing_year, EXTRACT(YEAR FROM t.fecha)) = $2 AND COALESCE(t.billing_month, EXTRACT(MONTH FROM t.fecha)) = $3)' : (startDate && endDate ? 'AND t.fecha >= $2 AND t.fecha <= $3' : '')}
        ORDER BY ${field === 'category_name' ? 'c.name' : (field === 'provider' ? 'i.provider' : (field === 'network' ? 'i.network' : 't.' + field))} ${direction}, t.created_at DESC
      `;
      
      const params = [userId];
      if (periodYear && periodMonth) {
        params.push(periodYear, periodMonth);
      } else if (startDate && endDate) {
        params.push(startDate, endDate);
      }
      const result = await this.query(query, params);
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
