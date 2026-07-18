import { useState, useEffect, useCallback } from 'react';

/**
 * Hook de detección de conectividad (Req 9.3, 9.12).
 *
 * Devuelve { isOnline, isOffline } y se mantiene sincronizado con los
 * eventos 'online'/'offline' del navegador.
 */
export default function useOffline() {
  const getStatus = () =>
    typeof navigator !== 'undefined' && typeof navigator.onLine === 'boolean'
      ? navigator.onLine
      : true;

  const [isOnline, setIsOnline] = useState(getStatus);

  const handleOnline = useCallback(() => setIsOnline(true), []);
  const handleOffline = useCallback(() => setIsOnline(false), []);

  useEffect(() => {
    // Sincronizar por si el estado cambió antes de montar.
    setIsOnline(getStatus());

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [handleOnline, handleOffline]);

  return { isOnline, isOffline: !isOnline };
}
