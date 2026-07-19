const PushSubscription = require('../models/PushSubscription');
const pushService = require('../services/pushService');

/**
 * Controller de notificaciones Web Push (Epic 13, principio PUSH-001).
 * Las suscripciones son por PERSONA (req.user.id), no por espacio activo:
 * un dispositivo notifica a quien lo sostiene, sin importar qué espacio
 * esté viendo en la app en ese momento.
 */

// GET /api/push/vapid-public-key
const getVapidPublicKey = (req, res) => {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  if (!publicKey) {
    return res.status(503).json({ error: 'Push no configurado en el servidor' });
  }
  res.json({ publicKey });
};

// POST /api/push/subscribe
const subscribe = async (req, res) => {
  try {
    const { endpoint, keys } = req.body || {};
    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return res.status(400).json({ error: 'Suscripción inválida: faltan endpoint o keys' });
    }
    await PushSubscription.upsert(req.user.id, {
      endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
      userAgent: req.header('User-Agent'),
    });
    res.status(201).json({ ok: true });
  } catch (error) {
    console.error('Error guardando suscripción push:', error);
    res.status(500).json({ error: 'Error al guardar la suscripción' });
  }
};

// POST /api/push/unsubscribe
const unsubscribe = async (req, res) => {
  try {
    const { endpoint } = req.body || {};
    if (!endpoint) {
      return res.status(400).json({ error: 'endpoint es requerido' });
    }
    const removed = await PushSubscription.deleteByEndpointForUser(req.user.id, endpoint);
    if (!removed) {
      return res.status(404).json({ error: 'Suscripción no encontrada' });
    }
    res.json({ ok: true });
  } catch (error) {
    console.error('Error eliminando suscripción push:', error);
    res.status(500).json({ error: 'Error al eliminar la suscripción' });
  }
};

// POST /api/push/test
const sendTest = async (req, res) => {
  try {
    await pushService.sendToUser(req.user.id, {
      title: 'Finanzas Personales',
      body: 'Notificación de prueba — si la ves, todo funciona 🎉',
      url: '/settings',
    });
    res.json({ ok: true });
  } catch (error) {
    console.error('Error enviando push de prueba:', error);
    res.status(500).json({ error: 'Error al enviar la notificación de prueba' });
  }
};

module.exports = { getVapidPublicKey, subscribe, unsubscribe, sendTest };
