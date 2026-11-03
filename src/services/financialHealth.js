import axios from '../config/axios';
import { cacheRead, getCachedEntry } from './readCache';

function assertActive({ signal, isCurrent } = {}) {
  if (signal?.aborted || (typeof isCurrent === 'function' && !isCurrent())) {
    const error = new Error('La consulta fue cancelada'); error.name = 'AbortError'; throw error;
  }
}

/** Saved application data only: this GET never starts bank/email synchronization. */
export async function readFinancialHealth(scope, options = {}) {
  const { userId, ownerId, year, month } = scope;
  if (!userId || !ownerId || !Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    const error = new Error('No se pudo identificar el período y el hogar.'); error.code = 'HEALTH_SCOPE_REQUIRED'; throw error;
  }
  assertActive(options);
  const key = `financial-health:v1:${userId}:${ownerId}:${year}:${month}`;
  const cached = async () => {
    const entry = await getCachedEntry(key); assertActive(options);
    return entry && entry.data && Number.isFinite(entry.cachedAt)
      ? { data: entry.data, cachedAt: entry.cachedAt, origin: 'cache', stale: true } : null;
  };
  if (navigator.onLine === false) {
    const entry = await cached(); if (entry) return entry;
    const error = new Error('Este período no se ha descargado para consultar sin conexión. Recupera la conexión para actualizarlo.'); error.code = 'OFFLINE_MISS'; throw error;
  }
  try {
    const { data } = await axios.get('/api/financial-health/summary', { params: { year, month }, signal: options.signal, timeout: 15000 });
    assertActive(options); await cacheRead(key, data); assertActive(options);
    return { data, cachedAt: Date.now(), origin: 'network', stale: false };
  } catch (error) {
    assertActive(options);
    if (error.response?.status >= 400 && error.response.status < 500) throw error;
    const entry = await cached(); if (entry) return entry; throw error;
  }
}
