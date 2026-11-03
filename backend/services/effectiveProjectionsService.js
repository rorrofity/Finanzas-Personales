/** A read-only relation shared by health and projected commitment analyses. */
function effectiveProjectionsSql() {
  return `SELECT /* HFS_EFFECTIVE_PROJECTIONS */
      po.id AS occurrence_id, pt.id AS template_id,
      TO_CHAR(po.fecha::date,'YYYY-MM-DD') AS fecha,
      COALESCE(po.nombre,pt.nombre) AS nombre,
      COALESCE(po.tipo,pt.tipo) AS tipo,
      COALESCE(po.monto,pt.monto)::text AS monto,
      COALESCE(po.category_id,pt.category_id) AS category_id,
      COALESCE(po.notas,pt.notas) AS notas, po.active, pt.repeat_monthly,
      false AS virtual,
      GREATEST(po.updated_at,pt.updated_at) AS updated_at
    FROM projected_occurrences po
    JOIN projected_templates pt ON pt.id=po.template_id AND pt.user_id=po.user_id
    WHERE po.user_id=$1 AND po.year=$2 AND po.month=$3
    UNION ALL
    SELECT NULL::uuid AS occurrence_id, pt.id AS template_id,
      TO_CHAR(make_date($2::int,$3::int,LEAST(pt.day_of_month,
        EXTRACT(DAY FROM (make_date($2::int,$3::int,1)+INTERVAL '1 month - 1 day'))::int)),'YYYY-MM-DD') AS fecha,
      pt.nombre,pt.tipo,pt.monto::text,pt.category_id,pt.notas,true AS active,
      pt.repeat_monthly,true AS virtual,pt.updated_at
    FROM projected_templates pt
    WHERE pt.user_id=$1
      AND (pt.start_year<$2 OR (pt.start_year=$2 AND pt.start_month<=$3))
      AND (pt.repeat_monthly OR (pt.start_year=$2 AND pt.start_month=$3))
      AND NOT EXISTS(SELECT 1 FROM projected_occurrences po
        WHERE po.user_id=pt.user_id AND po.template_id=pt.id AND po.year=$2 AND po.month=$3)`;
}

async function listEffectiveProjections(userId, year, month, { query } = {}) {
  const read = query || require('../config/database').query;
  const result = await read(`${effectiveProjectionsSql()} ORDER BY fecha,nombre,template_id`, [userId,year,month]);
  return result.rows.map(row => ({ ...row,
    occurrence_id: row.occurrence_id || `virtual-${row.template_id}-${year}-${String(month).padStart(2,'0')}`,
    virtual: row.virtual === true,
  }));
}

module.exports = { effectiveProjectionsSql, listEffectiveProjections };
