class Checking {
  constructor(db) { this.query = db.query; }

  async getInitialBalance(userId, year, month) {
    const r = await this.query(`SELECT initial_balance FROM checking_balances WHERE user_id=$1 AND year=$2 AND month=$3`, [userId, year, month]);
    return r.rows[0]?.initial_balance ?? 0;
  }

  async setInitialBalance(userId, year, month, amount) {
    await this.query(`INSERT INTO checking_balances(user_id,year,month,initial_balance) VALUES($1,$2,$3,$4)
      ON CONFLICT(user_id,year,month) DO UPDATE SET initial_balance=EXCLUDED.initial_balance, updated_at=CURRENT_TIMESTAMP`, [userId, year, month, amount]);
    return { initial_balance: amount };
  }

  /**
   * Obtener saldo actual conocido (de la última cartola)
   */
  async getKnownBalance(userId) {
    const r = await this.query(
      `SELECT known_balance, balance_date FROM checking_balances WHERE user_id=$1 AND known_balance IS NOT NULL ORDER BY balance_date DESC LIMIT 1`,
      [userId]
    );
    return r.rows[0] || null;
  }

  /**
   * Guardar saldo conocido de cartola
   */
  async setKnownBalance(userId, amount, balanceDate) {
    // Derivar año/mes de la fecha
    const d = new Date(balanceDate);
    const year = d.getFullYear();
    const month = d.getMonth() + 1;
    
    await this.query(
      `INSERT INTO checking_balances(user_id, year, month, initial_balance, known_balance, balance_date) 
       VALUES($1, $2, $3, 0, $4, $5)
       ON CONFLICT(user_id, year, month) DO UPDATE SET 
         known_balance = EXCLUDED.known_balance, 
         balance_date = EXCLUDED.balance_date,
         updated_at = CURRENT_TIMESTAMP`,
      [userId, year, month, amount, balanceDate]
    );
    return { known_balance: amount, balance_date: balanceDate };
  }

  async list(userId, year, month) {
    const r = await this.query(`SELECT * FROM checking_transactions WHERE user_id=$1 AND year=$2 AND month=$3 ORDER BY fecha DESC, created_at DESC`, [userId, year, month]);
    return r.rows;
  }

  /**
   * Lista transacciones de los últimos N meses (rolling window)
   */
  async listRecentMonths(userId, months = 6) {
    const r = await this.query(
      `SELECT * FROM checking_transactions 
       WHERE user_id = $1 
         AND fecha >= (CURRENT_DATE - INTERVAL '${months} months')::date
       ORDER BY fecha DESC, created_at DESC`,
      [userId]
    );
    return r.rows;
  }

  async listAll(userId) {
    const r = await this.query(`SELECT * FROM checking_transactions WHERE user_id=$1 ORDER BY fecha DESC, created_at DESC`, [userId]);
    return r.rows;
  }

  async listPaged(userId, limit, offset) {
    const r = await this.query(
      `SELECT * FROM checking_transactions WHERE user_id=$1 ORDER BY fecha DESC, created_at DESC LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );
    return r.rows;
  }

  async countAll(userId) {
    const r = await this.query(`SELECT COUNT(*)::int AS cnt FROM checking_transactions WHERE user_id=$1`, [userId]);
    return r.rows[0]?.cnt || 0;
  }

  async countRecentMonths(userId, months = 6) {
    const r = await this.query(
      `SELECT COUNT(*)::int AS cnt FROM checking_transactions 
       WHERE user_id = $1 
         AND fecha >= (CURRENT_DATE - INTERVAL '${months} months')::date`,
      [userId]
    );
    return r.rows[0]?.cnt || 0;
  }

  async summary(userId, year, month) {
    const r = await this.query(`SELECT 
      COALESCE(SUM(CASE WHEN tipo='abono' THEN amount ELSE 0 END),0) AS abonos,
      COALESCE(SUM(CASE WHEN tipo='cargo' THEN amount ELSE 0 END),0) AS cargos
      FROM checking_transactions WHERE user_id=$1 AND year=$2 AND month=$3`, [userId, year, month]);
    const initial = await this.getInitialBalance(userId, year, month);
    const abonos = Number(r.rows[0].abonos || 0);
    const cargos = Number(r.rows[0].cargos || 0);
    const neto = abonos - cargos;
    const saldo_actual = Number(initial) + neto;
    return { initial_balance: Number(initial), abonos, cargos, neto, saldo_actual };
  }

  /**
   * Obtiene el saldo actual de la cuenta corriente
   * Prioriza: saldo conocido de cartola > cálculo manual
   */
  async globalBalance(userId) {
    // Primero buscar saldo conocido de cartola (más confiable)
    const knownRes = await this.query(
      `SELECT known_balance, balance_date FROM checking_balances 
       WHERE user_id = $1 AND known_balance IS NOT NULL 
       ORDER BY balance_date DESC LIMIT 1`,
      [userId]
    );
    
    if (knownRes.rows.length > 0) {
      const knownBalance = Number(knownRes.rows[0].known_balance);
      const balanceDate = knownRes.rows[0].balance_date;
      
      // Sumar movimientos POSTERIORES a la fecha del saldo conocido
      const movRes = await this.query(
        `SELECT 
          COALESCE(SUM(CASE WHEN tipo='abono' THEN amount ELSE 0 END),0) AS total_abonos,
          COALESCE(SUM(CASE WHEN tipo='cargo' THEN amount ELSE 0 END),0) AS total_cargos
        FROM checking_transactions 
        WHERE user_id = $1 AND fecha > $2`,
        [userId, balanceDate]
      );
      
      const abonosPosteriores = Number(movRes.rows[0].total_abonos || 0);
      const cargosPosteriores = Number(movRes.rows[0].total_cargos || 0);
      
      return {
        known_balance: knownBalance,
        balance_date: balanceDate,
        abonos_posteriores: abonosPosteriores,
        cargos_posteriores: cargosPosteriores,
        saldo_actual: knownBalance + abonosPosteriores - cargosPosteriores,
        source: 'cartola'
      };
    }
    
    // Fallback: calcular desde saldo inicial + movimientos
    const initialRes = await this.query(
      `SELECT initial_balance FROM checking_balances WHERE user_id = $1 ORDER BY year ASC, month ASC LIMIT 1`,
      [userId]
    );
    const initialBalance = Number(initialRes.rows[0]?.initial_balance || 0);
    
    const movRes = await this.query(
      `SELECT 
        COALESCE(SUM(CASE WHEN tipo='abono' THEN amount ELSE 0 END),0) AS total_abonos,
        COALESCE(SUM(CASE WHEN tipo='cargo' THEN amount ELSE 0 END),0) AS total_cargos
      FROM checking_transactions WHERE user_id = $1`,
      [userId]
    );
    
    const totalAbonos = Number(movRes.rows[0].total_abonos || 0);
    const totalCargos = Number(movRes.rows[0].total_cargos || 0);
    
    return {
      initial_balance: initialBalance,
      total_abonos: totalAbonos,
      total_cargos: totalCargos,
      saldo_actual: initialBalance + totalAbonos - totalCargos,
      source: 'calculated'
    };
  }

  async create(userId, data) {
    const { year, month, fecha, descripcion, tipo, amount, category_id=null, notas=null } = data;
    const res = await this.query(`INSERT INTO checking_transactions(user_id,year,month,fecha,descripcion,tipo,amount,category_id,notas)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`, [userId, year, month, fecha, descripcion, tipo, amount, category_id, notas]);
    return res.rows[0];
  }

  async update(userId, id, data) {
    const { fecha, descripcion, tipo, amount, category_id, notas } = data;
    // Para category_id: si se pasa explícitamente (incluso null), usarlo; si no se pasa, mantener el actual
    const catValue = 'category_id' in data ? category_id : undefined;
    const res = await this.query(`UPDATE checking_transactions SET
      fecha = COALESCE($1, fecha),
      descripcion = COALESCE($2, descripcion),
      tipo = COALESCE($3, tipo),
      amount = COALESCE($4, amount),
      category_id = CASE WHEN $9 THEN $5 ELSE category_id END,
      notas = COALESCE($6, notas),
      updated_at = CURRENT_TIMESTAMP
      WHERE id=$7 AND user_id=$8 RETURNING *`, [
        fecha||null, 
        descripcion||null, 
        tipo||null, 
        amount===undefined?null:amount, 
        catValue===undefined?null:catValue, 
        notas||null, 
        id, 
        userId,
        catValue !== undefined  // $9: flag to indicate if category_id should be updated
      ]);
    return res.rows[0];
  }

  async delete(userId, id) {
    await this.query(`DELETE FROM checking_transactions WHERE id=$1 AND user_id=$2`, [id, userId]);
  }

  /**
   * Importación masiva con detección de duplicados
   * Duplicado = misma fecha + monto + tipo + descripción normalizada
   */
  async bulkImport(userId, rows) {
    // Función para normalizar descripción (quitar espacios extras, lowercase, trim)
    const normalizeDesc = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 60);
    
    // Función para normalizar fecha a YYYY-MM-DD
    const normalizeDate = (d) => {
      if (!d) return null;
      if (typeof d === 'string') return d.slice(0, 10);
      if (d instanceof Date) return d.toISOString().slice(0, 10);
      return String(d).slice(0, 10);
    };

    // Obtener transacciones existentes del usuario
    const existingRes = await this.query(
      `SELECT fecha, amount, tipo, descripcion FROM checking_transactions WHERE user_id = $1`,
      [userId]
    );
    
    // Crear mapa de existentes: key = fecha|monto|tipo|descripcion_normalizada
    const existingSet = new Set();
    for (const row of existingRes.rows) {
      const key = `${normalizeDate(row.fecha)}|${Number(row.amount)}|${row.tipo}|${normalizeDesc(row.descripcion)}`;
      existingSet.add(key);
    }

    let insertedCount = 0;
    let skippedCount = 0;

    for (const r of rows) {
      const fechaNorm = normalizeDate(r.fecha);
      const descNorm = normalizeDesc(r.descripcion);
      const amount = Math.abs(Number(r.amount));
      const tipo = r.tipo; // 'abono' o 'cargo'
      
      if (!fechaNorm || !descNorm || !amount || !tipo) {
        skippedCount++;
        continue;
      }

      // Crear key para verificar duplicado (incluye tipo)
      const key = `${fechaNorm}|${amount}|${tipo}|${descNorm}`;
      
      if (existingSet.has(key)) {
        // Ya existe, omitir
        console.log(`⏭️  Duplicado checking: ${r.descripcion} - $${amount} (${fechaNorm})`);
        skippedCount++;
        continue;
      }

      // Derivar año y mes de la fecha
      const d = new Date(fechaNorm);
      const year = d.getFullYear();
      const month = d.getMonth() + 1;

      // Insertar
      await this.query(
        `INSERT INTO checking_transactions (user_id, year, month, fecha, descripcion, tipo, amount)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [userId, year, month, fechaNorm, r.descripcion.slice(0, 60), tipo, amount]
      );

      // Agregar al set para evitar duplicados dentro del mismo archivo
      existingSet.add(key);
      insertedCount++;
      console.log(`✅ Checking importada: ${r.descripcion} - $${amount} (${tipo})`);
    }

    return { inserted: insertedCount, skipped: skippedCount };
  }
}

module.exports = Checking;
