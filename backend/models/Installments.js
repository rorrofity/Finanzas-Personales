class Installments {
  constructor(db) {
    this.query = db.query;
  }

  async createPlan(userId, data) {
    const {
      brand, descripcion, amount_per_installment,
      total_installments, start_year, start_month, start_installment,
      category_id = null, notas = null
    } = data;

    const planRes = await this.query(
      `INSERT INTO installment_plans (
         user_id, brand, descripcion, amount_per_installment, total_installments,
         start_year, start_month, start_installment, category_id, notas
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING *`,
      [userId, brand, descripcion, amount_per_installment, total_installments,
       start_year, start_month, start_installment, category_id, notas]
    );
    const plan = planRes.rows[0];

    // Materialize occurrences from start_installment to total_installments
    let y = start_year;
    let m = start_month;
    for (let n = start_installment; n <= total_installments; n++) {
      await this.query(
        `INSERT INTO installment_occurrences(
           user_id, plan_id, year, month, installment_number, amount, category_id
         ) VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (plan_id, year, month) DO NOTHING`,
        [userId, plan.id, y, m, n, amount_per_installment, category_id]
      );
      // next month
      m += 1; if (m > 12) { m = 1; y += 1; }
    }

    return plan;
  }

  async listPlans(userId, year = null, month = null) {
    // Optionally compute current installment number for listing
    const res = await this.query(
      `SELECT p.*,
              (SELECT COUNT(*) FROM installment_occurrences o
               WHERE o.plan_id = p.id AND (o.year < EXTRACT(YEAR FROM CURRENT_DATE)
                 OR (o.year = EXTRACT(YEAR FROM CURRENT_DATE) AND o.month <= EXTRACT(MONTH FROM CURRENT_DATE)))) AS paid_count
       FROM installment_plans p
       WHERE p.user_id = $1 AND p.active = TRUE
       ORDER BY p.created_at DESC`,
      [userId]
    );
    return res.rows;
  }

  async listOccurrencesByMonth(userId, year, month) {
    const res = await this.query(
      `SELECT o.*, p.brand, p.descripcion
       FROM installment_occurrences o
       JOIN installment_plans p ON p.id = o.plan_id
       WHERE o.user_id = $1 AND o.year = $2 AND o.month = $3 AND o.active = TRUE
       ORDER BY p.brand, p.descripcion`,
      [userId, year, month]
    );
    return res.rows;
  }

  async updatePlan(userId, planId, data) {
    const { descripcion, brand, amount_per_installment, total_installments, category_id = null, notas = null, active } = data;
    const res = await this.query(
      `UPDATE installment_plans SET
         descripcion = COALESCE($1, descripcion),
         brand = COALESCE($2, brand),
         amount_per_installment = COALESCE($3, amount_per_installment),
         total_installments = COALESCE($4, total_installments),
         category_id = $5,
         notas = $6,
         active = COALESCE($7, active),
         updated_at = CURRENT_TIMESTAMP
       WHERE id = $8 AND user_id = $9
       RETURNING *`,
      [descripcion || null, brand || null, amount_per_installment || null, total_installments || null,
       category_id, notas, (active === undefined ? null : !!active), planId, userId]
    );
    return res.rows[0];
  }

  async updateOccurrence(userId, occurrenceId, data) {
    const { amount, category_id, active } = data;
    const res = await this.query(
      `UPDATE installment_occurrences SET
         amount = COALESCE($1, amount),
         category_id = COALESCE($2, category_id),
         active = COALESCE($3, active),
         updated_at = CURRENT_TIMESTAMP
       WHERE id = $4 AND user_id = $5
       RETURNING *`,
      [amount || null, category_id || null, (active === undefined ? null : !!active), occurrenceId, userId]
    );
    return res.rows[0];
  }

  async deleteOccurrence(userId, occurrenceId) {
    await this.query(`DELETE FROM installment_occurrences WHERE id = $1 AND user_id = $2`, [occurrenceId, userId]);
  }

  async deletePlanForward(userId, planId, fromYear, fromMonth) {
    // Delete occurrences from given month forward, and deactivate plan if no more future occurrences
    await this.query(
      `DELETE FROM installment_occurrences
       WHERE user_id = $1 AND plan_id = $2 AND (year > $3 OR (year = $3 AND month >= $4))`,
      [userId, planId, fromYear, fromMonth]
    );
    // Optionally deactivate plan
    await this.query(`UPDATE installment_plans SET active = TRUE, updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND user_id = $2`, [planId, userId]);
  }
}

module.exports = Installments;
