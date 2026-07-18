/**
 * Store mínimo del espacio activo (Epic 11).
 *
 * Vive fuera de React para que el interceptor de axios pueda leerlo sin
 * acoplarse al árbol de componentes. La fuente de verdad de la UI es
 * SpaceContext; este módulo solo refleja el owner activo.
 */

export const SPACE_FORBIDDEN_EVENT = 'spaceForbidden';
export const SPACE_CHANGED_EVENT = 'spaceChanged';

let activeOwnerId = null; // null → espacio propio (sin header)

export const setActiveSpaceOwner = (ownerId) => {
  activeOwnerId = ownerId || null;
};

export const getActiveSpaceOwner = () => activeOwnerId;
