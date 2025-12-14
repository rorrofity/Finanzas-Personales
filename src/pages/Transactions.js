import React, { useState, useEffect, useMemo } from 'react';
import {
  Box,
  Paper,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  MenuItem,
  IconButton,
  Tooltip,
  CircularProgress,
  LinearProgress,
  FormControl,
  Select,
  InputLabel,
  Snackbar,
  Alert,
  Chip,
  Switch,
  FormControlLabel,
  Card,
  CardContent,
  Stack,
  useMediaQuery,
  useTheme,
  Grid,
} from '@mui/material';
import { 
  Delete as DeleteIcon, 
  Edit as EditIcon,
  ArrowUpward as ArrowUpwardIcon,
  ArrowDownward as ArrowDownwardIcon 
} from '@mui/icons-material';
import axios from 'axios';
import MonthPicker from '../components/MonthPicker';
import SyncButton from '../components/SyncButton';
import { usePeriod } from '../contexts/PeriodContext';

const Transactions = () => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md')); // < 900px shows card view
  const [transactions, setTransactions] = useState([]);
  const [categoriesList, setCategoriesList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [orderBy, setOrderBy] = useState('fecha');
  const [orderDirection, setOrderDirection] = useState('DESC');
  const [openDialog, setOpenDialog] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState(null);
  const [openImportDialog, setOpenImportDialog] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [provider, setProvider] = useState(localStorage.getItem('import_provider') || '');
  const [network, setNetwork] = useState(localStorage.getItem('import_network') || '');
  // Período del extracto (Mes/Año) para importar: por defecto el mes siguiente al actual
  const computeNextMonth = () => {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth() + 1; // 1-12
    const nextM = m === 12 ? 1 : m + 1;
    const nextY = m === 12 ? y + 1 : y;
    return { nextY, nextM };
  };
  const { nextY, nextM } = computeNextMonth();
  const [importYear, setImportYear] = useState(nextY);
  const [importMonth, setImportMonth] = useState(nextM);
  const [formData, setFormData] = useState({
    fecha: '',
    descripcion: '',
    monto: '',
    category_id: '',
    tipo: 'gasto',
  });
  const [selectedTransactions, setSelectedTransactions] = useState([]);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [transactionToDelete, setTransactionToDelete] = useState(null);
  const [hideDismissed, setHideDismissed] = useState(false);
  const [showInfo, setShowInfo] = useState(() => {
    // Mostrar alerta informativa por sesión, una sola vez
    const dismissed = sessionStorage.getItem('dismiss_info_desestimar');
    return dismissed !== '1';
  });

  const { startISO, endISO, year, month } = usePeriod();
  const periodKey = `${year}-${String(month).padStart(2,'0')}`;
  const [cardFilter, setCardFilter] = useState(() => {
    try { return sessionStorage.getItem(`tcFilterCard::transactions::${periodKey}`) || 'ALL'; } catch { return 'ALL'; }
  });

  useEffect(() => {
    fetchTransactions();
    fetchCategories();
  }, []);

  const fetchCategories = async () => {
    try {
      const response = await axios.get('/api/categories');
      setCategoriesList(response.data || []);
    } catch (err) {
      console.error('Error fetching categories:', err);
      setError('Error al cargar las categorías');
    }
  };

  const fetchTransactions = async () => {
    try {
      setLoading(true);
      const response = await axios.get('/api/transactions', {
        params: {
          orderBy,
          orderDirection,
          periodYear: year,
          periodMonth: month
        }
      });
      setTransactions(response.data || []);
      setError(null);
    } catch (err) {
      setError('Error al cargar las transacciones');
      console.error('Error fetching transactions:', err);
      setTransactions([]);
    } finally {
      setLoading(false);
    }
  };

  const handleChangePage = (event, newPage) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (event) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  const handleOpenDialog = (transaction = null) => {
    if (transaction) {
      setSelectedTransaction(transaction);
      setFormData({
        fecha: transaction.fecha.split('T')[0],
        descripcion: transaction.descripcion,
        monto: transaction.monto.toString(),
        category_id: transaction.category_id || '',
        tipo: transaction.tipo,
      });
    } else {
      setSelectedTransaction(null);
      setFormData({
        fecha: new Date().toISOString().split('T')[0],
        descripcion: '',
        monto: '',
        category_id: '',
        tipo: 'gasto',
      });
    }
    setOpenDialog(true);
  };

  const handleCloseDialog = () => {
    setOpenDialog(false);
    setSelectedTransaction(null);
    setFormData({
      fecha: '',
      descripcion: '',
      monto: '',
      category_id: '',
      tipo: 'gasto',
    });
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    if (name === 'monto') {
      // Si el monto es negativo, automáticamente cambiar el tipo a "pago"
      const montoValue = parseFloat(value);
      if (!isNaN(montoValue) && montoValue < 0) {
        setFormData(prev => ({
          ...prev,
          [name]: value,
          tipo: 'pago'
        }));
        return;
      }
    }
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (selectedTransaction) {
        await axios.put(`/api/transactions/${selectedTransaction.id}`, formData);
      } else {
        await axios.post('/api/transactions', formData);
      }
      fetchTransactions();
      handleCloseDialog();
    } catch (err) {
      setError('Error al guardar la transacción');
      console.error('Error saving transaction:', err);
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm('¿Estás seguro de que deseas eliminar esta transacción?')) {
      try {
        await axios.delete(`/api/transactions/${id}`);
        fetchTransactions();
      } catch (err) {
        setError('Error al eliminar la transacción');
        console.error('Error deleting transaction:', err);
      }
    }
  };

  const handleFileSelect = (event) => {
    const file = event.target.files[0];
    const allowedTypes = [
      'text/csv',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ];
    
    if (file && (allowedTypes.includes(file.type) || 
        file.name.endsWith('.csv') || 
        file.name.endsWith('.xls') || 
        file.name.endsWith('.xlsx'))) {
      setSelectedFile(file);
      setError(null);
    } else {
      setError('Por favor selecciona un archivo CSV o Excel (.xls, .xlsx)');
      setSelectedFile(null);
    }
  };

  const handleImport = async () => {
    if (!selectedFile) {
      setError('Por favor selecciona un archivo CSV o Excel');
      return;
    }
    if (!provider) {
      setError('Debes seleccionar un banco (Banco de Chile o Banco Cencosud)');
      return;
    }
    if (provider === 'banco_chile' && !network) {
      setError('Para Banco de Chile debes seleccionar Visa o Mastercard');
      return;
    }
    if (!importYear || !importMonth) {
      setError('Debes seleccionar el Mes y Año del extracto');
      return;
    }

    const formData = new FormData();
    formData.append('file', selectedFile);
    formData.append('provider', provider);
    if (provider === 'banco_chile') {
      formData.append('network', network);
    }
    formData.append('periodYear', String(importYear));
    formData.append('periodMonth', String(importMonth));

    try {
      setLoading(true);
      setUploadProgress(0);
      
      const response = await axios.post('/api/transactions/import', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        onUploadProgress: (progressEvent) => {
          const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          setUploadProgress(progress);
        },
      });

      setSnackbar({
        open: true,
        message: 'Archivo importado exitosamente',
        severity: 'success'
      });
      
      fetchTransactions();
      setOpenImportDialog(false);
      setSelectedFile(null);
      setUploadProgress(0);
    } catch (err) {
      console.error('Error importing file:', err);
      setError(err.response?.data?.message || 'Error al importar el archivo');
      setSnackbar({
        open: true,
        message: 'Error al importar el archivo',
        severity: 'error'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSelectTransaction = (transactionId) => {
    setSelectedTransactions((prev) => {
      if (prev.includes(transactionId)) {
        return prev.filter((id) => id !== transactionId);
      } else {
        return [...prev, transactionId];
      }
    });
  };

  const handleSelectAll = (event) => {
    if (event.target.checked) {
      setSelectedTransactions(transactions.map((t) => t.id));
    } else {
      setSelectedTransactions([]);
    }
  };

  const handleDeleteClick = (transaction = null) => {
    if (transaction) {
      setTransactionToDelete(transaction);
    }
    setShowDeleteModal(true);
  };

  const handleDeleteConfirm = async () => {
    try {
      setLoading(true);
      if (transactionToDelete) {
        // Eliminar una sola transacción
        await axios.delete(`/api/transactions/${transactionToDelete.id}`);
      } else {
        // Eliminar múltiples transacciones
        await axios.delete('/api/transactions', {
          data: { transactionIds: selectedTransactions },
        });
      }

      setShowDeleteModal(false);
      setTransactionToDelete(null);
      setSelectedTransactions([]);
      fetchTransactions();
    } catch (err) {
      setError('Error al eliminar la(s) transacción(es)');
      console.error('Error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCategoryChange = async (transactionId, newCategoryId) => {
    try {
      const response = await axios.put(`/api/transactions/${transactionId}/category`, {
        category_id: newCategoryId
      });

      if (response.data) {
        // Actualizar la transacción con todos los datos devueltos por el backend
        setTransactions(prevTransactions =>
          prevTransactions.map(t =>
            t.id === transactionId ? { ...t, ...response.data } : t
          )
        );

        // Refrescar los datos del dashboard si está disponible
        if (typeof window.refreshDashboardData === 'function') {
          window.refreshDashboardData();
        }

        setSnackbar({
          open: true,
          message: 'Categoría actualizada correctamente',
          severity: 'success'
        });
      }
    } catch (error) {
      console.error('Error updating category:', error);
      setSnackbar({
        open: true,
        message: 'Error al actualizar la categoría',
        severity: 'error'
      });
    }
  };

  const handleTypeChange = async (transactionId, newType) => {
    try {
      // Encontrar la transacción actual
      const transaction = transactions.find(t => t.id === transactionId);
      if (!transaction) return;

      // Enviar todos los campos necesarios
      const response = await axios.put(`/api/transactions/${transactionId}`, {
        fecha: transaction.fecha,
        descripcion: transaction.descripcion,
        monto: transaction.monto,
        category_id: transaction.category_id,
        tipo: newType
      });

      if (response.data) {
        setTransactions(prevTransactions =>
          prevTransactions.map(t =>
            t.id === transactionId ? { ...t, tipo: newType } : t
          )
        );

        setSnackbar({
          open: true,
          message: 'Tipo de transacción actualizado correctamente',
          severity: 'success'
        });

        // Si existe un refresco del dashboard expuesto globalmente
        if (typeof window.refreshDashboardData === 'function') {
          window.refreshDashboardData();
        }
      }
    } catch (error) {
      console.error('Error updating transaction type:', error);
      setSnackbar({
        open: true,
        message: 'Error al actualizar el tipo de transacción',
        severity: 'error'
      });
    }
  };

  const handleCloseSnackbar = () => {
    setSnackbar(prev => ({ ...prev, open: false }));
  };

  const formatAmount = (amount) => {
    // Convertir a número y quitar los decimales
    const num = Math.round(parseFloat(amount));
    // Formatear con separadores de miles pero sin decimales
    return new Intl.NumberFormat('es-CL', {
      style: 'currency',
      currency: 'CLP',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(Math.abs(num));
  };

  // Función para manejar el ordenamiento
  const handleSort = (field) => {
    if (orderBy === field) {
      setOrderDirection(orderDirection === 'ASC' ? 'DESC' : 'ASC');
    } else {
      setOrderBy(field);
      setOrderDirection('ASC');
    }
  };

  // Componente para el encabezado ordenable
  const SortableTableCell = ({ field, label }) => (
    <TableCell>
      <Box sx={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }} onClick={() => handleSort(field)}>
        {label}
        <IconButton size="small">
          {orderBy === field ? (
            orderDirection === 'ASC' ? <ArrowUpwardIcon /> : <ArrowDownwardIcon />
          ) : (
            <ArrowUpwardIcon sx={{ opacity: 0.3 }} />
          )}
        </IconButton>
      </Box>
    </TableCell>
  );

  useEffect(() => {
    setPage(0);
    fetchTransactions();
    // restaurar filtro por período
    try {
      const saved = sessionStorage.getItem(`tcFilterCard::transactions::${periodKey}`);
      setCardFilter(saved || 'ALL');
    } catch {}
  }, [orderBy, orderDirection, year, month]);

  // Colección filtrada por tarjeta + toggle desestimados
  const filteredTransactions = (hideDismissed ? transactions.filter(t => t.tipo !== 'desestimar') : transactions)
    .filter(t => {
      if (cardFilter === 'ALL') return true;
      const net = (t.network || '').toLowerCase();
      if (cardFilter === 'VISA') return net === 'visa';
      if (cardFilter === 'MASTERCARD') return net === 'mastercard';
      return true;
    });

  const titleBrandLabel = cardFilter === 'ALL' ? 'Todas' : (cardFilter === 'VISA' ? 'Visa' : 'Mastercard');

  // Calcular totales
  const totals = useMemo(() => {
    const gastos = filteredTransactions.filter(t => t.tipo === 'gasto');
    const pagos = filteredTransactions.filter(t => t.tipo === 'pago');
    return {
      totalGastos: gastos.reduce((sum, t) => sum + Math.abs(Number(t.monto || 0)), 0),
      countGastos: gastos.length,
      totalPagos: pagos.reduce((sum, t) => sum + Math.abs(Number(t.monto || 0)), 0),
      countPagos: pagos.length,
      countTotal: filteredTransactions.length
    };
  }, [filteredTransactions]);

  const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  const monthLabel = `${monthNames[month - 1]} ${year}`;

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="200px">
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Box p={3}>
        <Typography color="error">{error}</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ p: { xs: 1, sm: 2, md: 3 } }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h5" fontWeight={700}>Transacciones No Facturadas (TC)</Typography>
        <MonthPicker />
      </Box>

      {/* Cards de totales */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} md={4}>
          <Card sx={{ bgcolor: 'error.main', color: 'white' }}>
            <CardContent>
              <Typography variant="subtitle2" sx={{ opacity: 0.9 }}>Total Gastos ({monthLabel})</Typography>
              <Typography variant="h4" fontWeight="bold">{formatAmount(totals.totalGastos)}</Typography>
              <Typography variant="caption" sx={{ opacity: 0.8 }}>{totals.countGastos} transacciones</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={4}>
          <Card sx={{ bgcolor: 'success.main', color: 'white' }}>
            <CardContent>
              <Typography variant="subtitle2" sx={{ opacity: 0.9 }}>Total Pagos ({monthLabel})</Typography>
              <Typography variant="h4" fontWeight="bold">{formatAmount(totals.totalPagos)}</Typography>
              <Typography variant="caption" sx={{ opacity: 0.8 }}>{totals.countPagos} transacciones</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={4}>
          <Card sx={{ bgcolor: 'primary.main', color: 'white' }}>
            <CardContent>
              <Typography variant="subtitle2" sx={{ opacity: 0.9 }}>Balance ({monthLabel})</Typography>
              <Typography variant="h4" fontWeight="bold">{formatAmount(totals.totalGastos - totals.totalPagos)}</Typography>
              <Typography variant="caption" sx={{ opacity: 0.8 }}>Gastos - Pagos</Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {showInfo && (
        <Alert
          severity="info"
          sx={{ mb: 2 }}
          onClose={() => {
            setShowInfo(false);
            sessionStorage.setItem('dismiss_info_desestimar', '1');
          }}
        >
          Marca como Desestimar los pagos del período anterior para que no afecten este mes.
        </Alert>
      )}
      <Paper>
        <Box p={{ xs: 1, sm: 2 }} display="flex" flexDirection={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ xs: 'stretch', sm: 'center' }} gap={1}>
          <Typography variant={isMobile ? "subtitle1" : "h6"} fontWeight="bold">
            Transacciones • {titleBrandLabel} ({filteredTransactions.length})
          </Typography>
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            <SyncButton 
              onSyncComplete={() => {
                fetchTransactions();
              }}
              variant="outlined"
              size="small"
            />
            {!isMobile && (
              <>
                <Button
                  variant="contained"
                  color="primary"
                  size="small"
                  onClick={() => handleOpenDialog()}
                >
                  Nueva
                </Button>
                <Button
                  variant="contained"
                  color="primary"
                  size="small"
                  onClick={() => setOpenImportDialog(true)}
                >
                  Importar
                </Button>
              </>
            )}
          </Stack>
        </Box>
        <Box px={{ xs: 1, sm: 2 }} pb={1} display="flex" alignItems="center" gap={1} flexWrap="wrap">
          <FormControlLabel
            control={
              <Switch
                size="small"
                checked={hideDismissed}
                onChange={(e) => setHideDismissed(e.target.checked)}
              />
            }
            label={<Typography variant="body2">Ocultar desest.</Typography>}
          />
          <TextField
            select
            size="small"
            label="Tarjeta"
            value={cardFilter}
            onChange={(e)=>{
              const v = e.target.value;
              setCardFilter(v);
              setPage(0);
              try { sessionStorage.setItem(`tcFilterCard::transactions::${periodKey}`, v); } catch {}
            }}
            sx={{ minWidth: { xs: 100, sm: 180 } }}
          >
            <MenuItem value="ALL">Todas</MenuItem>
            <MenuItem value="VISA">Visa</MenuItem>
            <MenuItem value="MASTERCARD">Mastercard</MenuItem>
          </TextField>
          {selectedTransactions.length > 0 && (
            <Button
              variant="contained"
              color="error"
              onClick={() => handleDeleteClick()}
            >
              Eliminar seleccionadas ({selectedTransactions.length})
            </Button>
          )}
        </Box>

        {/* Vista móvil: Cards */}
        {isMobile ? (
          <Box sx={{ p: 1 }}>
            {filteredTransactions.length === 0 ? (
              <Typography align="center" color="text.secondary" sx={{ py: 4 }}>
                No hay transacciones este mes
              </Typography>
            ) : (
              <Stack spacing={1}>
                {filteredTransactions
                  .slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)
                  .map((transaction) => (
                    <Card key={transaction.id} variant="outlined" sx={{ 
                      borderLeft: transaction.category_id ? '4px solid #4caf50' : '4px solid #ff9800',
                    }}>
                      <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
                        <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb={1}>
                          <Box flex={1}>
                            <Typography variant="body2" fontWeight="bold" sx={{ 
                              overflow: 'hidden', 
                              textOverflow: 'ellipsis',
                              display: '-webkit-box',
                              WebkitLineClamp: 2,
                              WebkitBoxOrient: 'vertical',
                            }}>
                              {transaction.descripcion}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              {new Date(transaction.fecha).toLocaleDateString()} • {transaction.network || '-'}
                            </Typography>
                          </Box>
                          <Typography variant="body1" fontWeight="bold" color="error.main" sx={{ ml: 1, whiteSpace: 'nowrap' }}>
                            {formatAmount(transaction.monto)}
                          </Typography>
                        </Box>
                        
                        <Stack direction="row" spacing={1} alignItems="center">
                          <Select
                            size="small"
                            value={transaction.category_id || ''}
                            onChange={(e) => handleCategoryChange(transaction.id, e.target.value)}
                            displayEmpty
                            sx={{ flex: 1, '& .MuiSelect-select': { py: 0.75 } }}
                          >
                            <MenuItem value=""><em>Sin categoría</em></MenuItem>
                            {categoriesList.map((category) => (
                              <MenuItem key={category.id} value={category.id}>{category.name}</MenuItem>
                            ))}
                          </Select>
                          <Select
                            size="small"
                            value={transaction.tipo}
                            onChange={(e) => handleTypeChange(transaction.id, e.target.value)}
                            sx={{ minWidth: 90, '& .MuiSelect-select': { py: 0.75 } }}
                          >
                            <MenuItem value="gasto">Gasto</MenuItem>
                            <MenuItem value="pago">Pago</MenuItem>
                            <MenuItem value="desestimar">Desest.</MenuItem>
                          </Select>
                          <IconButton size="small" onClick={() => handleDeleteClick(transaction)}>
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </Stack>
                      </CardContent>
                    </Card>
                  ))}
              </Stack>
            )}
          </Box>
        ) : (
          /* Vista desktop: Tabla */
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>
                    <input
                      type="checkbox"
                      checked={selectedTransactions.length === transactions.length && transactions.length > 0}
                      onChange={handleSelectAll}
                    />
                  </TableCell>
                  <SortableTableCell field="fecha" label="Fecha" />
                  <SortableTableCell field="descripcion" label="Descripción" />
                  <SortableTableCell field="monto" label="Monto" />
                  <SortableTableCell field="category_name" label="Categoría" />
                  <SortableTableCell field="tipo" label="Tipo" />
                  <SortableTableCell field="provider" label="Banco" />
                  <SortableTableCell field="network" label="Tarjeta" />
                  <TableCell>Acciones</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredTransactions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} align="center">
                      No hay transacciones este mes
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredTransactions
                    .slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)
                    .map((transaction) => (
                      <TableRow key={transaction.id}>
                        <TableCell>
                          <input
                            type="checkbox"
                            checked={selectedTransactions.includes(transaction.id)}
                            onChange={() => handleSelectTransaction(transaction.id)}
                          />
                        </TableCell>
                        <TableCell>{new Date(transaction.fecha).toLocaleDateString()}</TableCell>
                        <TableCell>
                          {transaction.descripcion}{' '}
                          {transaction.tipo === 'desestimar' && (
                            <Chip size="small" label="Desestimado" color="warning" sx={{ ml: 1 }} />
                          )}
                        </TableCell>
                        <TableCell>
                          {formatAmount(transaction.monto)}
                        </TableCell>
                        <TableCell>
                          <Select
                            size="small"
                            value={transaction.category_id || ''}
                            onChange={(e) => handleCategoryChange(transaction.id, e.target.value)}
                            displayEmpty
                            sx={{
                              minWidth: 120,
                              '& .MuiSelect-select': {
                                padding: '8px 14px',
                              }
                            }}
                          >
                            <MenuItem value="">
                              <em>Sin categoría</em>
                            </MenuItem>
                            {categoriesList.map((category) => (
                              <MenuItem key={category.id} value={category.id}>
                                {category.name}
                              </MenuItem>
                            ))}
                          </Select>
                        </TableCell>
                        <TableCell>
                          <Select
                            size="small"
                            value={transaction.tipo}
                            onChange={(e) => handleTypeChange(transaction.id, e.target.value)}
                            sx={{
                              minWidth: 100,
                              '& .MuiSelect-select': {
                                padding: '8px 14px',
                              }
                            }}
                          >
                            <MenuItem value="gasto">Gasto</MenuItem>
                            <MenuItem value="pago">Pago</MenuItem>
                            <MenuItem value="desestimar">Desestimar</MenuItem>
                          </Select>
                        </TableCell>
                        <TableCell>
                          {(() => {
                            const p = transaction.provider;
                            if (!p) return '-';
                            if (p === 'banco_chile') return 'Banco de Chile';
                            if (p === 'banco_cencosud') return 'Banco Cencosud';
                            return p;
                          })()}
                        </TableCell>
                        <TableCell>
                          {transaction.network ? (transaction.network.charAt(0).toUpperCase() + transaction.network.slice(1)) : '-'}
                        </TableCell>
                        <TableCell>
                          <Tooltip title="Editar">
                            <IconButton
                              size="small"
                              onClick={() => handleOpenDialog(transaction)}
                            >
                              <EditIcon />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Eliminar">
                            <IconButton
                              size="small"
                              onClick={() => handleDeleteClick(transaction)}
                            >
                              <DeleteIcon />
                            </IconButton>
                          </Tooltip>
                        </TableCell>
                      </TableRow>
                    ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        )}

        <TablePagination
          rowsPerPageOptions={isMobile ? [10, 25] : [5, 10, 25]}
          component="div"
          count={filteredTransactions.length}
          rowsPerPage={rowsPerPage}
          page={page}
          onPageChange={handleChangePage}
          onRowsPerPageChange={handleChangeRowsPerPage}
          labelRowsPerPage={isMobile ? "" : "Filas por página:"}
        />
      </Paper>

      <Dialog open={openDialog} onClose={handleCloseDialog}>
        <DialogTitle>
          {selectedTransaction ? 'Editar Transacción' : 'Nueva Transacción'}
        </DialogTitle>
        <DialogContent>
          <Box component="form" onSubmit={handleSubmit} sx={{ mt: 1 }}>
            <TextField
              margin="normal"
              required
              fullWidth
              type="date"
              name="fecha"
              label="Fecha"
              InputLabelProps={{ shrink: true }}
              value={formData.fecha}
              onChange={handleInputChange}
            />
            <TextField
              margin="normal"
              required
              fullWidth
              name="descripcion"
              label="Descripción"
              value={formData.descripcion}
              onChange={handleInputChange}
            />
            <TextField
              margin="normal"
              required
              fullWidth
              type="number"
              name="monto"
              label="Monto"
              value={formData.monto}
              onChange={handleInputChange}
            />
            <FormControl fullWidth sx={{ mb: 2 }}>
              <InputLabel>Categoría</InputLabel>
              <Select
                name="category_id"
                value={formData.category_id}
                onChange={handleInputChange}
                label="Categoría"
              >
                <MenuItem value="">
                  <em>Ninguna</em>
                </MenuItem>
                {categoriesList.map((category) => (
                  <MenuItem key={category.id} value={category.id}>
                    {category.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              margin="normal"
              required
              fullWidth
              select
              name="tipo"
              label="Tipo"
              value={formData.tipo}
              onChange={handleInputChange}
            >
              <MenuItem value="gasto">Gasto</MenuItem>
              <MenuItem value="pago">Pago</MenuItem>
              <MenuItem value="desestimar">Desestimar</MenuItem>
            </TextField>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog}>Cancelar</Button>
          <Button onClick={handleSubmit} variant="contained">
            {selectedTransaction ? 'Actualizar' : 'Crear'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Diálogo de importación CSV */}
      <Dialog open={openImportDialog} onClose={() => setOpenImportDialog(false)}>
        <DialogTitle>Importar Transacciones</DialogTitle>
        <DialogContent>
          <Box p={2}>
            <Typography variant="body2" gutterBottom>
              Selecciona un archivo CSV o Excel para importar tus transacciones.
              El archivo debe contener las siguientes columnas:
            </Typography>
            <ul>
              <li>Fecha</li>
              <li>Descripción</li>
              <li>Monto ($)</li>
              <li>Cuotas (opcional)</li>
            </ul>
            <Box mt={2}>
              <input
                accept=".csv, .xls, .xlsx"
                style={{ display: 'none' }}
                id="csv-file"
                type="file"
                onChange={handleFileSelect}
              />
              <label htmlFor="csv-file">
                <Button variant="contained" component="span">
                  Seleccionar Archivo
                </Button>
              </label>
              {selectedFile && (
                <Typography variant="body2" mt={1}>
                  Archivo seleccionado: {selectedFile.name}
                </Typography>
              )}
              {uploadProgress > 0 && (
                <Box mt={2}>
                  <LinearProgress variant="determinate" value={uploadProgress} />
                </Box>
              )}
              {/* Período del Extracto (Mes/Año) */}
              <Box mt={3} display="flex" gap={2}>
                <FormControl fullWidth>
                  <InputLabel id="import-month-label">Mes</InputLabel>
                  <Select
                    labelId="import-month-label"
                    label="Mes"
                    value={importMonth}
                    onChange={(e) => setImportMonth(Number(e.target.value))}
                  >
                    <MenuItem value={1}>enero</MenuItem>
                    <MenuItem value={2}>febrero</MenuItem>
                    <MenuItem value={3}>marzo</MenuItem>
                    <MenuItem value={4}>abril</MenuItem>
                    <MenuItem value={5}>mayo</MenuItem>
                    <MenuItem value={6}>junio</MenuItem>
                    <MenuItem value={7}>julio</MenuItem>
                    <MenuItem value={8}>agosto</MenuItem>
                    <MenuItem value={9}>septiembre</MenuItem>
                    <MenuItem value={10}>octubre</MenuItem>
                    <MenuItem value={11}>noviembre</MenuItem>
                    <MenuItem value={12}>diciembre</MenuItem>
                  </Select>
                </FormControl>
                <FormControl fullWidth>
                  <InputLabel id="import-year-label">Año</InputLabel>
                  <Select
                    labelId="import-year-label"
                    label="Año"
                    value={importYear}
                    onChange={(e) => setImportYear(Number(e.target.value))}
                  >
                    {Array.from({ length: 7 }).map((_, idx) => {
                      const y = new Date().getFullYear() + 1 - idx; // próximo año hacia atrás 6
                      return (
                        <MenuItem key={y} value={y}>{y}</MenuItem>
                      );
                    })}
                  </Select>
                </FormControl>
              </Box>

              {/* Selección de Banco */}
              <Box mt={3}>
                <FormControl fullWidth>
                  <InputLabel id="provider-label">Banco</InputLabel>
                  <Select
                    labelId="provider-label"
                    label="Banco"
                    value={provider}
                    onChange={(e) => {
                      const value = e.target.value;
                      setProvider(value);
                      localStorage.setItem('import_provider', value);
                      // Reset network when changing provider
                      if (value !== 'banco_chile') {
                        setNetwork('');
                        localStorage.removeItem('import_network');
                      }
                    }}
                  >
                    <MenuItem value=""><em>Selecciona un banco</em></MenuItem>
                    <MenuItem value="banco_chile">Banco de Chile</MenuItem>
                    <MenuItem value="banco_cencosud">Banco Cencosud</MenuItem>
                  </Select>
                </FormControl>
              </Box>
              {/* Selección de Tarjeta (solo Banco de Chile) */}
              {provider === 'banco_chile' && (
                <Box mt={2}>
                  <FormControl fullWidth>
                    <InputLabel id="network-label">Tarjeta</InputLabel>
                    <Select
                      labelId="network-label"
                      label="Tarjeta"
                      value={network}
                      onChange={(e) => {
                        const value = e.target.value;
                        setNetwork(value);
                        localStorage.setItem('import_network', value);
                      }}
                    >
                      <MenuItem value=""><em>Selecciona tarjeta</em></MenuItem>
                      <MenuItem value="visa">Visa</MenuItem>
                      <MenuItem value="mastercard">Mastercard</MenuItem>
                    </Select>
                  </FormControl>
                </Box>
              )}
            </Box>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenImportDialog(false)}>Cancelar</Button>
          <Button
            onClick={handleImport}
            variant="contained"
            color="primary"
            disabled={
              !selectedFile ||
              loading ||
              !provider ||
              (provider === 'banco_chile' && !network) ||
              !importYear || !importMonth
            }
          >
            {loading ? 'Importando...' : 'Importar'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Modal de confirmación de eliminación */}
      <Dialog open={showDeleteModal} onClose={() => setShowDeleteModal(false)}>
        <DialogTitle>Confirmar eliminación</DialogTitle>
        <DialogContent>
          {transactionToDelete ? (
            <>¿Estás seguro de que deseas eliminar la transacción de {formatAmount(transactionToDelete.monto)}?</>
          ) : (
            <>¿Estás seguro de que deseas eliminar las {selectedTransactions.length} transacciones seleccionadas?</>
          )}
        </DialogContent>
        <DialogActions>
          <Button variant="secondary" onClick={() => setShowDeleteModal(false)}>
            Cancelar
          </Button>
          <Button variant="error" onClick={handleDeleteConfirm} disabled={loading}>
            {loading ? (
              <CircularProgress size={24} />
            ) : (
              'Eliminar'
            )}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar 
        open={snackbar.open} 
        autoHideDuration={6000} 
        onClose={handleCloseSnackbar}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert onClose={handleCloseSnackbar} severity={snackbar.severity}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default Transactions;
