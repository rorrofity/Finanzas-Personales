const db = require('../config/database');
const { expenseAllocationJoin } = require('../utils/expenseAllocationSql');

const SOURCES = ['tc_nacional', 'tc_internacional', 'cuenta_corriente'];
const UNCATEGORIZED = 'uncategorized';
const COVERAGE_MESSAGE = 'Importes de movimientos registrados; cobertura bancaria no verificada.';

function requestError(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function integer(value, name, min, max, fallback) {
  if (value === undefined && fallback !== undefined) return fallback;
  if ((typeof value !== 'string' && typeof value !== 'number') || !/^\d+$/.test(String(value))) {
    throw requestError(`${name} debe ser un entero válido`);
  }
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < min || number > max) {
    throw requestError(`${name} está fuera del rango permitido`);
  }
  return number;
}

function commonQuery(query) {
  if (query.basis !== undefined && query.basis !== 'billing') throw requestError('La base temporal permitida es billing');
  const requested = query.sources === undefined ? ['tc_nacional'] : typeof query.sources === 'string' ? query.sources.split(',') : [];
  if (!requested.length || requested.some((source) => !SOURCES.includes(source))) throw requestError('sources contiene una fuente no permitida');
  return { basis: 'billing', sources: SOURCES.filter((source) => requested.includes(source)) };
}

function parseEvolutionQuery(query = {}) {
  const endYear = integer(query.endYear, 'endYear', 2020, 2050);
  const endMonth = integer(query.endMonth, 'endMonth', 1, 12);
  const months = integer(query.months, 'months', 3, 12, 6);
  if (![3, 6, 12].includes(months)) throw requestError('months debe ser 3, 6 o 12');
  return { endYear, endMonth, months, ...commonQuery(query) };
}

function parseTransactionQuery(query = {}) {
  const year = integer(query.year, 'year', 2020, 2050);
  const month = integer(query.month, 'month', 1, 12);
  const categoryId = query.categoryId === UNCATEGORIZED ? UNCATEGORIZED : String(integer(query.categoryId, 'categoryId', 1, 2147483647));
  const limit = integer(query.limit, 'limit', 1, 200, 100);
  const offset = integer(query.offset, 'offset', 0, 2147483647, 0);
  return { year, month, categoryId, ...commonQuery(query), limit, offset };
}

// Both endpoints use identical persisted periods and source+id identities.
// Payments are excluded using the existing rule, without new deduplication.
const EXPENSE_RECORDS_CTE = `
WITH expense_records AS (
  SELECT 'tc_nacional'::text AS source, t.id::text AS id,
    t.fecha, t.descripcion, allocation.category_id, allocation.amount,
    t.billing_year AS year, t.billing_month AS month, allocation.original_amount, allocation.is_split
  FROM transactions t
  ${expenseAllocationJoin('tc_nacional', 't', 'ABS(t.monto)')}
  WHERE t.user_id = $1 AND t.tipo = 'gasto'
    AND 'tc_nacional' = ANY($2::text[])
  UNION ALL
  SELECT 'tc_internacional'::text AS source, iu.id::text AS id,
    iu.fecha, iu.descripcion, allocation.category_id, allocation.amount,
    iu.period_year AS year, iu.period_month AS month, allocation.original_amount, allocation.is_split
  FROM intl_unbilled iu
  ${expenseAllocationJoin('tc_internacional', 'iu', 'iu.amount_clp')}
  WHERE iu.user_id = $1 AND iu.tipo = 'gasto'
    AND 'tc_internacional' = ANY($2::text[])
  UNION ALL
  SELECT 'cuenta_corriente'::text AS source, ct.id::text AS id,
    ct.fecha, ct.descripcion, allocation.category_id, allocation.amount,
    ct.year, ct.month, allocation.original_amount, allocation.is_split
  FROM checking_transactions ct
  ${expenseAllocationJoin('cuenta_corriente', 'ct', 'ct.amount')}
  WHERE ct.user_id = $1 AND ct.tipo = 'cargo'
    AND 'cuenta_corriente' = ANY($2::text[])
    AND LOWER(ct.descripcion) NOT LIKE '%pago%tarjeta%'
    AND LOWER(ct.descripcion) NOT LIKE '%pago tc%'
    AND LOWER(ct.descripcion) NOT LIKE '%cargo por pago tc%'
    AND LOWER(ct.descripcion) NOT LIKE '%pago tarjeta de credito%'
), scoped_records AS (
  SELECT r.source, r.id, r.fecha, r.descripcion, r.amount, r.year, r.month, r.original_amount, r.is_split,
    CASE WHEN c.id IS NOT NULL THEN r.category_id ELSE NULL END AS category_id,
    CASE WHEN r.year BETWEEN 2000 AND 2100 AND r.month BETWEEN 1 AND 12
      THEN r.year * 12 + r.month - 1 ELSE NULL END AS period_index
  FROM expense_records r
  LEFT JOIN categories c ON c.id = r.category_id AND (c.user_id = $1 OR c.user_id IS NULL)
)
`;

// Aggregates, categories and exclusions share one SELECT/MVCC snapshot.
const EVOLUTION_SQL = `${EXPENSE_RECORDS_CTE}
, monthly_categories AS (
  SELECT year, month, category_id, source, SUM(amount)::text AS total, COUNT(DISTINCT id) AS count
  FROM scoped_records
  WHERE period_index BETWEEN $3::int AND $4::int AND amount IS NOT NULL
  GROUP BY year, month, category_id, source
), original_counts AS (
  SELECT year, month, source, COUNT(DISTINCT id) AS count
  FROM scoped_records
  WHERE period_index BETWEEN $3::int AND $4::int AND amount IS NOT NULL
  GROUP BY year, month, source
)
SELECT
  COALESCE((SELECT json_agg(json_build_object('id', c.id, 'name', c.name) ORDER BY c.id)
    FROM categories c WHERE c.user_id = $1 OR c.user_id IS NULL), '[]'::json) AS categories,
  COALESCE((SELECT json_agg(m) FROM monthly_categories m), '[]'::json) AS aggregates,
  COALESCE((SELECT json_agg(m) FROM original_counts m), '[]'::json) AS monthly_counts,
  json_build_object(
    'missingPeriodCount', (SELECT COUNT(DISTINCT (source, id)) FROM scoped_records WHERE period_index IS NULL),
    'missingCLPCount', (SELECT COUNT(DISTINCT (source, id)) FROM scoped_records
      WHERE source = 'tc_internacional' AND amount IS NULL
        AND period_index BETWEEN $3::int + 1 AND $4::int)
  ) AS exclusions
`;

const TRANSACTIONS_SQL = `${EXPENSE_RECORDS_CTE}
, chosen_category AS (
  SELECT c.id::text AS id, c.name FROM categories c
  WHERE c.id::text = $4::text AND (c.user_id = $1 OR c.user_id IS NULL)
  UNION ALL
  SELECT 'uncategorized'::text AS id, 'Sin categoría'::text AS name WHERE $4::text = 'uncategorized'
), matching_records AS (
  SELECT source, id, fecha, descripcion, SUM(amount) AS amount,
    MAX(original_amount) AS original_amount, BOOL_OR(is_split) AS is_split
  FROM scoped_records
  WHERE period_index = $3::int AND amount IS NOT NULL
    AND COALESCE(category_id::text, 'uncategorized') = $4::text
  GROUP BY source, id, fecha, descripcion
), page_records AS (
  SELECT id, source, to_char(fecha, 'YYYY-MM-DD') AS fecha, descripcion, amount::text AS amount,
    original_amount::text AS original_amount, is_split
  FROM matching_records ORDER BY fecha, source, id LIMIT $5::int OFFSET $6::int
)
SELECT
  (SELECT row_to_json(c) FROM chosen_category c) AS category,
  (SELECT COALESCE(SUM(amount), 0)::text FROM matching_records) AS total,
  (SELECT COUNT(*) FROM matching_records) AS count,
  COALESCE((SELECT json_agg(p ORDER BY p.fecha, p.source, p.id) FROM page_records p), '[]'::json) AS transactions
`;

// Add exact stored cents, not rounded display values or binary decimal sums.
function cents(value) {
  const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(String(value ?? '0'));
  if (!match) throw new Error('Importe almacenado inválido');
  const result = (Number(match[2]) * 100 + Number((match[3] || '').padEnd(2, '0'))) * (match[1] ? -1 : 1);
  if (!Number.isSafeInteger(result)) throw new Error('Importe fuera de precisión segura');
  return result;
}

function addCents(a, b) {
  const total = a + b;
  if (!Number.isSafeInteger(total)) throw new Error('Total fuera de precisión segura');
  return total;
}

const money = (value) => value / 100;
const delta = (current, previous) => ({
  previousTotal: money(previous), delta: money(current - previous),
  deltaPct: previous !== 0 ? ((current - previous) / previous) * 100 : null,
});
const periodNumber = (year, month) => year * 12 + month - 1;
function monthAt(index) {
  const year = Math.floor(index / 12), month = index % 12 + 1;
  return { key: `${year}-${String(month).padStart(2, '0')}`, year, month };
}
function currentSantiagoMonth(now) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago', year: 'numeric', month: '2-digit' })
    .formatToParts(now).reduce((result, part) => ({ ...result, [part.type]: part.value }), {});
  return periodNumber(Number(parts.year), Number(parts.month));
}

async function getEvolution(userId, query, now = new Date()) {
  const scope = parseEvolutionQuery(query);
  const end = periodNumber(scope.endYear, scope.endMonth), start = end - scope.months + 1;
  const result = await db.query(EVOLUTION_SQL, [userId, scope.sources, start - 1, end]);
  const payload = result.rows[0];
  if (!payload) throw new Error('La lectura de evolución no devolvió datos');
  const categoryMap = new Map((payload.categories || []).map((category) => [String(category.id), {
    id: String(category.id), name: category.name, centsByMonth: new Map(), countByMonth: new Map(),
  }]));
  categoryMap.set(UNCATEGORIZED, { id: UNCATEGORIZED, name: 'Sin categoría', centsByMonth: new Map(), countByMonth: new Map() });
  const monthly = new Map();
  for (let index = start - 1; index <= end; index++) {
    monthly.set(index, { cents: 0, count: 0, sources: Object.fromEntries(scope.sources.map((source) => [source, { cents: 0, count: 0 }])) });
  }
  for (const row of payload.aggregates || []) {
    const index = periodNumber(Number(row.year), Number(row.month));
    if (!monthly.has(index) || !scope.sources.includes(row.source)) continue;
    const categoryId = row.category_id === null || row.category_id === undefined ? UNCATEGORIZED : String(row.category_id);
    const category = categoryMap.get(categoryId) || categoryMap.get(UNCATEGORIZED);
    const total = cents(row.total), count = Number(row.count);
    if (!Number.isSafeInteger(count) || count < 0) throw new Error('Cantidad de movimientos inválida');
    category.centsByMonth.set(index, addCents(category.centsByMonth.get(index) || 0, total));
    category.countByMonth.set(index, (category.countByMonth.get(index) || 0) + count);
    const period = monthly.get(index);
    period.cents = addCents(period.cents, total); period.count += count;
    period.sources[row.source].cents = addCents(period.sources[row.source].cents, total);
    period.sources[row.source].count += count;
  }
  // A purchase can belong to several categories. Global counts come from the
  // original source+id identities rather than summing category memberships.
  if (Array.isArray(payload.monthly_counts)) {
    for (const period of monthly.values()) {
      period.count = 0;
      for (const source of scope.sources) period.sources[source].count = 0;
    }
    for (const row of payload.monthly_counts) {
      const index = periodNumber(Number(row.year), Number(row.month));
      if (!monthly.has(index) || !scope.sources.includes(row.source)) continue;
      const count = Number(row.count);
      if (!Number.isSafeInteger(count) || count < 0) throw new Error('Cantidad de movimientos inválida');
      monthly.get(index).count += count;
      monthly.get(index).sources[row.source].count += count;
    }
  }
  const currentIndex = currentSantiagoMonth(now);
  const months = Array.from({ length: scope.months }, (_, offset) => {
    const index = start + offset, period = monthly.get(index), previous = monthly.get(index - 1), month = monthAt(index);
    const label = new Intl.DateTimeFormat('es-CL', { timeZone: 'UTC', month: 'short', year: 'numeric' })
      .format(new Date(Date.UTC(month.year, month.month - 1, 1))).replace('.', '');
    return {
      ...month, label, status: index === currentIndex ? 'current' : index < currentIndex ? 'past' : 'future',
      coverage: 'unknown', total: money(period.cents), count: period.count, ...delta(period.cents, previous.cents),
      bySource: Object.fromEntries(scope.sources.map((source) => [source, { total: money(period.sources[source].cents), count: period.sources[source].count }])),
    };
  });
  const categories = Array.from(categoryMap.values()).map((category) => {
    const values = months.map((month) => {
      const index = periodNumber(month.year, month.month);
      return { month: month.key, total: money(category.centsByMonth.get(index) || 0), count: category.countByMonth.get(index) || 0 };
    });
    let categoryTotal = 0;
    for (let index = start; index <= end; index++) categoryTotal = addCents(categoryTotal, category.centsByMonth.get(index) || 0);
    const current = category.centsByMonth.get(end) || 0, previous = category.centsByMonth.get(end - 1) || 0;
    return { id: category.id, name: category.name, total: money(categoryTotal), currentTotal: money(current), ...delta(current, previous), values };
  }).sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, 'es') || a.id.localeCompare(b.id));
  let total = 0, count = 0;
  for (let index = start; index <= end; index++) { total = addCents(total, monthly.get(index).cents); count += monthly.get(index).count; }
  const current = monthly.get(end).cents, previous = monthly.get(end - 1).cents;
  const largest = categories.filter((category) => category.delta > 0).sort((a, b) => b.delta - a.delta || a.id.localeCompare(b.id))[0];
  const exclusions = { missingPeriodCount: Number(payload.exclusions?.missingPeriodCount || 0), missingCLPCount: Number(payload.exclusions?.missingCLPCount || 0) };
  const warnings = [];
  if (scope.sources.length > 1) warnings.push('Suma de registros de las fuentes seleccionadas; consolidación entre fuentes no verificada.');
  if (exclusions.missingPeriodCount) warnings.push('Hay movimientos sin período válido en el histórico de las fuentes seleccionadas; no se imputan a la ventana.');
  if (exclusions.missingCLPCount) warnings.push('Hay movimientos internacionales de esta ventana sin conversión CLP persistida; se excluyen del importe.');
  return {
    scope, generatedAt: now.toISOString(), months, categories,
    summary: { total: money(total), count, currentTotal: money(current), ...delta(current, previous), largestIncrease: largest ? { categoryId: largest.id, name: largest.name, delta: largest.delta } : null },
    exclusions, coverage: { status: 'unknown', consolidation: scope.sources.length > 1 ? 'unverified' : 'single-source', message: COVERAGE_MESSAGE, warnings },
  };
}

async function getTransactions(userId, query, now = new Date()) {
  const { limit, offset, ...scope } = parseTransactionQuery(query);
  const result = await db.query(TRANSACTIONS_SQL, [userId, scope.sources, periodNumber(scope.year, scope.month), scope.categoryId, limit, offset]);
  const payload = result.rows[0];
  if (!payload?.category) throw requestError('Categoría no encontrada', 404);
  const count = Number(payload.count);
  return {
    scope, generatedAt: now.toISOString(), category: { id: String(payload.category.id), name: payload.category.name },
    total: money(cents(payload.total)), count, limit, offset, hasMore: offset + (payload.transactions || []).length < count,
    transactions: (payload.transactions || []).map((transaction) => ({
      id: transaction.id, source: transaction.source, fecha: transaction.fecha, descripcion: transaction.descripcion,
      amount: money(cents(transaction.amount)),
      ...(transaction.is_split ? { originalAmount: money(cents(transaction.original_amount)), isSplit: true } : {}),
    })),
  };
}

module.exports = { parseEvolutionQuery, parseTransactionQuery, getEvolution, getTransactions };
