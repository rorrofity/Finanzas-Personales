import React, { useState, useEffect } from 'react';
import {
  Drawer,
  Box,
  Typography,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  CircularProgress,
  Divider,
  useTheme,
  useMediaQuery,
} from '@mui/material';
import { Close as CloseIcon } from '@mui/icons-material';
import axios from 'axios';
import { formatDateLocal } from '../utils/dateUtils';

const SOURCE_LABELS = {
  tc_nacional: { label: 'TC', color: 'error' },
  tc_internacional: { label: 'Intl', color: 'secondary' },
  cuenta_corriente: { label: 'CC', color: 'warning' },
};

const CategoryDetailDrawer = ({ open, onClose, category, year, month, color }) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('es-CL', {
      style: 'currency',
      currency: 'CLP',
      maximumFractionDigits: 0
    }).format(amount);
  };

  useEffect(() => {
    if (open && category && year && month) {
      fetchTransactions();
    }
  }, [open, category, year, month]);

  const fetchTransactions = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await axios.get('/api/dashboard/category-transactions', {
        params: { periodYear: year, periodMonth: month, category }
      });
      setData(res.data);
    } catch (err) {
      console.error('Error fetching category transactions:', err);
      setError('Error al cargar transacciones');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    onClose();
    setTimeout(() => setData(null), 300);
  };

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={handleClose}
      PaperProps={{
        sx: {
          width: isMobile ? '100%' : 480,
          maxWidth: '100vw',
        }
      }}
    >
      {/* Header */}
      <Box sx={{
        p: 2,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderBottom: `3px solid ${color || theme.palette.primary.main}`,
        bgcolor: theme.palette.background.default,
        position: 'sticky',
        top: 0,
        zIndex: 1,
      }}>
        <Box>
          <Typography variant="h6" fontWeight={700} sx={{ color: color || theme.palette.primary.main }}>
            {category}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {monthNames[(month || 1) - 1]} {year}
          </Typography>
        </Box>
        <IconButton onClick={handleClose} size="small">
          <CloseIcon />
        </IconButton>
      </Box>

      {/* Summary */}
      {data && !loading && (
        <Box sx={{
          px: 2, py: 1.5,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          bgcolor: theme.palette.action.hover,
        }}>
          <Typography variant="body2" color="text.secondary">
            {data.count} transacción{data.count !== 1 ? 'es' : ''}
          </Typography>
          <Typography variant="h6" fontWeight={700}>
            {formatCurrency(data.total)}
          </Typography>
        </Box>
      )}

      <Divider />

      {/* Content */}
      <Box sx={{ flex: 1, overflow: 'auto' }}>
        {loading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
            <CircularProgress />
          </Box>
        )}

        {error && (
          <Box sx={{ p: 3, textAlign: 'center' }}>
            <Typography color="error">{error}</Typography>
          </Box>
        )}

        {data && !loading && data.transactions.length === 0 && (
          <Box sx={{ p: 3, textAlign: 'center' }}>
            <Typography color="text.secondary">No hay transacciones en esta categoría</Typography>
          </Box>
        )}

        {data && !loading && data.transactions.length > 0 && (
          <TableContainer>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 600, fontSize: '0.75rem' }}>Fecha</TableCell>
                  <TableCell sx={{ fontWeight: 600, fontSize: '0.75rem' }}>Descripción</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600, fontSize: '0.75rem' }}>Monto</TableCell>
                  <TableCell align="center" sx={{ fontWeight: 600, fontSize: '0.75rem' }}>Fuente</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {data.transactions.map((tx, idx) => {
                  const srcInfo = SOURCE_LABELS[tx.source] || { label: tx.source, color: 'default' };
                  return (
                    <TableRow key={idx} hover sx={{ '&:last-child td': { borderBottom: 0 } }}>
                      <TableCell sx={{ fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                        {formatDateLocal(typeof tx.fecha === 'string' ? tx.fecha : new Date(tx.fecha).toISOString().split('T')[0])}
                      </TableCell>
                      <TableCell sx={{ fontSize: '0.8rem', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {tx.descripcion}
                      </TableCell>
                      <TableCell align="right" sx={{ fontSize: '0.8rem', fontWeight: 600, whiteSpace: 'nowrap' }}>
                        {formatCurrency(tx.monto)}
                      </TableCell>
                      <TableCell align="center">
                        <Chip
                          label={srcInfo.label}
                          color={srcInfo.color}
                          size="small"
                          variant="outlined"
                          sx={{ fontSize: '0.65rem', height: 20 }}
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Box>
    </Drawer>
  );
};

export default CategoryDetailDrawer;
