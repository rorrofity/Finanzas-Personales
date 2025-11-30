import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Box,
  Typography,
  Alert,
  CircularProgress,
  IconButton,
  Tooltip
} from '@mui/material';
import { Settings as SettingsIcon, Refresh as RefreshIcon } from '@mui/icons-material';
import axios from '../config/axios';

const monthNames = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

/**
 * Component to configure billing period date ranges
 * Allows user to set which transaction dates belong to which billing month
 */
const BillingPeriodConfig = ({ year, month, onRecalculated }) => {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [recalculating, setRecalculating] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [exists, setExists] = useState(false);

  // Load current period configuration when dialog opens
  useEffect(() => {
    if (open) {
      loadPeriod();
    }
  }, [open, year, month]);

  const loadPeriod = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await axios.get(`/api/billing/periods/${year}/${month}`);
      if (response.data.exists) {
        setPeriodStart(response.data.period.period_start.split('T')[0]);
        setPeriodEnd(response.data.period.period_end.split('T')[0]);
        setExists(true);
      } else {
        // Use suggested defaults
        setPeriodStart(response.data.suggested.period_start);
        setPeriodEnd(response.data.suggested.period_end);
        setExists(false);
      }
    } catch (err) {
      console.error('Error loading billing period:', err);
      setError('Error al cargar configuración');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await axios.post('/api/billing/periods', {
        billing_year: year,
        billing_month: month,
        period_start: periodStart,
        period_end: periodEnd
      });
      setExists(true);
      setSuccess('Período guardado correctamente');
    } catch (err) {
      console.error('Error saving billing period:', err);
      setError(err.response?.data?.error || 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const handleRecalculate = async () => {
    if (!exists) {
      setError('Primero guarda el período antes de recalcular');
      return;
    }
    
    setRecalculating(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await axios.post(`/api/billing/recalculate/${year}/${month}`);
      setSuccess(`${response.data.updated} transacciones actualizadas`);
      if (onRecalculated) {
        onRecalculated();
      }
    } catch (err) {
      console.error('Error recalculating:', err);
      setError(err.response?.data?.error || 'Error al recalcular');
    } finally {
      setRecalculating(false);
    }
  };

  const formatDateRange = () => {
    if (!periodStart || !periodEnd) return '';
    const start = new Date(periodStart + 'T12:00:00');
    const end = new Date(periodEnd + 'T12:00:00');
    return `${start.getDate()} ${monthNames[start.getMonth()]} - ${end.getDate()} ${monthNames[end.getMonth()]}`;
  };

  return (
    <>
      <Tooltip title="Configurar período de facturación">
        <IconButton 
          size="small" 
          onClick={() => setOpen(true)}
          sx={{ ml: 1 }}
        >
          <SettingsIcon fontSize="small" />
        </IconButton>
      </Tooltip>

      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>
          Configurar Período de Facturación - {monthNames[month - 1]} {year}
        </DialogTitle>
        
        <DialogContent>
          {loading ? (
            <Box display="flex" justifyContent="center" py={4}>
              <CircularProgress />
            </Box>
          ) : (
            <Box sx={{ mt: 2 }}>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                Define el rango de fechas de compras que se pagan en {monthNames[month - 1]} {year}
              </Typography>
              
              <Box sx={{ display: 'flex', gap: 2, mt: 3 }}>
                <TextField
                  label="Fecha Inicio"
                  type="date"
                  value={periodStart}
                  onChange={(e) => setPeriodStart(e.target.value)}
                  InputLabelProps={{ shrink: true }}
                  fullWidth
                  helperText="Primera fecha del período"
                />
                <TextField
                  label="Fecha Fin"
                  type="date"
                  value={periodEnd}
                  onChange={(e) => setPeriodEnd(e.target.value)}
                  InputLabelProps={{ shrink: true }}
                  fullWidth
                  helperText="Última fecha del período"
                />
              </Box>

              {periodStart && periodEnd && (
                <Alert severity="info" sx={{ mt: 2 }}>
                  Las compras realizadas entre <strong>{formatDateRange()}</strong> se asignarán a {monthNames[month - 1]} {year}
                </Alert>
              )}

              {error && (
                <Alert severity="error" sx={{ mt: 2 }}>
                  {error}
                </Alert>
              )}

              {success && (
                <Alert severity="success" sx={{ mt: 2 }}>
                  {success}
                </Alert>
              )}

              {exists && (
                <Box sx={{ mt: 3, p: 2, bgcolor: 'grey.100', borderRadius: 1 }}>
                  <Typography variant="subtitle2" gutterBottom>
                    Recalcular Transacciones
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Actualiza todas las transacciones en este rango de fechas para asignarlas a este período de facturación.
                  </Typography>
                  <Button
                    variant="outlined"
                    startIcon={recalculating ? <CircularProgress size={16} /> : <RefreshIcon />}
                    onClick={handleRecalculate}
                    disabled={recalculating}
                    sx={{ mt: 1 }}
                  >
                    {recalculating ? 'Recalculando...' : 'Recalcular Transacciones'}
                  </Button>
                </Box>
              )}
            </Box>
          )}
        </DialogContent>

        <DialogActions>
          <Button onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button 
            variant="contained" 
            onClick={handleSave}
            disabled={saving || !periodStart || !periodEnd}
          >
            {saving ? 'Guardando...' : 'Guardar Período'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default BillingPeriodConfig;
