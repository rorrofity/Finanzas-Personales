import { openDB } from 'idb';
import { getActiveSpaceOwner } from './activeSpace';

/**
 * Caché de LECTURA con IndexedDB (Req 9.3).
 *
 * Permite consultar datos previamente obtenidos cuando no hay conexión.
 * SOLO almacena respuestas de lectura (GET). Nunca encola escrituras
 * (no hay escritura offline — Req 9.4).
 *
 * Epic 11 (Req 11.14): toda clave se prefija con el espacio activo para
 * que en offline nunca se muestren datos de un espacio en otro.
 */

// Clave real en IndexedDB: `<ownerId|own>::<key>`
const nsKey = (key) => `${getActiveSpaceOwner() || 'own'}::${key}`;

const DB_NAME = 'finanzas-read-cache';
const STORE_NAME = 'readCache';
const DB_VERSION = 1;

let dbPromise = null;

function getDB() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      },
    });
  }
  return dbPromise;
}

/**
 * Guarda datos en la caché de lectura.
 * @param {string} key clave única (p.ej. 'transactions:2026-06')
 * @param {any} data datos serializables a guardar
 */
export async function cacheRead(key, data) {
  try {
    const db = await getDB();
    await db.put(
      STORE_NAME,
      { data, cachedAt: Date.now() },
      nsKey(key)
    );
  } catch (err) {
    // La caché es best-effort: si falla, no rompemos la app.
    // eslint-disable-next-line no-console
    console.warn('cacheRead error:', err?.message || err);
  }
}

/**
 * Recupera datos de la caché de lectura.
 * @param {string} key
 * @returns {Promise<any|null>} los datos cacheados o null si no existen
 */
export async function getCachedRead(key) {
  try {
    const db = await getDB();
    const entry = await db.get(STORE_NAME, nsKey(key));
    if (!entry) return null;
    return entry.data ?? null;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('getCachedRead error:', err?.message || err);
    return null;
  }
}

/**
 * Obtiene metadata (incluye cachedAt) de una entrada.
 * @param {string} key
 * @returns {Promise<{data:any, cachedAt:number}|null>}
 */
export async function getCachedEntry(key) {
  try {
    const db = await getDB();
    const entry = await db.get(STORE_NAME, nsKey(key));
    return entry || null;
  } catch (err) {
    return null;
  }
}

/**
 * Estrategia de lectura con caché (Req 9.3, 9.12):
 *  - Offline: devuelve directamente la caché (sin tocar la red).
 *  - Online: intenta la red; si responde, cachea y devuelve.
 *           Si la red falla, cae a la caché disponible.
 *
 * @template T
 * @param {string} key clave de caché
 * @param {() => Promise<T>} networkFn función que ejecuta la petición de red
 * @returns {Promise<T>} datos de red o caché
 */
export async function fetchWithCache(key, networkFn) {
  const online =
    typeof navigator === 'undefined' || typeof navigator.onLine !== 'boolean'
      ? true
      : navigator.onLine;

  if (!online) {
    const cached = await getCachedRead(key);
    return cached;
  }

  try {
    const data = await networkFn();
    await cacheRead(key, data);
    return data;
  } catch (err) {
    const cached = await getCachedRead(key);
    if (cached !== null && cached !== undefined) {
      return cached;
    }
    throw err;
  }
}

/**
 * Limpia por completo el caché de lectura (todos los espacios).
 * Se invoca al cerrar sesión (Req 11.15) para no dejar datos financieros
 * en un dispositivo potencialmente compartido.
 */
export async function clearReadCache() {
  try {
    const db = await getDB();
    await db.clear(STORE_NAME);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('clearReadCache error:', err?.message || err);
  }
}

/**
 * Verifica el uso de cuota de almacenamiento (Req 9.x borde).
 * @returns {Promise<{usage:number, quota:number, ratio:number}|null>}
 */
export async function getStorageEstimate() {
  try {
    if (navigator.storage && navigator.storage.estimate) {
      const { usage = 0, quota = 0 } = await navigator.storage.estimate();
      const ratio = quota > 0 ? usage / quota : 0;
      return { usage, quota, ratio };
    }
  } catch (err) {
    /* noop */
  }
  return null;
}
