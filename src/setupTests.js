// Configuración global para pruebas unitarias (Jest + React Testing Library).
import '@testing-library/jest-dom';

// Polyfill de structuredClone (jsdom/Node antiguo no lo expone) — requerido
// por fake-indexeddb. Suficiente para datos serializables de las pruebas.
if (typeof global.structuredClone === 'undefined') {
  global.structuredClone = (val) =>
    val === undefined ? undefined : JSON.parse(JSON.stringify(val));
}

// IndexedDB simulada para pruebas del caché de lectura (idb / readCache).
import 'fake-indexeddb/auto';
