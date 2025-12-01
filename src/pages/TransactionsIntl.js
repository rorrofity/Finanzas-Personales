import React, { useEffect, useState } from 'react';
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Snackbar,
  Alert,
  IconButton,
  Chip,
  TablePagination,
  Switch,
  FormControlLabel
} from '@mui/material';
import { Edit as EditIcon, Delete as DeleteIcon } from '@mui/icons-material';
import MonthPicker from '../components/MonthPicker';
import SyncButton from '../components/SyncButton';
import { usePeriod } from '../contexts/PeriodContext';
import axios from 'axios';

const TransactionsIntl = () => {
  const { year, month } = usePeriod();
  const periodKey = `${year}-${String(month).padStart(2,'0')}`;
  const [cardFilter, setCardFilter] = useState(()=>{
    try { return sessionStorage.getItem(`tcFilterCard::transactionsIntl::${periodKey}`) || 'ALL'; } catch { return 'ALL'; }
  });
  const [rows, setRows] = useState([]);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [hideDismissed, setHideDismissed] = useState(false);
  const [openImport, setOpenImport] = useState(false);
  const [brand, setBrand] = useState('visa');
  const [rate, setRate] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [categoriesList, setCategoriesList] = useState([]);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });
  const [selectedIds, setSelectedIds] = useState([]);
  const [openEdit, setOpenEdit] = useState(false);
  const [editing, setEditing] = useState(null);
  const [formData, setFormData] = useState({ fecha: '', descripcion: '', amount_usd: '', exchange_rate: '', tipo: 'gasto', category_id: '' });

  const fetchRows = async () => {
    try {
      const res = await axios.get('/api/intl-unbilled', { params: { year, month } });
      setRows(res.data || []);
    } catch (e) {
      console.warn('intl list error', e?.response?.status || e?.message);
      setRows([]);
    }
  };

  const fetchCategories = async () => {
    try { const r = await axios.get('/api/categories'); setCategoriesList(r.data || []); } catch {}
  };

  useEffect(() => { 
    fetchRows();
    try {
      const saved = sessionStorage.getItem(`tcFilterCard::transactionsIntl::${periodKey}`);
      if (saved) setCardFilter(saved);
    } catch {}
    setPage(0);
  }, [year, month]);
  useEffect(() => { fetchCategories(); }, []);

  const onFileChange = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const allowed = ['.csv', '.xls', '.xlsx'];
    const ok = allowed.some(ext => f.name.toLowerCase().endsWith(ext));
    if (!ok) return alert('Formato no soportado. Usa .csv, .xls o .xlsx');
    setSelectedFile(f);
  };

  const onImport = async () => {
    const r = Number(rate);
    if (!r || r <= 0) return alert('Ingresa un tipo de cambio válido (> 0)');
    if (!selectedFile) return alert('Selecciona un archivo CSV/Excel');
    const fd = new FormData();
    fd.append('file', selectedFile);
    fd.append('brand', brand);
    fd.append('exchange_rate', String(r));
    fd.append('periodYear', String(year));
    fd.append('periodMonth', String(month));
    try {
      setUploadProgress(0);
      const response = await axios.post('/api/intl-unbilled/import-file', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (ev) => {
          if (ev.total) setUploadProgress(Math.round((ev.loaded * 100) / ev.total));
        }
      });
      setOpenImport(false);
      setSelectedFile(null);
      setRate('');
      setUploadProgress(0);
      await fetchRows();
      
      // Mostrar feedback del resultado
      const { inserted = 0, skipped = 0 } = response.data || {};
      const message = inserted > 0 
        ? `✅ ${inserted} transacción(es) importada(s)${skipped > 0 ? `, ${skipped} omitida(s) (duplicadas)` : ''}`
        : skipped > 0 
          ? `⏭️ ${skipped} transacción(es) omitida(s) (ya existían)`
          : 'No se encontraron transacciones para importar';
      setSnackbar({ open: true, message, severity: inserted > 0 ? 'success' : 'info' });
    } catch (e) {
      setSnackbar({ open: true, message: e?.response?.data?.error || 'Error al importar', severity: 'error' });
    }
  };

  const formatCurrency = (n) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(Number(n||0));

  const toggleSelect = (id) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };
  const toggleSelectAll = (checked) => {
    if (checked) setSelectedIds(rows.map(r => r.id)); else setSelectedIds([]);
  };

  const handleOpenEdit = (row) => {
    setEditing(row);
    setFormData({
      fecha: row.fecha?.split('T')[0] || row.fecha,
      descripcion: row.descripcion,
      amount_usd: String(row.amount_usd),
      exchange_rate: String(row.exchange_rate),
      tipo: row.tipo,
      category_id: row.category_id || ''
    });
    setOpenEdit(true);
  };
  const handleCloseEdit = () => { setOpenEdit(false); setEditing(null); };

  const handleEditChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const submitEdit = async (e) => {
    e?.preventDefault?.();
    try {
      await axios.put(`/api/intl-unbilled/${editing.id}`, {
        fecha: formData.fecha,
        descripcion: formData.descripcion,
        amount_usd: Number(formData.amount_usd),
        exchange_rate: Number(formData.exchange_rate),
        tipo: formData.tipo,
        category_id: formData.category_id || null
      });
      setSnackbar({ open: true, message: 'Transacción actualizada', severity: 'success' });
      handleCloseEdit();
      await fetchRows();
      if (typeof window.refreshDashboardData === 'function') window.refreshDashboardData();
    } catch (err) {
      setSnackbar({ open: true, message: err?.response?.data?.error || 'Error al actualizar', severity: 'error' });
    }
  };

  const changeCategoryInline = async (rowId, newCat) => {
    try {
      await axios.put(`/api/intl-unbilled/${rowId}`, { category_id: newCat || null });
      setRows(prev => prev.map(r => r.id === rowId ? { ...r, category_id: newCat || null } : r));
      if (typeof window.refreshDashboardData === 'function') window.refreshDashboardData();
    } catch {}
  };

  const changeTypeInline = async (rowId, newType) => {
    try {
      await axios.put(`/api/intl-unbilled/${rowId}`, { tipo: newType });
      setRows(prev => prev.map(r => r.id === rowId ? { ...r, tipo: newType } : r));
      if (typeof window.refreshDashboardData === 'function') window.refreshDashboardData();
    } catch {}
  };

  const handleDelete = async (rowId) => {
    if (!window.confirm('¿Eliminar esta transacción internacional?')) return;
    try {
      await axios.delete(`/api/intl-unbilled/${rowId}`);
      setSnackbar({ open: true, message: 'Transacción eliminada', severity: 'success' });
      await fetchRows();
      if (typeof window.refreshDashboardData === 'function') window.refreshDashboardData();
    } catch (err) {
      setSnackbar({ open: true, message: err?.response?.data?.error || 'Error al eliminar', severity: 'error' });
    }
  };

  const handleBulkDelete = async () => {
    if (!selectedIds.length) return;
    if (!window.confirm(`¿Eliminar ${selectedIds.length} transacción(es) seleccionadas?`)) return;
    try {
      // No hay endpoint bulk; iterar
      for (const id of selectedIds) {
        await axios.delete(`/api/intl-unbilled/${id}`);
      }
      setSelectedIds([]);
      setSnackbar({ open: true, message: 'Transacciones eliminadas', severity: 'success' });
      await fetchRows();
      if (typeof window.refreshDashboardData === 'function') window.refreshDashboardData();
    } catch (err) {
      setSnackbar({ open: true, message: err?.response?.data?.error || 'Error al eliminar selección', severity: 'error' });
    }
  };

  // Filtrado por tarjeta + toggle desestimados
  const filteredRows = (hideDismissed ? rows.filter(r => r.tipo !== 'desestimar') : rows).filter(r => {
    if (cardFilter === 'ALL') return true;
    const b = String(r.brand || '').toLowerCase();
    if (cardFilter === 'VISA') return b === 'visa';
    if (cardFilter === 'MASTERCARD') return b === 'mastercard';
    return true;
  });
  const titleBrandLabel = cardFilter === 'ALL' ? 'Todas' : (cardFilter === 'VISA' ? 'Visa' : 'Mastercard');

  const handleChangePage = (event, newPage) => setPage(newPage);
  const handleChangeRowsPerPage = (event) => { setRowsPerPage(parseInt(event.target.value, 10)); setPage(0); };

  return (
    <Box>
      <MonthPicker />
      <Typography variant="h5" sx={{ mt: 2, mb: 2, fontWeight: 700 }}>Transacciones No Facturadas Internacionales (TC) • {titleBrandLabel} ({filteredRows.length})</Typography>
      <Stack direction="row" spacing={1} sx={{ mb: 2, flexWrap: 'wrap' }}>
        <SyncButton 
          onSyncComplete={() => {
            fetchRows();
          }}
          variant="outlined"
          size="small"
        />
        <Button variant="contained" onClick={() => setOpenImport(true)}>Importar archivo</Button>
        <FormControlLabel
          control={<Switch checked={hideDismissed} onChange={(e)=>{ setHideDismissed(e.target.checked); setPage(0); }} />}
          label="Ocultar desestimados en tabla"
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
            try { sessionStorage.setItem(`tcFilterCard::transactionsIntl::${periodKey}`, v); } catch {}
          }}
          sx={{ minWidth: 180 }}
        >
          <MenuItem value="ALL">Todas</MenuItem>
          <MenuItem value="VISA">Visa</MenuItem>
          <MenuItem value="MASTERCARD">Mastercard</MenuItem>
        </TextField>
        {selectedIds.length > 0 && (
          <Button color="error" variant="contained" onClick={handleBulkDelete}>
            Eliminar seleccionadas ({selectedIds.length})
          </Button>
        )}
      </Stack>

      <Dialog open={openImport} onClose={() => setOpenImport(false)} fullWidth maxWidth="sm">
        <DialogTitle>Importar movimientos internacionales</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <FormControl fullWidth>
              <InputLabel>Tarjeta</InputLabel>
              <Select value={brand} label="Tarjeta" onChange={(e) => setBrand(e.target.value)}>
                <MenuItem value="visa">Visa Internacional</MenuItem>
                <MenuItem value="mastercard">Mastercard Internacional</MenuItem>
              </Select>
            </FormControl>
            <TextField
              label="Valor CLP por USD"
              type="number"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              inputProps={{ min: 1, step: '0.01' }}
              required
              fullWidth
            />
            <Stack direction="row" alignItems="center" spacing={2}>
              <Button variant="outlined" component="label">
                Seleccionar archivo
                <input type="file" accept=".csv,.xls,.xlsx" hidden onChange={onFileChange} />
              </Button>
              <Typography variant="body2" sx={{ opacity: 0.7 }}>{selectedFile ? selectedFile.name : 'Sin archivo seleccionado'}</Typography>
            </Stack>
            <Typography variant="caption" sx={{ opacity: 0.8 }}>
              Se usará el período seleccionado arriba (Mes/Año) para registrar estas transacciones.
            </Typography>
            {uploadProgress > 0 && (
              <Box mt={2}>
                <Typography variant="caption">Subiendo: {uploadProgress}%</Typography>
              </Box>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenImport(false)}>Cancelar</Button>
          <Button variant="contained" onClick={onImport}>Importar</Button>
        </DialogActions>
      </Dialog>

      <Paper>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>
                  <input type="checkbox" checked={selectedIds.length === rows.length && rows.length>0} onChange={(e)=>toggleSelectAll(e.target.checked)} />
                </TableCell>
                <TableCell>Fecha</TableCell>
                <TableCell>Descripción</TableCell>
                <TableCell align="right">Monto USD</TableCell>
                <TableCell align="right">Monto CLP</TableCell>
                <TableCell>Tipo</TableCell>
                <TableCell>Categoría</TableCell>
                <TableCell>Tarjeta</TableCell>
                <TableCell>Acciones</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredRows.length ? filteredRows
                .slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)
                .map(r => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <input type="checkbox" checked={selectedIds.includes(r.id)} onChange={()=>toggleSelect(r.id)} />
                    </TableCell>
                    <TableCell>{new Date(r.fecha).toLocaleDateString('es-CL')}</TableCell>
                    <TableCell>
                      {r.descripcion}
                      {r.tipo === 'desestimar' && (<Chip size="small" label="Desestimado" color="warning" sx={{ ml: 1 }} />)}
                    </TableCell>
                    <TableCell align="right">{Number(r.amount_usd).toFixed(2)}</TableCell>
                    <TableCell align="right">{formatCurrency(r.amount_clp)}</TableCell>
                    <TableCell>
                      <Select size="small" value={r.tipo} onChange={(e)=>changeTypeInline(r.id, e.target.value)} sx={{ minWidth: 110 }}>
                        <MenuItem value="gasto">Gasto</MenuItem>
                        <MenuItem value="pago">Pago</MenuItem>
                        <MenuItem value="desestimar">Desestimar</MenuItem>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Select size="small" value={r.category_id || ''} displayEmpty onChange={(e)=>changeCategoryInline(r.id, e.target.value)} sx={{ minWidth: 140 }}>
                        <MenuItem value=""><em>Sin categoría</em></MenuItem>
                        {categoriesList.map(c => (
                          <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>
                        ))}
                      </Select>
                    </TableCell>
                    <TableCell>{String(r.brand).toUpperCase()}</TableCell>
                    <TableCell>
                      <Tooltip title="Editar"><IconButton size="small" onClick={()=>handleOpenEdit(r)}><EditIcon/></IconButton></Tooltip>
                      <Tooltip title="Eliminar"><IconButton size="small" onClick={()=>handleDelete(r.id)}><DeleteIcon/></IconButton></Tooltip>
                    </TableCell>
                  </TableRow>
                )) : (
                <TableRow>
                  <TableCell colSpan={9} align="center">No tienes transacciones internacionales no facturadas en este mes. Importa un archivo para comenzar.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      <TablePagination
        rowsPerPageOptions={[5, 10, 25]}
        component="div"
        count={filteredRows.length}
        rowsPerPage={rowsPerPage}
        page={page}
        onPageChange={handleChangePage}
        onRowsPerPageChange={handleChangeRowsPerPage}
      />

      <Box mt={1} textAlign="right">
        <Typography variant="caption">Mostrando {Math.min(filteredRows.length, page*rowsPerPage + (filteredRows.slice(page*rowsPerPage, page*rowsPerPage+rowsPerPage).length))} de {filteredRows.length} transacciones ({titleBrandLabel})</Typography>
      </Box>

      {/* Edit dialog */}
      <Dialog open={openEdit} onClose={handleCloseEdit} fullWidth maxWidth="sm">
        <DialogTitle>Editar transacción internacional</DialogTitle>
        <DialogContent>
          <Box component="form" onSubmit={submitEdit} sx={{ mt: 1 }}>
            <TextField margin="normal" fullWidth required type="date" name="fecha" label="Fecha" InputLabelProps={{ shrink: true }} value={formData.fecha} onChange={handleEditChange} />
            <TextField margin="normal" fullWidth required name="descripcion" label="Descripción" value={formData.descripcion} onChange={handleEditChange} />
            <Stack direction={{ xs:'column', sm:'row' }} spacing={2} sx={{ mt: 1 }}>
              <TextField fullWidth type="number" name="amount_usd" label="Monto USD" value={formData.amount_usd} onChange={handleEditChange} />
              <TextField fullWidth type="number" name="exchange_rate" label="Tipo de cambio" value={formData.exchange_rate} onChange={handleEditChange} />
            </Stack>
            <Stack direction={{ xs:'column', sm:'row' }} spacing={2} sx={{ mt: 2 }}>
              <FormControl fullWidth>
                <InputLabel>Tipo</InputLabel>
                <Select name="tipo" label="Tipo" value={formData.tipo} onChange={handleEditChange}>
                  <MenuItem value="gasto">Gasto</MenuItem>
                  <MenuItem value="pago">Pago</MenuItem>
                  <MenuItem value="desestimar">Desestimar</MenuItem>
                </Select>
              </FormControl>
              <FormControl fullWidth>
                <InputLabel>Categoría</InputLabel>
                <Select name="category_id" label="Categoría" value={formData.category_id} onChange={handleEditChange} displayEmpty>
                  <MenuItem value=""><em>Sin categoría</em></MenuItem>
                  {categoriesList.map(c => (<MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>))}
                </Select>
              </FormControl>
            </Stack>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseEdit}>Cancelar</Button>
          <Button variant="contained" onClick={submitEdit}>Guardar</Button>
        </DialogActions>
      </Dialog>

      <Snackbar 
        open={snackbar.open} 
        autoHideDuration={6000} 
        onClose={()=>setSnackbar(prev=>({ ...prev, open:false }))}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      >
        <Alert onClose={()=>setSnackbar(prev=>({ ...prev, open:false }))} severity={snackbar.severity} sx={{ width: '100%' }}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default TransactionsIntl;
