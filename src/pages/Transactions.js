import React, { useState, useEffect } from 'react';
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
} from '@mui/material';
import { 
  Delete as DeleteIcon, 
  Edit as EditIcon,
  ArrowUpward as ArrowUpwardIcon,
  ArrowDownward as ArrowDownwardIcon 
} from '@mui/icons-material';
import axios from 'axios';

const Transactions = () => {
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
      const response = await axios.get('/api/transactions', {
        params: {
          orderBy,
          orderDirection
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

    const formData = new FormData();
    formData.append('file', selectedFile);

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
    fetchTransactions();
  }, [orderBy, orderDirection]);

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
    <Box sx={{ p: 3 }}>
      <Paper>
        <Box p={2} display="flex" justifyContent="space-between" alignItems="center">
          <Typography variant="h6">Transacciones</Typography>
          <Button
            variant="contained"
            color="primary"
            onClick={() => handleOpenDialog()}
          >
            Nueva Transacción
          </Button>
          <Button
            variant="contained"
            color="primary"
            onClick={() => setOpenImportDialog(true)}
          >
            Importar CSV
          </Button>
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
                <TableCell>Acciones</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {transactions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} align="center">
                    No hay transacciones disponibles
                  </TableCell>
                </TableRow>
              ) : (
                transactions
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
                      <TableCell>{transaction.descripcion}</TableCell>
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
                        </Select>
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

        <TablePagination
          rowsPerPageOptions={[5, 10, 25]}
          component="div"
          count={transactions.length}
          rowsPerPage={rowsPerPage}
          page={page}
          onPageChange={handleChangePage}
          onRowsPerPageChange={handleChangeRowsPerPage}
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
            </Box>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenImportDialog(false)}>Cancelar</Button>
          <Button
            onClick={handleImport}
            variant="contained"
            color="primary"
            disabled={!selectedFile || loading}
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
