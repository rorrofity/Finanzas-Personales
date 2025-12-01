import React, { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Button,
  Card,
  CardContent,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Grid,
  IconButton,
  MenuItem,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
  Select,
  FormControl,
  InputLabel,
  Snackbar,
  Alert,
  Pagination,
  LinearProgress,
} from '@mui/material';
import { Add, Edit, Delete, FileUpload, CheckCircle, Close } from '@mui/icons-material';
import MonthPicker from '../components/MonthPicker';
import { usePeriod } from '../contexts/PeriodContext';
import axios from 'axios';

const currency = (v) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(Number(v || 0));

export default function Checking() {
  const { year, month } = usePeriod();
  const [balance, setBalance] = useState(0);
  const [globalBalance, setGlobalBalance] = useState(0); // Saldo histórico calculado
  const [summary, setSummary] = useState({ abonos: 0, cargos: 0, neto: 0, saldo_actual: 0, initial_balance: 0 });
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const pageSize = 10;
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });

  const [openBalance, setOpenBalance] = useState(false);
  const [balanceInput, setBalanceInput] = useState('0');

  const [openMove, setOpenMove] = useState(false);
  const [moveForm, setMoveForm] = useState({ id: null, fecha: '', descripcion: '', tipo: 'abono', amount: '', category_id: '', notas: '' });
  const [filter, setFilter] = useState({ tipo: 'todos', category_id: '' });
  
  // Estados para importación
  const [openImport, setOpenImport] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState({ open: false, data: null });

  const load = async () => {
    try {
      setLoading(true);
      const [bRes, sRes, gRes, lRes, cRes] = await Promise.all([
        axios.get('/api/checking/balance', { params: { year, month } }),
        axios.get('/api/checking/summary', { params: { year, month } }),
        axios.get('/api/checking/global-balance'),
        axios.get('/api/checking', { params: { year, month } }),
        axios.get('/api/categories'),
      ]);
      setBalance(Number(bRes.data?.initial_balance || 0));
      setSummary(sRes.data || { abonos: 0, cargos: 0, neto: 0, saldo_actual: 0, initial_balance: 0 });
      setGlobalBalance(Number(gRes.data?.saldo_actual || 0));
      setRows(Array.isArray(lRes.data) ? lRes.data : (lRes.data?.items || []));
      setTotal(Array.isArray(lRes.data) ? lRes.data.length : (lRes.data?.total || 0));
      setCategories(cRes.data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [year, month, page]);

  const filteredRows = useMemo(() => {
    return rows.filter(r => {
      if (filter.tipo !== 'todos' && r.tipo !== filter.tipo) return false;
      if (filter.category_id && r.category_id !== filter.category_id) return false;
      return true;
    });
  }, [rows, filter]);

  const openEditBalance = () => { setBalanceInput(String(balance)); setOpenBalance(true); };
  const saveBalance = async () => {
    try {
      const amount = Number(balanceInput);
      await axios.put('/api/checking/balance', { year, month, amount });
      setOpenBalance(false);
      setSnackbar({ open: true, message: 'Saldo inicial guardado', severity: 'success' });
      await load();
    } catch (e) {
      setSnackbar({ open: true, message: e?.response?.data?.error || 'Error al guardar saldo', severity: 'error' });
    }
  };

  const openNewMove = () => {
    // Fecha hoy en America/Santiago
    const now = new Date();
    const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit' });
    const parts = fmt.formatToParts(now).reduce((acc, p) => { acc[p.type] = p.value; return acc; }, {});
    const today = `${parts.year}-${parts.month}-${parts.day}`;
    setMoveForm({ id: null, fecha: today, descripcion: '', tipo: 'cargo', amount: '', category_id: '', notas: '' });
    setOpenMove(true);
  };
  const openEditMove = (row) => {
    setMoveForm({ id: row.id, fecha: row.fecha?.split('T')[0] || row.fecha, descripcion: row.descripcion, tipo: row.tipo, amount: String(row.amount), category_id: row.category_id || '', notas: row.notas || '' });
    setOpenMove(true);
  };
  const closeMove = () => setOpenMove(false);
  const saveMove = async () => {
    try {
      const payload = { year, month, ...moveForm, amount: Number(moveForm.amount), category_id: moveForm.category_id || null };
      if (moveForm.id) {
        await axios.put(`/api/checking/${moveForm.id}`, payload);
      } else {
        await axios.post('/api/checking', payload);
      }
      closeMove();
      setSnackbar({ open: true, message: 'Movimiento guardado', severity: 'success' });
      await load();
    } catch (e) {
      setSnackbar({ open: true, message: e?.response?.data?.error || 'Error al guardar movimiento', severity: 'error' });
    }
  };
  const deleteMove = async (row) => {
    if (!window.confirm('¿Eliminar movimiento?')) return;
    try {
      await axios.delete(`/api/checking/${row.id}`);
      setSnackbar({ open: true, message: 'Movimiento eliminado', severity: 'success' });
      await load();
    } catch (e) {
      setSnackbar({ open: true, message: 'Error al eliminar', severity: 'error' });
    }
  };

  // Funciones de importación
  const onFileChange = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const allowed = ['.xls', '.xlsx'];
    const ok = allowed.some(ext => f.name.toLowerCase().endsWith(ext));
    if (!ok) {
      setSnackbar({ open: true, message: 'Formato no soportado. Usa .xls o .xlsx', severity: 'error' });
      return;
    }
    setSelectedFile(f);
  };

  const onImport = async () => {
    if (!selectedFile) return;
    
    const fd = new FormData();
    fd.append('file', selectedFile);
    
    try {
      setImporting(true);
      const response = await axios.post('/api/checking/import-file', fd, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      
      setOpenImport(false);
      setSelectedFile(null);
      await load();
      
      const { inserted = 0, skipped = 0 } = response.data || {};
      const message = inserted > 0 
        ? 'Transacciones importadas correctamente'
        : skipped > 0 
          ? 'No se encontraron transacciones nuevas'
          : 'No se encontraron transacciones para importar';
      
      setImportResult({ 
        open: true, 
        data: { inserted, skipped, message, isError: false }
      });
    } catch (e) {
      setImportResult({ 
        open: true, 
        data: { 
          inserted: 0, 
          skipped: 0, 
          message: e?.response?.data?.error || 'Error al importar archivo', 
          isError: true 
        }
      });
    } finally {
      setImporting(false);
    }
  };

  return (
    <Box>
      <MonthPicker />
      <Typography variant="h4" sx={{ mb: 2 }}>Cuenta Corriente</Typography>

      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid item xs={12} md={3}>
          <Card sx={{ bgcolor: 'primary.main', color: 'white' }}>
            <CardContent>
              <Typography variant="subtitle2" sx={{ opacity: 0.9 }}>Saldo Actual (Global)</Typography>
              <Typography variant="h4" fontWeight="bold">{currency(globalBalance)}</Typography>
              <Typography variant="caption" sx={{ opacity: 0.8 }}>Saldo histórico calculado</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Typography variant="subtitle2" color="success.main">Abonos del mes</Typography>
              <Typography variant="h5" color="success.main">{currency(summary.abonos)}</Typography>
              <Typography variant="caption">Sumatoria de ingresos del mes</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Typography variant="subtitle2" color="error.main">Cargos del mes</Typography>
              <Typography variant="h5" color="error.main">{currency(summary.cargos)}</Typography>
              <Typography variant="caption">Sumatoria de gastos del mes</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Typography variant="subtitle2">Saldo inicial del mes</Typography>
              <Typography variant="h5">{currency(summary.initial_balance)}</Typography>
              <Button variant="outlined" size="small" startIcon={<Edit />} sx={{ mt: 1 }} onClick={openEditBalance}>Editar</Button>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Stack direction={{ xs:'column', sm:'row' }} spacing={2} sx={{ mb: 1 }}>
        <TextField
          select
          size="small"
          label="Tipo"
          value={filter.tipo}
          onChange={(e)=>setFilter(prev=>({ ...prev, tipo: e.target.value }))}
          sx={{ minWidth: 160 }}
        >
          <MenuItem value="todos">Todos</MenuItem>
          <MenuItem value="abono">Abono</MenuItem>
          <MenuItem value="cargo">Cargo</MenuItem>
        </TextField>
        <TextField
          select
          size="small"
          label="Categoría"
          value={filter.category_id}
          onChange={(e)=>setFilter(prev=>({ ...prev, category_id: e.target.value }))}
          sx={{ minWidth: 200 }}
          SelectProps={{
            displayEmpty: true,
            renderValue: (selected) => {
              if (!selected) return <em>Todas</em>;
              const cat = categories.find(c => String(c.id) === String(selected));
              return cat ? cat.name : <em>Todas</em>;
            }
          }}
        >
          <MenuItem value=""><em>Todas</em></MenuItem>
          {categories.map(c => (<MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>))}
        </TextField>
        <Box sx={{ flex: 1 }} />
        <Button variant="outlined" startIcon={<FileUpload />} onClick={() => setOpenImport(true)}>Importar cartola</Button>
        <Button variant="contained" startIcon={<Add />} onClick={openNewMove}>Nuevo movimiento</Button>
      </Stack>

      <Paper>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Fecha</TableCell>
                <TableCell>Descripción</TableCell>
                <TableCell>Tipo</TableCell>
                <TableCell align="right">Monto</TableCell>
                <TableCell>Categoría</TableCell>
                <TableCell>Notas</TableCell>
                <TableCell align="right">Acciones</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredRows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} align="center">No hay movimientos este mes.</TableCell>
                </TableRow>
              )}
              {filteredRows.map(r => (
                <TableRow key={r.id} hover>
                  <TableCell>{new Date(r.fecha).toLocaleDateString('es-CL')}</TableCell>
                  <TableCell>{r.descripcion}</TableCell>
                  <TableCell sx={{ textTransform:'capitalize' }}>{r.tipo}</TableCell>
                  <TableCell align="right">{currency(r.amount)}</TableCell>
                  <TableCell>{r.category_id || '-'}</TableCell>
                  <TableCell>{r.notas || ''}</TableCell>
                  <TableCell align="right">
                    <Tooltip title="Editar">
                      <IconButton size="small" onClick={()=>openEditMove(r)}><Edit fontSize="small" /></IconButton>
                    </Tooltip>
                    <Tooltip title="Eliminar">
                      <IconButton size="small" onClick={()=>deleteMove(r)}><Delete fontSize="small" /></IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      {/* Pagination */}
      <Box mt={2} display="flex" justifyContent="flex-end">
        <Pagination
          count={Math.max(1, Math.ceil(total / pageSize))}
          page={page + 1}
          onChange={(_, p) => setPage(p - 1)}
          color="primary"
          size="small"
          showFirstButton
          showLastButton
        />
      </Box>

      {/* Editar saldo inicial */}
      <Dialog open={openBalance} onClose={()=>setOpenBalance(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Editar saldo inicial</DialogTitle>
        <DialogContent>
          <TextField fullWidth label="Monto" type="number" inputProps={{ min: 0 }} value={balanceInput} onChange={(e)=>setBalanceInput(e.target.value)} sx={{ mt: 1 }} />
        </DialogContent>
        <DialogActions>
          <Button onClick={()=>setOpenBalance(false)}>Cancelar</Button>
          <Button variant="contained" onClick={saveBalance}>Guardar</Button>
        </DialogActions>
      </Dialog>

      {/* Crear/editar movimiento */}
      <Dialog open={openMove} onClose={closeMove} fullWidth maxWidth="sm">
        <DialogTitle>{moveForm.id ? 'Editar movimiento' : 'Nuevo movimiento'}</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 0.5 }}>
            <Grid item xs={12} sm={4}>
              <TextField fullWidth label="Fecha" type="date" InputLabelProps={{ shrink: true }} value={moveForm.fecha} onChange={(e)=>setMoveForm(prev=>({ ...prev, fecha: e.target.value }))} />
            </Grid>
            <Grid item xs={12} sm={8}>
              <TextField fullWidth label="Descripción" value={moveForm.descripcion} onChange={(e)=>setMoveForm(prev=>({ ...prev, descripcion: e.target.value }))} />
            </Grid>
            <Grid item xs={6} sm={3}>
              <FormControl fullWidth>
                <InputLabel>Tipo</InputLabel>
                <Select label="Tipo" value={moveForm.tipo} onChange={(e)=>setMoveForm(prev=>({ ...prev, tipo: e.target.value }))}>
                  <MenuItem value="abono">Abono</MenuItem>
                  <MenuItem value="cargo">Cargo</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={6} sm={3}>
              <TextField fullWidth label="Monto" type="number" inputProps={{ min: 0 }} value={moveForm.amount} onChange={(e)=>setMoveForm(prev=>({ ...prev, amount: e.target.value }))} />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                select
                label="Categoría"
                value={moveForm.category_id}
                onChange={(e)=>setMoveForm(prev=>({ ...prev, category_id: e.target.value }))}
                SelectProps={{
                  displayEmpty: true,
                  renderValue: (selected) => {
                    if (!selected) return <em>Sin categoría</em>;
                    const cat = categories.find(c => String(c.id) === String(selected));
                    return cat ? cat.name : <em>Sin categoría</em>;
                  }
                }}
              >
                <MenuItem value=""><em>Sin categoría</em></MenuItem>
                {categories.map(c => (<MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>))}
              </TextField>
            </Grid>
            <Grid item xs={12}>
              <TextField fullWidth label="Notas (opcional)" inputProps={{ maxLength: 140 }} value={moveForm.notas} onChange={(e)=>setMoveForm(prev=>({ ...prev, notas: e.target.value }))} />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeMove}>Cancelar</Button>
          <Button variant="contained" onClick={saveMove}>Guardar</Button>
        </DialogActions>
      </Dialog>

{/* Diálogo importar cartola */}
      <Dialog open={openImport} onClose={() => { setOpenImport(false); setSelectedFile(null); }} maxWidth="sm" fullWidth>
        <DialogTitle>Importar Cartola Banco de Chile</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            Selecciona el archivo Excel (.xls o .xlsx) descargado desde tu cuenta corriente del Banco de Chile.
            Las transacciones duplicadas serán omitidas automáticamente.
          </DialogContentText>
          <Button
            variant="outlined"
            component="label"
            fullWidth
            sx={{ mb: 2 }}
          >
            {selectedFile ? selectedFile.name : 'Seleccionar archivo'}
            <input type="file" hidden accept=".xls,.xlsx" onChange={onFileChange} />
          </Button>
          {importing && <LinearProgress sx={{ mb: 2 }} />}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setOpenImport(false); setSelectedFile(null); }}>Cancelar</Button>
          <Button 
            variant="contained" 
            onClick={onImport} 
            disabled={!selectedFile || importing}
          >
            {importing ? 'Importando...' : 'Importar'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Diálogo resultado de importación */}
      <Dialog
        open={importResult.open}
        onClose={() => setImportResult({ open: false, data: null })}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          <Box display="flex" alignItems="center" justifyContent="space-between">
            <Box display="flex" alignItems="center" gap={1}>
              {importResult.data?.isError ? (
                <>
                  <FileUpload color="error" />
                  <Typography variant="h6">Error en Importación</Typography>
                </>
              ) : importResult.data?.inserted > 0 ? (
                <>
                  <CheckCircle color="success" />
                  <Typography variant="h6">Importación Exitosa</Typography>
                </>
              ) : (
                <>
                  <FileUpload color="primary" />
                  <Typography variant="h6">Importación Completada</Typography>
                </>
              )}
            </Box>
            <IconButton
              edge="end"
              color="inherit"
              onClick={() => setImportResult({ open: false, data: null })}
              aria-label="close"
            >
              <Close />
            </IconButton>
          </Box>
        </DialogTitle>
        
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            {importResult.data?.message}
          </DialogContentText>
          
          {importResult.data && !importResult.data.isError && (
            <Box>
              <Typography variant="body2" sx={{ mb: 1 }}>
                ✅ <strong>{importResult.data.inserted}</strong> transacciones nuevas importadas
              </Typography>
              <Typography variant="body2" sx={{ mb: 1 }}>
                ⏭️ <strong>{importResult.data.skipped}</strong> transacciones duplicadas (omitidas)
              </Typography>
            </Box>
          )}
          
          <Button
            onClick={() => setImportResult({ open: false, data: null })}
            variant="contained"
            fullWidth
            sx={{ mt: 3 }}
          >
            Cerrar
          </Button>
        </DialogContent>
      </Dialog>

      <Snackbar open={snackbar.open} autoHideDuration={3000} onClose={()=>setSnackbar(prev=>({ ...prev, open:false }))}>
        <Alert onClose={()=>setSnackbar(prev=>({ ...prev, open:false }))} severity={snackbar.severity} sx={{ width: '100%' }}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
