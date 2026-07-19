import axios from '../config/axios';

/**
 * Cliente Web Push del navegador (Epic 13, Req 13.8).
 * Suscribe/desuscribe el Service Worker con la clave VAPID del backend y
 * sincroniza la suscripción con `/api/push/*`.
 */

/** Convierte una clave VAPID base64url a Uint8Array (formato de la Push API). */
export function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/** Suscripción actual del navegador (o null si nunca se suscribió). */
export async function getExistingSubscription() {
  const registration = await navigator.serviceWorker.ready;
  return registration.pushManager.getSubscription();
}

/** Pide la VAPID pública, suscribe el SW, y persiste la suscripción en el backend. */
export async function subscribe() {
  const { data } = await axios.get('/api/push/vapid-public-key');
  const registration = await navigator.serviceWorker.ready;

  const pushSubscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(data.publicKey),
  });

  const { endpoint, keys } = pushSubscription.toJSON();
  await axios.post('/api/push/subscribe', { endpoint, keys });
  return pushSubscription;
}

/** Desuscribe del navegador y avisa al backend para que borre la fila. */
export async function unsubscribe() {
  const registration = await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();
  if (!existing) return;

  await existing.unsubscribe();
  await axios.post('/api/push/unsubscribe', { endpoint: existing.endpoint });
}

/** Notificación de prueba enviada por el backend a los dispositivos del usuario. */
export async function sendTestPush() {
  await axios.post('/api/push/test');
}
