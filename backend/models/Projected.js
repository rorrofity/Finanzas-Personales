class ProjectedModel {
  constructor(db) {
    this.db = db;
  }

  async getTemplatesByUser(userId) {
    const res = await this.db.query(
      `SELECT * FROM projected_templates WHERE user_id = $1 ORDER BY start_year, start_month, nombre`,
      [userId]
    );
    return res.rows;
  }

  async createTemplate(userId, tpl) {
    const { nombre, tipo, monto, day_of_month, start_year, start_month, category_id, notas, repeat_monthly } = tpl;
    const res = await this.db.query(
      `INSERT INTO projected_templates (user_id, nombre, tipo, monto, day_of_month, start_year, start_month, category_id, notas, repeat_monthly)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING *`,
      [userId, nombre, tipo, monto, day_of_month, start_year, start_month, category_id || null, notas || null, repeat_monthly]
    );
    return res.rows[0];
  }

  async deleteTemplateForward(userId, templateId, fromYear, fromMonth) {
    // delete occurrences from (year, month) forward and template at the end
    await this.db.query(
      `DELETE FROM projected_occurrences 
       WHERE user_id = $1 AND template_id = $2 
         AND (year > $3 OR (year = $3 AND month >= $4))`,
      [userId, templateId, fromYear, fromMonth]
    );
    const res = await this.db.query(
      `DELETE FROM projected_templates WHERE id = $1 AND user_id = $2 RETURNING *`,
      [templateId, userId]
    );
    return res.rows[0];
  }

  async upsertOccurrence(userId, template, year, month, fecha) {
    // only insert if not exists
    await this.db.query(
      `INSERT INTO projected_occurrences (user_id, template_id, year, month, fecha)
       SELECT $1, $2, $3, $4, $5
       WHERE NOT EXISTS (
         SELECT 1 FROM projected_occurrences WHERE template_id = $2 AND year = $3 AND month = $4
       )`,
      [userId, template.id, year, month, fecha]
    );
  }

  async listMonth(userId, year, month) {
    const res = await this.db.query(
      `SELECT o.id as occurrence_id,
              o.template_id,
              o.year, o.month, o.fecha,
              COALESCE(o.nombre, t.nombre) as nombre,
              COALESCE(o.tipo, t.tipo) as tipo,
              COALESCE(o.monto, t.monto) as monto,
              COALESCE(o.category_id, t.category_id) as category_id,
              COALESCE(o.notas, t.notas) as notas,
              o.active,
              t.repeat_monthly
       FROM projected_occurrences o
       JOIN projected_templates t ON t.id = o.template_id
       WHERE o.user_id = $1 AND o.year = $2 AND o.month = $3
       ORDER BY o.fecha, nombre`,
      [userId, year, month]
    );
    return res.rows;
  }

  async createOccurrenceForMonth(userId, templateId, year, month, values) {
    // force override on explicit create? We'll insert occurrence if not exists, and set fields
    const { nombre, tipo, monto, category_id, notas, active, fecha } = values;
    const res = await this.db.query(
      `INSERT INTO projected_occurrences (user_id, template_id, year, month, fecha, override, nombre, tipo, monto, category_id, notas, active)
       VALUES ($1,$2,$3,$4,$5, TRUE, $6,$7,$8,$9,$10,$11)
       ON CONFLICT (template_id, year, month) DO UPDATE SET
         fecha = EXCLUDED.fecha,
         override = TRUE,
         nombre = EXCLUDED.nombre,
         tipo = EXCLUDED.tipo,
         monto = EXCLUDED.monto,
         category_id = EXCLUDED.category_id,
         notas = EXCLUDED.notas,
         active = EXCLUDED.active
       RETURNING *`,
      [userId, templateId, year, month, fecha, nombre || null, tipo || null, monto || null, category_id || null, notas || null, active]
    );
    return res.rows[0];
  }

  async updateOccurrence(userId, occurrenceId, values) {
    const fields = ['nombre','tipo','monto','category_id','notas','active'];
    const sets = [];
    const params = [];
    let idx = 1;
    for (const f of fields) {
      if (values[f] !== undefined) {
        sets.push(`${f} = $${idx++}`);
        params.push(values[f]);
      }
    }
    sets.push(`override = TRUE`);
    const query = `UPDATE projected_occurrences SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${idx} AND user_id = $${idx+1} RETURNING *`;
    params.push(occurrenceId, userId);
    const res = await this.db.query(query, params);
    return res.rows[0];
  }

  async deleteOccurrence(userId, occurrenceId) {
    const res = await this.db.query(`DELETE FROM projected_occurrences WHERE id = $1 AND user_id = $2 RETURNING *`, [occurrenceId, userId]);
    return res.rows[0];
  }
}

module.exports = ProjectedModel;
