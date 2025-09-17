import React, { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Button,
  Card,
  CardContent,
  Dialog,
  DialogActions,
  DialogContent,
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
} from '@mui/material';
import { Add, Edit, Delete } from '@mui/icons-material';
// This page is fixed to the current month; no MonthPicker needed
import axios from 'axios';

const currency = (v) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(Number(v || 0));

export default function Checking() {
  // Derive current year/month in America/Santiago
  const now = new Date();
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago', year: 'numeric', month: '2-digit' });
  const parts = fmt.formatToParts(now).reduce((acc, p) => { acc[p.type] = p.value; return acc; }, {});
  const year = Number(parts.year);
  const month = Number(parts.month);
  const [balance, setBalance] = useState(0);
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

  const load = async () => {
    try {
      setLoading(true);
      const [bRes, sRes, lRes, cRes] = await Promise.all([
        axios.get('/api/checking/balance', { params: { year, month } }),
        axios.get('/api/checking/summary', { params: { year, month } }),
        axios.get('/api/checking', { params: { page, pageSize } }),
        axios.get('/api/categories'),
      ]);
      setBalance(Number(bRes.data?.initial_balance || 0));
      setSummary(sRes.data || { abonos: 0, cargos: 0, neto: 0, saldo_actual: 0, initial_balance: 0 });
      if (Array.isArray(lRes.data)) {
        // Compat: monthly mode
        setRows(lRes.data);
        setTotal(lRes.data.length);
      } else {
        setRows(lRes.data?.items || []);
        setTotal(lRes.data?.total || 0);
      }
      setCategories(cRes.data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [page]);

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

  return (
    <Box>
      <Typography variant="h4" sx={{ mb: 2 }}>Cuenta Corriente</Typography>

      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Typography variant="subtitle2" color="text.secondary">Saldo inicial</Typography>
              <Typography variant="h5">{currency(summary.initial_balance)}</Typography>
              <Button variant="outlined" size="small" startIcon={<Edit />} sx={{ mt: 1 }} onClick={openEditBalance}>Editar saldo inicial</Button>
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
              <Typography variant="subtitle2">Saldo actual</Typography>
              <Typography variant="h5">{currency(summary.saldo_actual)}</Typography>
              <Typography variant="caption">Saldo inicial + Saldo neto del mes</Typography>
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

      <Snackbar open={snackbar.open} autoHideDuration={3000} onClose={()=>setSnackbar(prev=>({ ...prev, open:false }))}>
        <Alert onClose={()=>setSnackbar(prev=>({ ...prev, open:false }))} severity={snackbar.severity} sx={{ width: '100%' }}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
