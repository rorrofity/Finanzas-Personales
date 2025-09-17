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

  async list(userId, year, month) {
    const r = await this.query(`SELECT * FROM checking_transactions WHERE user_id=$1 AND year=$2 AND month=$3 ORDER BY fecha DESC, created_at DESC`, [userId, year, month]);
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

  async create(userId, data) {
    const { year, month, fecha, descripcion, tipo, amount, category_id=null, notas=null } = data;
    const res = await this.query(`INSERT INTO checking_transactions(user_id,year,month,fecha,descripcion,tipo,amount,category_id,notas)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`, [userId, year, month, fecha, descripcion, tipo, amount, category_id, notas]);
    return res.rows[0];
  }

  async update(userId, id, data) {
    const { fecha, descripcion, tipo, amount, category_id, notas } = data;
    const res = await this.query(`UPDATE checking_transactions SET
      fecha = COALESCE($1, fecha),
      descripcion = COALESCE($2, descripcion),
      tipo = COALESCE($3, tipo),
      amount = COALESCE($4, amount),
      category_id = COALESCE($5, category_id),
      notas = COALESCE($6, notas),
      updated_at = CURRENT_TIMESTAMP
      WHERE id=$7 AND user_id=$8 RETURNING *`, [fecha||null, descripcion||null, tipo||null, amount===undefined?null:amount, category_id===undefined?null:category_id, notas||null, id, userId]);
    return res.rows[0];
  }

  async delete(userId, id) {
    await this.query(`DELETE FROM checking_transactions WHERE id=$1 AND user_id=$2`, [id, userId]);
  }
}

module.exports = Checking;
