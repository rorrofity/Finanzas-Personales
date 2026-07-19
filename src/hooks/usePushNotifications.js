import { useCallback, useEffect, useState } from 'react';
import * as pushClient from '../services/pushClient';

/**
 * Estado y acciones de notificaciones push (Epic 13, Reqs 13.7, 13.12).
 *
 * El permiso NUNCA se pide automáticamente al montar (Req 13.7) — solo
 * cuando el usuario invoca `enable()` explícitamente (p.ej. un toggle).
 */
export default function usePushNotifications() {
  const supported =
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    typeof window.Notification !== 'undefined';

  const [permission, setPermission] = useState(
    supported ? window.Notification.permission : 'unsupported'
  );
  const [subscribed, setSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!supported) return;
    pushClient
      .getExistingSubscription()
      .then((sub) => setSubscribed(!!sub))
      .catch(() => setSubscribed(false));
  }, [supported]);

  const enable = useCallback(async () => {
    if (!supported) return false;
    setLoading(true);
    setError(null);
    try {
      const result = await window.Notification.requestPermission();
      setPermission(result);
      if (result !== 'granted') {
        return false;
      }
      await pushClient.subscribe();
      setSubscribed(true);
      return true;
    } catch (err) {
      setError(err.message || 'Error al activar notificaciones');
      return false;
    } finally {
      setLoading(false);
    }
  }, [supported]);

  const disable = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await pushClient.unsubscribe();
      setSubscribed(false);
    } catch (err) {
      setError(err.message || 'Error al desactivar notificaciones');
    } finally {
      setLoading(false);
    }
  }, []);

  return { supported, permission, subscribed, loading, error, enable, disable };
}
