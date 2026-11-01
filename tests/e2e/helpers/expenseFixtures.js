const { expect } = require('@playwright/test');
const CATEGORIES = [
  'Cuentas', 'Compras casa', 'Transporte', 'Salud', 'Educación', 'Restaurantes', 'Mascotas', 'Viajes',
  'Vestuario', 'Suscripciones', 'Regalos', 'Categoría con nombre suficientemente largo para comprobar lectura móvil', 'year', 'Sin categoría',
].map((name, index, all) => ({ id: index === all.length - 1 ? 'uncategorized' : String(index + 1), name }));
const dateKey = (year, month) => `${year}-${String(month).padStart(2, '0')}`;
const shift = (year, month, count) => {
  const d = new Date(Date.UTC(year, month - 1 + count, 1));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 };
};
const clp = value => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(value);

function amountFor(categoryId, year, month, options = {}) {
  const index = CATEGORIES.findIndex(c => c.id === categoryId);
  if (options.empty) return 0;
  if (categoryId === '1' && options.huge && year === 2026 && month === 10) return 999999999;
  if (categoryId === '1' && options.zeroBase && year === 2026 && month === 9) return 0;
  return (index + 1) * 10000 + month * 1000;
}

function makeEvolution(params = {}, options = {}) {
  const endYear = Number(params.endYear || 2026), endMonth = Number(params.endMonth || 10), length = Number(params.months || 6);
  const sources = String(params.sources || 'tc_nacional').split(',');
  const factor = sources.length === 1 && sources[0] === 'tc_internacional' ? 2 : sources.length;
  const periods = Array.from({ length }, (_, index) => {
    const { year, month } = shift(endYear, endMonth, index - length + 1);
    const key = dateKey(year, month);
    const total = CATEGORIES.reduce((sum, cat) => sum + factor * amountFor(cat.id, year, month, options), 0);
    const previous = shift(year, month, -1);
    const previousTotal = CATEGORIES.reduce((sum, cat) => sum + factor * amountFor(cat.id, previous.year, previous.month, options), 0);
    return {
      key, year, month, label: new Date(Date.UTC(year, month - 1, 15)).toLocaleDateString('es-CL', { month: 'short', year: 'numeric', timeZone: 'UTC' }),
      status: key > '2026-10' ? 'future' : key === '2026-10' ? 'current' : 'past', coverage: 'unknown', total,
      count: options.empty ? 0 : CATEGORIES.length * 2 * sources.length, previousTotal, delta: total - previousTotal,
      deltaPct: previousTotal ? (total - previousTotal) * 100 / previousTotal : null,
      bySource: Object.fromEntries(sources.map(source => [source, { total: total / sources.length, count: options.empty ? 0 : CATEGORIES.length * 2 }])),
    };
  });
  const previous = shift(endYear, endMonth, -1);
  const categories = CATEGORIES.map(cat => {
    const values = periods.map(p => ({ month: p.key, total: factor * amountFor(cat.id, p.year, p.month, options), count: options.empty ? 0 : 2 * sources.length }));
    const currentTotal = values[values.length - 1].total;
    const previousTotal = factor * amountFor(cat.id, previous.year, previous.month, options);
    return { ...cat, total: values.reduce((sum, v) => sum + v.total, 0), values, currentTotal, previousTotal, delta: currentTotal - previousTotal, deltaPct: previousTotal ? (currentTotal - previousTotal) * 100 / previousTotal : null };
  });
  const last = periods[periods.length - 1];
  const largest = categories.reduce((best, cat) => cat.delta > (best?.delta || 0) ? cat : best, null);
  return {
    scope: { endYear, endMonth, months: length, basis: 'billing', sources }, generatedAt: '2026-10-31T12:00:00.000Z', months: periods, categories,
    summary: { total: periods.reduce((sum, p) => sum + p.total, 0), count: periods.reduce((sum, p) => sum + p.count, 0), currentTotal: last.total, previousTotal: last.previousTotal, delta: last.delta, deltaPct: last.deltaPct, largestIncrease: largest ? { categoryId: largest.id, name: largest.name, delta: largest.delta } : null },
    exclusions: { missingPeriodCount: options.exclusions ? 3 : 0, missingCLPCount: options.exclusions ? 2 : 0 },
    coverage: { status: 'unknown', consolidation: sources.length > 1 ? 'unverified' : 'single-source', message: 'Importes de movimientos registrados; cobertura bancaria no verificada.', warnings: sources.length > 1 ? ['No hay consolidación verificada entre fuentes.'] : [] },
  };
}

function makeDetail(params, options = {}) {
  const year = Number(params.year), month = Number(params.month), sources = String(params.sources || 'tc_nacional').split(',');
  const factor = sources.length === 1 && sources[0] === 'tc_internacional' ? 2 : sources.length;
  const category = CATEGORIES.find(c => c.id === params.categoryId);
  const total = factor * amountFor(category.id, year, month, options);
  const prior = shift(year, month, -1);
  const fecha = `${prior.year}-${String(prior.month).padStart(2, '0')}-23`;
  const part = Math.floor(total * .4);
  return {
    scope: { year, month, categoryId: category.id, basis: 'billing', sources }, category,
    generatedAt: '2026-10-31T12:00:00.000Z', total, count: total ? 2 : 0, limit: 100, offset: 0, hasMore: false,
    transactions: total ? [{ id: 'fixture-a', source: sources[0], fecha, descripcion: 'Movimiento ficticio A', amount: part }, { id: 'fixture-b', source: sources[0], fecha, descripcion: 'Movimiento ficticio B', amount: total - part }] : [],
  };
}

async function installDashboardFixtures(page, options = {}) {
  const state = { requests: [], unexpected: [], writes: [], errors: [] };
  await page.addInitScript(({ period }) => {
    localStorage.setItem('token', 'fixture-token-no-real-user');
    sessionStorage.setItem('period', period);
  }, { period: options.period || '2026-10' });
  page.on('pageerror', error => state.errors.push(error.message));
  await page.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (!['127.0.0.1', 'localhost'].includes(url.hostname)) return route.abort();
    if (!url.pathname.startsWith('/api/')) return route.continue();
    state.requests.push({ path: url.pathname, method: request.method(), params: Object.fromEntries(url.searchParams) });
    if (request.method() !== 'GET') { state.writes.push(`${request.method()} ${url.pathname}`); return route.abort(); }
    const json = data => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
    const responses = {
      '/api/auth/profile': { user: { id: 'fixture-user', nombre: 'Usuario de prueba', email: 'demo@example.invalid' } },
      '/api/space/memberships': { spaces: [] }, '/api/space/members': { members: [] }, '/api/suspicious/count': { count: 0 },
      '/api/dashboard/overview': { period: { year: 2026, month: 10 }, balance: { value: 650000 }, gastos: { value: 1950000 }, ingresos: { value: 2600000 }, disponibleHoy: 1031242, compromisos: { total: 2100000, tcNoFacturado: 1200000, cuotas: 600000, intl: 0, proyectados: 300000 }, topCategorias: [] },
      '/api/dashboard/monthly-history': [], '/api/dashboard/category-evolution': { data: [], categories: [] },
      '/api/financial-health/summary': {
        checking: { currentBalance: 1031242 },
        creditCards: { combined: 1850000, visa: { total: 1200000, unbilled: 900000, installments: 300000, international: 0, payments: 0 }, mastercard: { total: 650000, unbilled: 350000, installments: 300000, international: 0, payments: 0 } },
        projected: { income: 2000000, expenses: 1500000, details: { income: [{ name: 'Ingreso ficticio', amount: 2000000 }], expenses: Array.from({ length: 8 }, (_, i) => ({ name: `Compromiso ficticio ${i + 1}`, amount: 187500 })) } },
        summary: { healthScore: 25, healthStatus: 'critical', totalCommitments: 3350000, projectedBalance: -318758 }, alerts: [],
      },
    };
    if (url.pathname === '/api/dashboard/expense-evolution') {
      if (options.failEvolution) return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'Error simulado' }) });
      if (options.delay) await new Promise(resolve => setTimeout(resolve, options.delay(Object.fromEntries(url.searchParams))));
      return json(makeEvolution(Object.fromEntries(url.searchParams), options));
    }
    if (url.pathname === '/api/dashboard/expense-evolution/transactions') return json(makeDetail(Object.fromEntries(url.searchParams), options));
    if (Object.prototype.hasOwnProperty.call(responses, url.pathname)) return json(responses[url.pathname]);
    state.unexpected.push(`${request.method()} ${url.pathname}`);
    return route.abort();
  });
  state.verify = () => {
    expect(state.writes, 'Dashboard fixtures must never mutate data').toEqual([]);
    expect(state.unexpected, 'Every API endpoint must have an explicit fixture').toEqual([]);
    expect(state.errors, 'The dashboard must not throw runtime errors').toEqual([]);
  };
  return state;
}

module.exports = { CATEGORIES, makeEvolution, makeDetail, installDashboardFixtures, clp };
