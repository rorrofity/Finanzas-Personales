class IntlUnbilled {
  constructor(db) {
    this.query = db.query;
  }

  async listByMonth(userId, year, month) {
    const res = await this.query(
      `SELECT * FROM intl_unbilled
       WHERE user_id=$1 AND period_year=$2 AND period_month=$3
       ORDER BY fecha DESC, created_at DESC`,
      [userId, year, month]
    );
    return res.rows;
  }

  async summaryByMonth(userId, year, month) {
    const sumRes = await this.query(
      `SELECT brand,
              SUM(CASE WHEN tipo='gasto' THEN amount_clp ELSE 0 END) AS gastos_clp,
              SUM(CASE WHEN tipo='pago' THEN amount_clp ELSE 0 END) AS pagos_clp
       FROM intl_unbilled
       WHERE user_id=$1 AND period_year=$2 AND period_month=$3 AND tipo <> 'desestimar'
       GROUP BY brand`,
      [userId, year, month]
    );
    const latestRes = await this.query(
      `SELECT DISTINCT ON (brand) brand, exchange_rate
       FROM intl_unbilled
       WHERE user_id=$1 AND period_year=$2 AND period_month=$3
       ORDER BY brand, created_at DESC`,
      [userId, year, month]
    );
    const latestMap = new Map(latestRes.rows.map(r => [r.brand, r.exchange_rate]));
    return sumRes.rows.map(r => ({
      brand: r.brand,
      gastos_clp: Number(r.gastos_clp || 0),
      pagos_clp: Number(r.pagos_clp || 0),
      latest_exchange_rate: latestMap.get(r.brand) || null
    }));
  }

  async bulkImport(userId, { brand, exchange_rate, rows, periodYear, periodMonth }) {
    const b = String(brand || '').toLowerCase();
    const rate = Number(exchange_rate);
    if (!['visa','mastercard'].includes(b)) throw new Error('Marca inválida');
    if (!rate || rate <= 0) throw new Error('Tipo de cambio inválido');
    const py = parseInt(periodYear, 10);
    const pm = parseInt(periodMonth, 10);
    if (!py || py < 2000 || py > 2100) throw new Error('periodYear inválido');
    if (!pm || pm < 1 || pm > 12) throw new Error('periodMonth inválido');

    const values = [];
    const params = [];
    let p = 1;
    const insertedIds = [];
    
    for (const r of rows) {
      const fecha = r.fecha;
      const descripcion = (r.descripcion || '').slice(0, 255);
      const amount_usd = Number(r.amount_usd);
      const tipo = String(r.tipo || '').toLowerCase();
      const category_id = r.category_id || null;
      
      if (!fecha || !descripcion || Number.isNaN(amount_usd) || !['gasto','pago','desestimar'].includes(tipo)) continue;
      
      const amount_clp = Math.round(amount_usd * rate);
      params.push(userId, b, fecha, descripcion, amount_usd, rate, amount_clp, tipo, category_id, fecha, py, pm);
      values.push(`($${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++})`);
    }
    
    if (!values.length) return { inserted: 0, suspiciousCount: 0 };

    // Insertar todas las transacciones y obtener IDs
    const sql = `INSERT INTO intl_unbilled (
        user_id, brand, fecha, descripcion, amount_usd, exchange_rate, amount_clp, tipo, category_id, original_fecha, period_year, period_month
      ) VALUES ${values.join(',')} RETURNING id, fecha, amount_usd`;
    const insertResult = await this.query(sql, params);
    
    // Detectar duplicados sospechosos (misma fecha + amount_usd)
    let suspiciousCount = 0;
    for (const inserted of insertResult.rows) {
      const similar = await this.query(
        `SELECT id FROM intl_unbilled 
         WHERE user_id = $1 AND fecha = $2 AND amount_usd = $3 AND id != $4`,
        [userId, inserted.fecha, inserted.amount_usd, inserted.id]
      );
      
      for (const match of similar.rows) {
        // Verificar que no exista ya este par como sospechoso
        const existing = await this.query(
          `SELECT 1 FROM intl_suspicious_duplicates 
           WHERE (intl_id = $1 AND similar_to_id = $2) OR (intl_id = $2 AND similar_to_id = $1)`,
          [inserted.id, match.id]
        );
        
        if (existing.rows.length === 0) {
          await this.query(
            `INSERT INTO intl_suspicious_duplicates (intl_id, similar_to_id, status)
             VALUES ($1, $2, 'pending') ON CONFLICT DO NOTHING`,
            [inserted.id, match.id]
          );
          suspiciousCount++;
          console.log(`⚠️  Duplicado sospechoso intl: fecha=${inserted.fecha}, amount_usd=${inserted.amount_usd}`);
        }
      }
    }
    
    return { inserted: insertResult.rows.length, suspiciousCount };
  }

  async create(userId, data) {
    const { brand, fecha, descripcion, amount_usd, exchange_rate, tipo, category_id=null } = data;
    const amount_clp = Math.round(Number(amount_usd) * Number(exchange_rate));
    const res = await this.query(
      `INSERT INTO intl_unbilled (user_id, brand, fecha, descripcion, amount_usd, exchange_rate, amount_clp, tipo, category_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [userId, brand, fecha, descripcion, amount_usd, exchange_rate, amount_clp, tipo, category_id]
    );
    return res.rows[0];
  }

  async update(userId, id, data) {
    const { descripcion, amount_usd, exchange_rate, tipo, category_id } = data;
    const res = await this.query(
      `UPDATE intl_unbilled SET
         descripcion = COALESCE($1, descripcion),
         amount_usd = COALESCE($2, amount_usd),
         exchange_rate = COALESCE($3, exchange_rate),
         amount_clp = CASE WHEN $2 IS NOT NULL OR $3 IS NOT NULL THEN ROUND(COALESCE($2, amount_usd) * COALESCE($3, exchange_rate)) ELSE amount_clp END,
         tipo = COALESCE($4, tipo),
         category_id = COALESCE($5, category_id),
         updated_at = CURRENT_TIMESTAMP
       WHERE id=$6 AND user_id=$7 RETURNING *`,
      [descripcion || null, amount_usd === undefined ? null : Number(amount_usd), exchange_rate === undefined ? null : Number(exchange_rate), tipo || null, category_id || null, id, userId]
    );
    return res.rows[0];
  }

  async delete(userId, id) {
    await this.query(`DELETE FROM intl_unbilled WHERE id=$1 AND user_id=$2`, [id, userId]);
  }

  // === DUPLICADOS SOSPECHOSOS ===
  
  async getPendingSuspicious(userId) {
    const res = await this.query(`
      SELECT 
        sd.id as suspicious_id,
        sd.created_at as detected_at,
        t1.id as intl1_id,
        t1.fecha as fecha1,
        t1.descripcion as descripcion1,
        t1.amount_usd as amount_usd1,
        t1.amount_clp as amount_clp1,
        t1.exchange_rate as rate1,
        t1.brand as brand1,
        t1.created_at as imported1_at,
        t2.id as intl2_id,
        t2.fecha as fecha2,
        t2.descripcion as descripcion2,
        t2.amount_usd as amount_usd2,
        t2.amount_clp as amount_clp2,
        t2.exchange_rate as rate2,
        t2.brand as brand2,
        t2.created_at as imported2_at
      FROM intl_suspicious_duplicates sd
      JOIN intl_unbilled t1 ON sd.intl_id = t1.id
      JOIN intl_unbilled t2 ON sd.similar_to_id = t2.id
      WHERE sd.status = 'pending'
        AND t1.user_id = $1
      ORDER BY sd.created_at DESC
    `, [userId]);
    return res.rows;
  }

  async countPendingSuspicious(userId) {
    const res = await this.query(`
      SELECT COUNT(*) as count
      FROM intl_suspicious_duplicates sd
      JOIN intl_unbilled t ON sd.intl_id = t.id
      WHERE sd.status = 'pending' AND t.user_id = $1
    `, [userId]);
    return parseInt(res.rows[0].count);
  }

  async resolveSuspicious(suspiciousId, action, userId, intlIdToDelete = null) {
    if (action === 'delete' && intlIdToDelete) {
      await this.query('DELETE FROM intl_unbilled WHERE id = $1 AND user_id = $2', [intlIdToDelete, userId]);
      await this.query(
        `UPDATE intl_suspicious_duplicates SET status = 'duplicate_removed', reviewed_at = NOW(), reviewed_by = $2 WHERE id = $1`,
        [suspiciousId, userId]
      );
    } else if (action === 'keep_both') {
      await this.query(
        `UPDATE intl_suspicious_duplicates SET status = 'kept_both', reviewed_at = NOW(), reviewed_by = $2 WHERE id = $1`,
        [suspiciousId, userId]
      );
    }
    return { success: true };
  }
}

module.exports = IntlUnbilled;
