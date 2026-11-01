import axios from '../config/axios';
import { cacheRead, getCachedEntry } from './readCache';

const SOURCE_ORDER = ['tc_nacional', 'tc_internacional', 'cuenta_corriente'];

const sourceList = (sources = ['tc_nacional']) => SOURCE_ORDER.filter((source) => sources.includes(source)).join(',');

function assertActive(signal) {
  if (signal?.aborted) {
    const error = new Error('La consulta fue cancelada');
    error.name = 'AbortError';
    throw error;
  }
}

async function read(key, url, params, { signal } = {}) {
  assertActive(signal);
  const cached = async () => {
    const entry = await getCachedEntry(key);
    assertActive(signal);
    return entry ? { data: entry.data, cachedAt: entry.cachedAt, origin: 'cache', stale: true } : null;
  };

  if (navigator.onLine === false) {
    const entry = await cached();
    if (entry) return entry;
    const error = new Error('Este rango no se ha descargado para consultar sin conexión. Consúltalo cuando recuperes la conexión.');
    error.code = 'OFFLINE_MISS';
    throw error;
  }

  try {
    const { data } = await axios.get(url, { params, signal, timeout: 15000 });
    assertActive(signal);
    await cacheRead(key, data);
    assertActive(signal);
    return { data, cachedAt: Date.now(), origin: 'network', stale: false };
  } catch (error) {
    assertActive(signal);
    // Una sesión vencida o una revocación deben prevalecer sobre datos guardados.
    if (error.response?.status >= 400 && error.response.status < 500) throw error;
    const entry = await cached();
    if (entry) return entry;
    throw error;
  }
}

export function readExpenseReport(scope, options) {
  const { userId, ownerId, endYear, endMonth, months } = scope;
  const sources = sourceList(scope.sources);
  const key = `expense-evolution:v1:${userId}:${ownerId}:${endYear}:${endMonth}:${months}:${sources}:billing`;
  return read(key, '/api/dashboard/expense-evolution', { endYear, endMonth, months, sources, basis: 'billing' }, options);
}

export function readExpenseTransactions(scope, options) {
  const { userId, ownerId, year, month, categoryId, limit = 100, offset = 0 } = scope;
  const sources = sourceList(scope.sources);
  const key = `expense-transactions:v1:${userId}:${ownerId}:${year}:${month}:${categoryId}:${sources}:billing:${limit}:${offset}`;
  return read(key, '/api/dashboard/expense-evolution/transactions', { year, month, categoryId, sources, basis: 'billing', limit, offset }, options);
}

export function readExpenseLiquidity(scope, options) {
  const { userId, ownerId, year, month } = scope;
  const key = `expense-liquidity:v1:${userId}:${ownerId}:${year}:${month}:billing`;
  return read(key, '/api/dashboard/overview', { year, month }, options);
}
