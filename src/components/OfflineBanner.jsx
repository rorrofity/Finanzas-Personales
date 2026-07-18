import React from 'react';
import { Alert, Box, Chip, Stack, Typography } from '@mui/material';
import WifiOffIcon from '@mui/icons-material/WifiOff';
import StorageIcon from '@mui/icons-material/Storage';
import { useOfflineContext } from '../contexts/OfflineContext';

const OfflineBanner = () => {
  const { isOffline, storageWarning } = useOfflineContext();

  if (!isOffline && !storageWarning) {
    return null;
  }

  return (
    <Box sx={{ mb: 2 }}>
      {isOffline && (
        <Alert
          severity="warning"
          icon={<WifiOffIcon />}
          sx={{ mb: storageWarning ? 1 : 0 }}
        >
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ xs: 'flex-start', sm: 'center' }}>
            <Typography fontWeight={600}>Sin conexión</Typography>
            <Typography variant="body2">Mostrando datos guardados. Las acciones que requieren escritura están deshabilitadas.</Typography>
            <Chip size="small" label="Requiere conexión" />
          </Stack>
        </Alert>
      )}
      {storageWarning && (
        <Alert severity="info" icon={<StorageIcon />}>
          <Typography variant="body2">El caché local está cerca del límite de almacenamiento del navegador.</Typography>
        </Alert>
      )}
    </Box>
  );
};

export default OfflineBanner;
