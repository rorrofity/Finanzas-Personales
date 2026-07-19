import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  FormControlLabel,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive';
import axios from '../config/axios';
import usePushNotifications from '../hooks/usePushNotifications';
import { sendTestPush } from '../services/pushClient';

const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent || '');
const isStandalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;

/**
 * Sección "Automatización" en Settings (Epic 13, solo dueño):
 * activar/desactivar sincronización programada + notificaciones push.
 */
const NotificationsSettings = () => {
  const [autoSyncEnabled, setAutoSyncEnabled] = useState(false);
  const [loadingSync, setLoadingSync] = useState(false);
  const [runs, setRuns] = useState([]);
  const [error, setError] = useState(null);
  const [testSent, setTestSent] = useState(false);

  const push = usePushNotifications();

  const fetchSettings = useCallback(async () => {
    try {
      const { data } = await axios.get('/api/sync/settings');
      setAutoSyncEnabled(!!data.autoSyncEnabled);
    } catch (e) {
      setError('Error al cargar configuración de sincronización');
    }
  }, []);

  const fetchRuns = useCallback(async () => {
    try {
      const { data } = await axios.get('/api/sync/runs');
      setRuns(data.runs || []);
    } catch (e) {
      // No crítico: la bitácora es informativa.
    }
  }, []);

  useEffect(() => {
    fetchSettings();
    fetchRuns();
  }, [fetchSettings, fetchRuns]);

  const toggleAutoSync = async (e) => {
    const value = e.target.checked;
    setLoadingSync(true);
    setError(null);
    try {
      const { data } = await axios.put('/api/sync/settings', { autoSyncEnabled: value });
      setAutoSyncEnabled(!!data.autoSyncEnabled);
    } catch (e) {
      setError(e.response?.data?.error || 'Error al actualizar la sincronización programada');
    } finally {
      setLoadingSync(false);
    }
  };

  const togglePush = async (e) => {
    setError(null);
    setTestSent(false);
    if (e.target.checked) {
      const ok = await push.enable();
      if (!ok && push.permission === 'denied') {
        setError('Permiso de notificaciones denegado. Actívalo desde los ajustes del navegador.');
      }
    } else {
      await push.disable();
    }
  };

  const handleTest = async () => {
    setError(null);
    setTestSent(false);
    try {
      await sendTestPush();
      setTestSent(true);
    } catch (e) {
      setError('Error al enviar la notificación de prueba');
    }
  };

  return (
    <Box>
      <Typography variant="h6" sx={{ mb: 1 }}>
        Automatización
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Sincroniza tus emails bancarios automáticamente dos veces al día
        (13:00 y 22:00) y recibe una notificación cuando lleguen movimientos
        nuevos para categorizar.
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
      {testSent && (
        <Alert severity="success" sx={{ mb: 2 }}>
          Notificación de prueba enviada.
        </Alert>
      )}

      <Stack spacing={1.5} sx={{ mb: 3 }}>
        <FormControlLabel
          control={
            <Checkbox
              checked={autoSyncEnabled}
              onChange={toggleAutoSync}
              disabled={loadingSync}
            />
          }
          label="Sincronizar automáticamente (2 veces al día)"
        />

        {!push.supported && (
          <Alert severity="info">
            Este navegador no soporta notificaciones push.
            {isIOS() && !isStandalone() && (
              <> En iPhone, agrega la app a tu pantalla de inicio (Compartir → Agregar a inicio) para poder activarlas.</>
            )}
          </Alert>
        )}

        {push.supported && (
          <>
            <FormControlLabel
              control={
                <Checkbox
                  checked={push.subscribed}
                  onChange={togglePush}
                  disabled={push.loading}
                />
              }
              label="Notificaciones push"
            />
            {push.subscribed && (
              <Box>
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<NotificationsActiveIcon />}
                  onClick={handleTest}
                >
                  Enviar prueba
                </Button>
              </Box>
            )}
          </>
        )}
      </Stack>

      {runs.length > 0 && (
        <Box>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>
            Últimas sincronizaciones
          </Typography>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Fecha</TableCell>
                <TableCell>Origen</TableCell>
                <TableCell align="center">Importadas</TableCell>
                <TableCell align="center">Estado</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {runs.slice(0, 10).map((run, idx) => (
                <TableRow key={idx}>
                  <TableCell>{new Date(run.createdAt).toLocaleString('es-CL')}</TableCell>
                  <TableCell>{run.trigger === 'scheduled' ? 'Programada' : 'Manual'}</TableCell>
                  <TableCell align="center">{run.imported}</TableCell>
                  <TableCell align="center">
                    <Chip
                      size="small"
                      label={run.error ? 'Error' : 'OK'}
                      color={run.error ? 'error' : 'success'}
                      variant="outlined"
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
      )}
    </Box>
  );
};

export default NotificationsSettings;
