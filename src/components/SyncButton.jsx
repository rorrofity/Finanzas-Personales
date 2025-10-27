import React, { useState } from 'react';
import {
  Button,
  CircularProgress,
  Snackbar,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  LinearProgress,
  Typography,
  Box,
  IconButton
} from '@mui/material';
import SyncIcon from '@mui/icons-material/Sync';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CloseIcon from '@mui/icons-material/Close';
import axios from 'axios';

/**
 * SyncButton Component
 * 
 * Botón para sincronizar transacciones desde emails bancarios vía N8N.
 * Muestra progreso, resultados y notificaciones.
 * 
 * Props:
 * - onSyncComplete: Callback ejecutado cuando la sincronización termina exitosamente
 * - variant: Variante del botón ('contained' | 'outlined' | 'text') - default: 'contained'
 * - size: Tamaño del botón ('small' | 'medium' | 'large') - default: 'medium'
 */
const SyncButton = ({ 
  onSyncComplete, 
  variant = 'contained',
  size = 'medium'
}) => {
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [notification, setNotification] = useState({
    open: false,
    message: '',
    severity: 'success'
  });
  const [resultDialog, setResultDialog] = useState({
    open: false,
    data: null
  });

  const handleSync = async () => {
    setLoading(true);
    setProgress(0);
    
    // Simular progreso mientras espera respuesta
    const progressInterval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 90) return prev;
        return prev + 10;
      });
    }, 500);
    
    try {
      const response = await axios.post('/api/transactions/sync-emails');
      
      clearInterval(progressInterval);
      setProgress(100);
      
      const { imported, skipped, errors, message } = response.data;
      
      // Mostrar resultado en dialog
      setResultDialog({
        open: true,
        data: {
          imported,
          skipped,
          errors,
          message
        }
      });
      
      // Mostrar notificación
      setNotification({
        open: true,
        message: message || `${imported} transacciones importadas`,
        severity: imported > 0 ? 'success' : 'info'
      });
      
      // Ejecutar callback para refrescar datos si hubo importaciones
      if (onSyncComplete && imported > 0) {
        setTimeout(() => onSyncComplete(), 1000);
      }
      
    } catch (error) {
      clearInterval(progressInterval);
      console.error('Error en sincronización:', error);
      
      const errorMessage = error.response?.data?.message || 
                          error.response?.data?.error ||
                          'Error al sincronizar transacciones';
      
      const errorDetails = error.response?.data?.details || '';
      
      setNotification({
        open: true,
        message: errorDetails ? `${errorMessage} - ${errorDetails}` : errorMessage,
        severity: 'error'
      });
      
      // Mostrar dialog de error si hay detalles
      if (error.response?.data) {
        setResultDialog({
          open: true,
          data: {
            imported: 0,
            skipped: 0,
            errors: [{ error: errorMessage }],
            message: errorMessage,
            isError: true
          }
        });
      }
    } finally {
      setLoading(false);
      setTimeout(() => setProgress(0), 1000);
    }
  };

  const handleCloseDialog = () => {
    setResultDialog({ open: false, data: null });
  };

  const handleCloseNotification = () => {
    setNotification({ ...notification, open: false });
  };

  return (
    <>
      <Box sx={{ display: 'inline-block', position: 'relative' }}>
        <Button
          variant={variant}
          color="primary"
          size={size}
          startIcon={loading ? <CircularProgress size={20} color="inherit" /> : <SyncIcon />}
          onClick={handleSync}
          disabled={loading}
          sx={{ minWidth: size === 'small' ? 150 : 200 }}
        >
          {loading ? 'Sincronizando...' : 'Sincronizar Emails'}
        </Button>
        
        {loading && (
          <Box sx={{ width: '100%', mt: 0.5 }}>
            <LinearProgress variant="determinate" value={progress} />
          </Box>
        )}
      </Box>
      
      {/* Notificación Toast */}
      <Snackbar
        open={notification.open}
        autoHideDuration={6000}
        onClose={handleCloseNotification}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert 
          severity={notification.severity}
          onClose={handleCloseNotification}
          variant="filled"
          sx={{ width: '100%' }}
        >
          {notification.message}
        </Alert>
      </Snackbar>
      
      {/* Dialog de Resultado */}
      <Dialog
        open={resultDialog.open}
        onClose={handleCloseDialog}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          <Box display="flex" alignItems="center" justifyContent="space-between">
            <Box display="flex" alignItems="center" gap={1}>
              {resultDialog.data?.isError ? (
                <>
                  <SyncIcon color="error" />
                  <Typography variant="h6">Error en Sincronización</Typography>
                </>
              ) : resultDialog.data?.imported > 0 ? (
                <>
                  <CheckCircleIcon color="success" />
                  <Typography variant="h6">Sincronización Exitosa</Typography>
                </>
              ) : (
                <>
                  <SyncIcon color="primary" />
                  <Typography variant="h6">Sincronización Completada</Typography>
                </>
              )}
            </Box>
            <IconButton
              edge="end"
              color="inherit"
              onClick={handleCloseDialog}
              aria-label="close"
            >
              <CloseIcon />
            </IconButton>
          </Box>
        </DialogTitle>
        
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            {resultDialog.data?.message}
          </DialogContentText>
          
          {resultDialog.data && !resultDialog.data.isError && (
            <Box>
              <Typography variant="body2" sx={{ mb: 1 }}>
                ✅ <strong>{resultDialog.data.imported}</strong> transacciones nuevas importadas
              </Typography>
              <Typography variant="body2" sx={{ mb: 1 }}>
                ⏭️ <strong>{resultDialog.data.skipped}</strong> transacciones duplicadas (omitidas)
              </Typography>
              {resultDialog.data.errors?.length > 0 && (
                <Box sx={{ mt: 2 }}>
                  <Typography variant="body2" color="error" sx={{ mb: 1 }}>
                    ❌ <strong>{resultDialog.data.errors.length}</strong> errores:
                  </Typography>
                  {resultDialog.data.errors.slice(0, 3).map((err, idx) => (
                    <Typography key={idx} variant="caption" display="block" color="text.secondary">
                      • {err.transaction || err.error}
                    </Typography>
                  ))}
                  {resultDialog.data.errors.length > 3 && (
                    <Typography variant="caption" display="block" color="text.secondary">
                      ... y {resultDialog.data.errors.length - 3} más
                    </Typography>
                  )}
                </Box>
              )}
            </Box>
          )}
          
          <Button
            onClick={handleCloseDialog}
            variant="contained"
            fullWidth
            sx={{ mt: 3 }}
          >
            Cerrar
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default SyncButton;
