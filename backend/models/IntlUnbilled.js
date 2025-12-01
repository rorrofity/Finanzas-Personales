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

    // Función para normalizar descripción (minúsculas, sin espacios extras)
    const normalizeDesc = (desc) => (desc || '').toLowerCase().trim().replace(/\s+/g, ' ');
    
    // Obtener transacciones existentes para verificar duplicados
    // Normalizar descripcion eliminando espacios múltiples
    const existingRes = await this.query(
      `SELECT fecha, REGEXP_REPLACE(LOWER(TRIM(descripcion)), '\\s+', ' ', 'g') as descripcion_norm, amount_usd 
       FROM intl_unbilled WHERE user_id = $1`,
      [userId]
    );
    const existingSet = new Set(
      existingRes.rows.map(r => `${r.fecha}|${r.descripcion_norm}|${r.amount_usd}`)
    );

    const values = [];
    const params = [];
    let p = 1;
    let skipped = 0;
    
    for (const r of rows) {
      const fecha = r.fecha; // fecha original del movimiento
      const descripcion = (r.descripcion || '').slice(0, 255);
      const descripcionNorm = normalizeDesc(descripcion);
      const amount_usd = Number(r.amount_usd);
      const tipo = String(r.tipo || '').toLowerCase();
      const category_id = r.category_id || null;
      
      if (!fecha || !descripcion || Number.isNaN(amount_usd) || !['gasto','pago','desestimar'].includes(tipo)) continue;
      
      // Verificar duplicado por firma (fecha + descripcion normalizada + amount_usd)
      const signature = `${fecha}|${descripcionNorm}|${amount_usd}`;
      if (existingSet.has(signature)) {
        console.log(`⏭️  Intl duplicada CSV: ${descripcion} - US$${amount_usd} (${fecha})`);
        skipped++;
        continue;
      }
      
      // Agregar a existingSet para evitar duplicados dentro del mismo archivo
      existingSet.add(signature);
      
      const amount_clp = Math.round(amount_usd * rate);
      params.push(userId, b, fecha, descripcion, amount_usd, rate, amount_clp, tipo, category_id, fecha, py, pm);
      values.push(`($${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++})`);
    }
    
    if (!values.length) return { inserted: 0, skipped };

    const sql = `INSERT INTO intl_unbilled (
        user_id, brand, fecha, descripcion, amount_usd, exchange_rate, amount_clp, tipo, category_id, original_fecha, period_year, period_month
      ) VALUES ${values.join(',')}`;
    await this.query(sql, params);
    return { inserted: values.length, skipped };
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
}

module.exports = IntlUnbilled;
