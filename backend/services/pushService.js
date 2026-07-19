/**
 * Servicio de notificaciones Web Push (Epic 13, Fase 3).
 * `notifySync` se usa desde el scheduler (Fase 2); la implementación
 * completa de envío/poda se agrega en la Fase 3.
 */

/** Placeholder hasta la Fase 3 — evita romper el import del scheduler. */
async function notifySync(userId, imported) {
  // Implementado en Fase 3 (pushService.sendToUser vía web-push).
}

module.exports = { notifySync };
