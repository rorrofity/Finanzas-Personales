import React, { useEffect, useState } from 'react';
import { Alert, Button, Snackbar } from '@mui/material';
import SystemUpdateIcon from '@mui/icons-material/SystemUpdate';

// Evento global que emite serviceWorkerRegistration cuando detecta un
// nuevo Service Worker instalado en estado `waiting` (Req 9.6).
export const SW_UPDATED_EVENT = 'swUpdated';

/**
 * Banner "Nueva versión disponible" (Req 9.6).
 *
 * Escucha SW_UPDATED_EVENT (detail = ServiceWorkerRegistration). Al pulsar
 * "Actualizar" envía SKIP_WAITING al worker en espera y recarga la página
 * cuando el nuevo SW toma control (controllerchange).
 */
const UpdateBanner = () => {
  const [waitingWorker, setWaitingWorker] = useState(null);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    const onSwUpdated = (event) => {
      const registration = event.detail;
      if (registration && registration.waiting) {
        setWaitingWorker(registration.waiting);
      }
    };

    window.addEventListener(SW_UPDATED_EVENT, onSwUpdated);
    return () => window.removeEventListener(SW_UPDATED_EVENT, onSwUpdated);
  }, []);

  useEffect(() => {
    if (!updating || !('serviceWorker' in navigator)) return undefined;

    const sw = navigator.serviceWorker;
    const onControllerChange = () => window.location.reload();
    sw.addEventListener('controllerchange', onControllerChange);
    return () => sw.removeEventListener('controllerchange', onControllerChange);
  }, [updating]);

  const handleUpdate = () => {
    if (!waitingWorker) return;
    setUpdating(true);
    waitingWorker.postMessage({ type: 'SKIP_WAITING' });
    // Fallback: si controllerchange no llega (SW ya activo), recargar igual.
    if (!('serviceWorker' in navigator)) {
      window.location.reload();
    }
  };

  return (
    <Snackbar
      open={Boolean(waitingWorker)}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
    >
      <Alert
        severity="info"
        icon={<SystemUpdateIcon />}
        action={
          <Button
            color="inherit"
            size="small"
            onClick={handleUpdate}
            disabled={updating}
          >
            {updating ? 'Actualizando…' : 'Actualizar'}
          </Button>
        }
        sx={{ alignItems: 'center' }}
      >
        Nueva versión disponible
      </Alert>
    </Snackbar>
  );
};

export default UpdateBanner;
