import React, { useState, useEffect } from 'react';
import {
  Container,
  Typography,
  Box,
  Card,
  CardContent,
  Button,
  Grid,
  Alert,
  CircularProgress,
  Chip,
  Divider,
  Stack
} from '@mui/material';
import {
  Warning as WarningIcon,
  CheckCircle as CheckCircleIcon,
  Delete as DeleteIcon,
  CompareArrows as CompareIcon
} from '@mui/icons-material';
import { getSuspiciousTransactions, resolveSuspicious } from '../services/suspiciousService';

const ReviewDuplicates = () => {
  const [suspicious, setSuspicious] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(null);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const loadSuspicious = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getSuspiciousTransactions();
      setSuspicious(data);
    } catch (err) {
      setError('Error al cargar transacciones sospechosas');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSuspicious();
  }, []);

  const handleResolve = async (suspiciousId, action, transactionIdToDelete = null) => {
    try {
      setProcessing(suspiciousId);
      setError(null);
      setSuccess(null);

      await resolveSuspicious(suspiciousId, action, transactionIdToDelete);
      
      setSuccess(
        action === 'delete' 
          ? 'Transacción duplicada eliminada exitosamente' 
          : 'Ambas transacciones confirmadas como válidas'
      );

      // Recargar lista
      await loadSuspicious();
    } catch (err) {
      setError(err.response?.data?.error || 'Error al resolver duplicado');
      console.error(err);
    } finally {
      setProcessing(null);
    }
  };

  const formatDate = (dateStr) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('es-CL', { 
      day: '2-digit', 
      month: 'short', 
      year: 'numeric' 
    });
  };

  const formatAmount = (amount) => {
    return new Intl.NumberFormat('es-CL', {
      style: 'currency',
      currency: 'CLP'
    }).format(amount);
  };

  if (loading) {
    return (
      <Container maxWidth="lg" sx={{ mt: 4, mb: 4, textAlign: 'center' }}>
        <CircularProgress />
        <Typography sx={{ mt: 2 }}>Cargando transacciones sospechosas...</Typography>
      </Container>
    );
  }

  if (suspicious.length === 0) {
    return (
      <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
        <Box sx={{ textAlign: 'center', py: 8 }}>
          <CheckCircleIcon sx={{ fontSize: 80, color: 'success.main', mb: 2 }} />
          <Typography variant="h5" gutterBottom>
            ¡Todo limpio!
          </Typography>
          <Typography color="text.secondary">
            No hay transacciones sospechosas pendientes de revisión
          </Typography>
        </Box>
      </Container>
    );
  }

  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <Box sx={{ mb: 4 }}>
        <Typography variant="h4" gutterBottom>
          Revisión de Duplicados
        </Typography>
        <Typography color="text.secondary">
          Se han detectado {suspicious.length} transacción(es) que podrían ser duplicadas.
          Revisa cada una y decide si mantener ambas o eliminar el duplicado.
        </Typography>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {success && (
        <Alert severity="success" sx={{ mb: 3 }} onClose={() => setSuccess(null)}>
          {success}
        </Alert>
      )}

      <Stack spacing={3}>
        {suspicious.map((item, index) => (
          <Card key={item.suspicious_id} elevation={3}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <WarningIcon sx={{ color: 'warning.main', mr: 1 }} />
                <Typography variant="h6">
                  Posible duplicado #{index + 1}
                </Typography>
                <Chip 
                  label={`${formatDate(item.fecha1)} • ${formatAmount(item.monto1)}`}
                  size="small"
                  sx={{ ml: 2 }}
                />
              </Box>

              <Grid container spacing={3}>
                {/* Transacción 1 */}
                <Grid item xs={12} md={5.5}>
                  <Box sx={{ 
                    p: 2, 
                    bgcolor: 'grey.50', 
                    borderRadius: 1,
                    border: '2px solid',
                    borderColor: 'grey.300'
                  }}>
                    <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                      Transacción Original
                    </Typography>
                    <Typography variant="body2" sx={{ fontWeight: 'bold', mb: 1 }}>
                      {item.descripcion1}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" display="block">
                      Importada: {formatDate(item.imported1_at)}
                    </Typography>
                    <Button
                      variant="outlined"
                      color="error"
                      size="small"
                      startIcon={<DeleteIcon />}
                      fullWidth
                      sx={{ mt: 2 }}
                      disabled={processing === item.suspicious_id}
                      onClick={() => handleResolve(item.suspicious_id, 'delete', item.transaction1_id)}
                    >
                      Eliminar esta
                    </Button>
                  </Box>
                </Grid>

                {/* Comparación */}
                <Grid item xs={12} md={1} sx={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center' 
                }}>
                  <CompareIcon sx={{ color: 'text.secondary' }} />
                </Grid>

                {/* Transacción 2 */}
                <Grid item xs={12} md={5.5}>
                  <Box sx={{ 
                    p: 2, 
                    bgcolor: 'grey.50', 
                    borderRadius: 1,
                    border: '2px solid',
                    borderColor: 'grey.300'
                  }}>
                    <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                      Transacción Similar
                    </Typography>
                    <Typography variant="body2" sx={{ fontWeight: 'bold', mb: 1 }}>
                      {item.descripcion2}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" display="block">
                      Importada: {formatDate(item.imported2_at)}
                    </Typography>
                    <Button
                      variant="outlined"
                      color="error"
                      size="small"
                      startIcon={<DeleteIcon />}
                      fullWidth
                      sx={{ mt: 2 }}
                      disabled={processing === item.suspicious_id}
                      onClick={() => handleResolve(item.suspicious_id, 'delete', item.transaction2_id)}
                    >
                      Eliminar esta
                    </Button>
                  </Box>
                </Grid>
              </Grid>

              <Divider sx={{ my: 2 }} />

              <Box sx={{ display: 'flex', justifyContent: 'center' }}>
                <Button
                  variant="contained"
                  color="success"
                  startIcon={<CheckCircleIcon />}
                  disabled={processing === item.suspicious_id}
                  onClick={() => handleResolve(item.suspicious_id, 'keep_both')}
                >
                  {processing === item.suspicious_id ? (
                    <>
                      <CircularProgress size={20} sx={{ mr: 1 }} />
                      Procesando...
                    </>
                  ) : (
                    'Mantener Ambas (No son duplicadas)'
                  )}
                </Button>
              </Box>
            </CardContent>
          </Card>
        ))}
      </Stack>
    </Container>
  );
};

export default ReviewDuplicates;
