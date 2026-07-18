import React, { useEffect, useState } from 'react';
import { Alert, Button, Snackbar, Stack } from '@mui/material';
import InstallMobileIcon from '@mui/icons-material/InstallMobile';

// La decisión de descarte se persiste para no insistir en cada visita.
export const INSTALL_DISMISSED_KEY = 'pwa-install-dismissed';

/**
 * Prompt de instalación PWA contextual (Req 9.2).
 *
 * Intercepta `beforeinstallprompt`, guarda el evento nativo y ofrece una
 * invitación propia. "Instalar" relanza el prompt del navegador; "Ahora no"
 * persiste el descarte en localStorage.
 */
const InstallPrompt = () => {
  const [installEvent, setInstallEvent] = useState(null);

  useEffect(() => {
    const onBeforeInstallPrompt = (event) => {
      event.preventDefault();
      if (localStorage.getItem(INSTALL_DISMISSED_KEY)) return;
      setInstallEvent(event);
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    return () =>
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
  }, []);

  const handleInstall = async () => {
    if (!installEvent) return;
    setInstallEvent(null);
    installEvent.prompt();
    try {
      await installEvent.userChoice;
    } catch (e) {
      // El usuario cerró el prompt nativo; no insistimos en esta sesión.
    }
  };

  const handleDismiss = () => {
    localStorage.setItem(INSTALL_DISMISSED_KEY, new Date().toISOString());
    setInstallEvent(null);
  };

  return (
    <Snackbar
      open={Boolean(installEvent)}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
    >
      <Alert
        severity="info"
        icon={<InstallMobileIcon />}
        sx={{ alignItems: 'center' }}
        action={
          <Stack direction="row" spacing={1}>
            <Button color="inherit" size="small" onClick={handleDismiss}>
              Ahora no
            </Button>
            <Button
              color="inherit"
              size="small"
              variant="outlined"
              onClick={handleInstall}
            >
              Instalar
            </Button>
          </Stack>
        }
      >
        Instala Finanzas en tu dispositivo para acceso rápido
      </Alert>
    </Snackbar>
  );
};

export default InstallPrompt;
