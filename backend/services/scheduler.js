const cron = require('node-cron');
const db = require('../config/database');
const { runSync } = require('./syncService');
const { notifySync } = require('./pushService');

/**
 * Scheduler de sincronización automática (Epic 13).
 *
 * `runScheduledSync` corre para TODOS los usuarios con `auto_sync_enabled
 * = true` (Req 13.2), reutilizando `syncService.runSync` (el mismo que usa
 * el botón manual). Si una sync trae transacciones nuevas, dispara una
 * notificación push (Req 13.9/13.13). Un error en un usuario no detiene el
 * resto (Req 13.4) — cada iteración está aislada en su propio try/catch.
 */
async function runScheduledSync() {
  const usersResult = await db.query(
    'SELECT id FROM users WHERE auto_sync_enabled = true'
  );

  for (const user of usersResult.rows) {
    try {
      const result = await runSync(user.id, 'scheduled');
      if (result.imported > 0) {
        await notifySync(user.id, result.imported);
      }
    } catch (error) {
      // Defensa adicional: runSync ya no debería lanzar, pero si algo
      // inesperado ocurre (p.ej. notifySync falla) no debe abortar el loop.
      console.error(`❌ [scheduler] error procesando usuario ${user.id}:`, error.message);
    }
  }
}

let scheduledTasks = [];

/**
 * Registra los cron jobs (Req 13.1). Horarios configurables vía
 * SYNC_CRON_TIMES (coma-separado, formato cron), default cada hora de
 * 08:00 a 00:00 inclusive (17 ejecuciones diarias).
 * Zona horaria fija a America/Santiago independiente del TZ del proceso.
 */
function start() {
  if (scheduledTasks.length > 0) return;

  const times = (process.env.SYNC_CRON_TIMES || '0 8-23 * * *,0 0 * * *')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);

  scheduledTasks = times.map((expr) =>
    cron.schedule(
      expr,
      async () => {
        console.log(`⏰ [scheduler] ejecutando sincronización programada (${expr})`);
        await runScheduledSync().catch((error) =>
          console.error('❌ [scheduler] error inesperado en runScheduledSync:', error.message)
        );
      },
      { timezone: 'America/Santiago', noOverlap: true }
    )
  );

  console.log(`✅ [scheduler] sincronización programada activa: ${times.join(' | ')} (America/Santiago)`);
}

function stop() {
  scheduledTasks.forEach((task) => task.stop());
  scheduledTasks = [];
}

module.exports = { runScheduledSync, start, stop };
