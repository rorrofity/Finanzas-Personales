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
  Switch,
  TextField,
  Tooltip,
  Typography,
  FormControlLabel,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Select,
} from '@mui/material';
import { Add, Delete, Edit } from '@mui/icons-material';
import axios from 'axios';
import MonthPicker from '../components/MonthPicker';
import { usePeriod } from '../contexts/PeriodContext';

const currency = (v) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(Number(v || 0));

const emptyForm = (year, month) => ({
  nombre: '',
  tipo: 'gasto',
  monto: '',
  day_of_month: 1,
  year,
  month,
  category_id: '',
  notas: '',
  repeat_monthly: true,
  active: true,
});

export default function ProjectedTransactions() {
  const { year, month } = usePeriod();
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null); // occurrence object
  const [form, setForm] = useState(emptyForm(year, month));
  const [error, setError] = useState('');
  const [filter, setFilter] = useState({ tipo: 'todos', category_id: '' });

  useEffect(() => {
    setForm(emptyForm(year, month));
    load();
  }, [year, month]);

  const load = async () => {
    try {
      setLoading(true);
      const [projRes, catRes] = await Promise.all([
        axios.get('/api/projected', { params: { year, month } }),
        axios.get('/api/categories'),
      ]);
      setItems(projRes.data || []);
      setCategories(catRes.data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const onOpenCreate = () => {
    setEditing(null);
    setForm(emptyForm(year, month));
    setOpen(true);
  };

  const onOpenEdit = (occ) => {
    setEditing(occ);
    setForm({
      nombre: occ.nombre,
      tipo: occ.tipo,
      monto: Math.abs(Number(occ.monto || 0)),
      day_of_month: new Date(occ.fecha).getDate(),
      year: occ.year,
      month: occ.month,
      category_id: occ.category_id || '',
      notas: occ.notas || '',
      repeat_monthly: occ.repeat_monthly, // read-only in edit
      active: occ.active,
    });
    setOpen(true);
  };

  const onClose = () => {
    setOpen(false);
    setError('');
  };

  const validate = () => {
    if (!form.nombre || form.nombre.length < 3 || form.nombre.length > 60) return 'Nombre entre 3 y 60 caracteres';
    if (!['ingreso', 'gasto'].includes(form.tipo)) return 'Tipo inválido';
    const monto = Number(form.monto);
    if (!monto || monto <= 0) return 'Monto debe ser mayor que 0';
    const day = Number(form.day_of_month);
    if (!day || day < 1 || day > 31) return 'Día del mes inválido';
    if (!form.year || !form.month) return 'Periodo inválido';
    if (form.notas && form.notas.length > 140) return 'Notas demasiado largas';
    return '';
  };

  const onSubmit = async () => {
    const err = validate();
    if (err) { setError(err); return; }
    try {
      setLoading(true);
      if (!editing) {
        await axios.post('/api/projected', {
          ...form,
          category_id: form.category_id || null,
        });
      } else {
        await axios.put(`/api/projected/${editing.occurrence_id}`, {
          nombre: form.nombre,
          tipo: form.tipo,
          monto: Number(form.monto),
          category_id: form.category_id || null,
          notas: form.notas || null,
          active: form.active,
        });
      }
      await load();
      onClose();
    } catch (e) {
      setError(e?.response?.data?.error || 'Error al guardar');
    } finally {
      setLoading(false);
    }
  };

  const onDeleteOccurrence = async (occ) => {
    if (!window.confirm('¿Eliminar proyección de este mes?')) return;
    await axios.delete(`/api/projected/${occ.occurrence_id}`);
    await load();
  };

  const onDeleteTemplateForward = async (occ) => {
    if (!window.confirm('¿Eliminar la plantilla y todas sus repeticiones desde este mes en adelante?')) return;
    await axios.delete(`/api/projected/template/${occ.template_id}`, { params: { fromYear: year, fromMonth: month } });
    await load();
  };

  // Filtrar items por tipo y categoría
  const filteredItems = useMemo(() => {
    return items.filter(it => {
      if (filter.tipo !== 'todos' && it.tipo !== filter.tipo) return false;
      if (filter.category_id && it.category_id !== filter.category_id) return false;
      return true;
    });
  }, [items, filter]);

  const totals = useMemo(() => {
    const acc = filteredItems.reduce((a, it) => {
      if (it.active === false) return a;
      const amt = Number(it.monto) || 0;
      if (it.tipo === 'ingreso') a.ingresos += amt;
      if (it.tipo === 'gasto') a.gastos += amt;
      return a;
    }, { ingresos: 0, gastos: 0 });
    const countIngresos = filteredItems.filter(it => it.tipo === 'ingreso' && it.active !== false).length;
    const countGastos = filteredItems.filter(it => it.tipo === 'gasto' && it.active !== false).length;
    return { ...acc, saldo: acc.ingresos - acc.gastos, countIngresos, countGastos };
  }, [filteredItems]);

  const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  const monthLabel = `${monthNames[month - 1]} ${year}`;

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h4">Transacciones Proyectadas</Typography>
        <MonthPicker />
      </Box>

      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid item xs={12} md={4}>
          <Card sx={{ bgcolor: totals.saldo >= 0 ? 'primary.main' : 'error.main', color: 'white' }}>
            <CardContent>
              <Typography variant="subtitle2" sx={{ opacity: 0.9 }}>Saldo Proyectado ({monthLabel})</Typography>
              <Typography variant="h4" fontWeight="bold">{currency(totals.saldo)}</Typography>
              <Typography variant="caption" sx={{ opacity: 0.8 }}>Ingresos - Gastos del mes</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Typography variant="subtitle2" color="success.main">Total Ingresos ({monthLabel})</Typography>
              <Typography variant="h5" color="success.main">{currency(totals.ingresos)}</Typography>
              <Typography variant="caption">{totals.countIngresos} proyecciones</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Typography variant="subtitle2" color="error.main">Total Gastos ({monthLabel})</Typography>
              <Typography variant="h5" color="error.main">{currency(totals.gastos)}</Typography>
              <Typography variant="caption">{totals.countGastos} proyecciones</Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 1 }}>
        <TextField
          select
          size="small"
          label="Tipo"
          value={filter.tipo}
          onChange={(e) => setFilter(prev => ({ ...prev, tipo: e.target.value }))}
          sx={{ minWidth: 160 }}
        >
          <MenuItem value="todos">Todos</MenuItem>
          <MenuItem value="ingreso">Ingreso</MenuItem>
          <MenuItem value="gasto">Gasto</MenuItem>
        </TextField>
        <TextField
          select
          size="small"
          label="Categoría"
          value={filter.category_id || 'todas'}
          onChange={(e) => setFilter(prev => ({ ...prev, category_id: e.target.value === 'todas' ? '' : e.target.value }))}
          sx={{ minWidth: 200 }}
        >
          <MenuItem value="todas">Todas</MenuItem>
          {categories.map(c => (<MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>))}
        </TextField>
        <Box sx={{ flex: 1 }} />
        <Button variant="contained" startIcon={<Add />} onClick={onOpenCreate}>Nueva proyección</Button>
      </Stack>

      <Paper>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Fecha</TableCell>
                <TableCell>Nombre</TableCell>
                <TableCell>Tipo</TableCell>
                <TableCell align="right">Monto</TableCell>
                <TableCell>Categoría</TableCell>
                <TableCell>Repetición</TableCell>
                <TableCell>Estado</TableCell>
                <TableCell align="right">Acciones</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {(!filteredItems || filteredItems.length === 0) && (
                <TableRow>
                  <TableCell colSpan={8} align="center">
                    No hay proyecciones para este mes.
                  </TableCell>
                </TableRow>
              )}
              {filteredItems && filteredItems.map((it) => {
                const cat = categories.find(c => c.id === it.category_id);
                return (
                <TableRow key={it.occurrence_id} hover>
                  <TableCell>{new Date(it.fecha).toLocaleDateString('es-CL')}</TableCell>
                  <TableCell>{it.nombre}</TableCell>
                  <TableCell>{it.tipo}</TableCell>
                  <TableCell align="right">{currency(it.monto)}</TableCell>
                  <TableCell>
                    <TextField
                      select
                      size="small"
                      value={it.category_id || ''}
                      onChange={async (e) => {
                        const newCatId = e.target.value || null;
                        try {
                          await axios.put(`/api/projected/${it.occurrence_id}`, { category_id: newCatId });
                          await load();
                        } catch (err) {
                          console.error(err);
                        }
                      }}
                      sx={{ minWidth: 140 }}
                      SelectProps={{ displayEmpty: true }}
                    >
                      <MenuItem value=""><em>Sin categoría</em></MenuItem>
                      {categories.map(c => (<MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>))}
                    </TextField>
                  </TableCell>
                  <TableCell>{it.repeat_monthly ? 'Sí' : 'No'}</TableCell>
                  <TableCell>
                    <Chip label={it.active ? 'Activo' : 'Inactivo'} color={it.active ? 'success' : 'default'} size="small" />
                  </TableCell>
                  <TableCell align="right">
                    <Tooltip title="Editar">
                      <IconButton size="small" onClick={() => onOpenEdit(it)}><Edit fontSize="small" /></IconButton>
                    </Tooltip>
                    <Tooltip title="Eliminar (solo este mes)">
                      <IconButton size="small" onClick={() => onDeleteOccurrence(it)}><Delete fontSize="small" /></IconButton>
                    </Tooltip>
                    <Tooltip title="Eliminar plantilla (desde este mes en adelante)">
                      <IconButton size="small" color="error" onClick={() => onDeleteTemplateForward(it)}><Delete fontSize="small" /></IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
        <DialogTitle>{editing ? 'Editar proyección (mes)' : 'Nueva proyección'}</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 0.5 }}>
            <Grid item xs={12}>
              <TextField fullWidth label="Nombre" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
            </Grid>
            <Grid item xs={6}>
              <TextField select fullWidth label="Tipo" value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })}>
                <MenuItem value="ingreso">Ingreso</MenuItem>
                <MenuItem value="gasto">Gasto</MenuItem>
              </TextField>
            </Grid>
            <Grid item xs={6}>
              <TextField fullWidth label="Monto" type="number" inputProps={{ min: 0 }} value={form.monto} onChange={(e) => setForm({ ...form, monto: e.target.value })} />
            </Grid>
            <Grid item xs={6}>
              <TextField fullWidth label="Día del mes" type="number" inputProps={{ min: 1, max: 31 }} value={form.day_of_month} disabled={!!editing} onChange={(e) => setForm({ ...form, day_of_month: Number(e.target.value) })} helperText={editing ? 'El día de la plantilla no se edita aquí' : 'Si el día no existe en el mes, se usa el último día'} />
            </Grid>
            <Grid item xs={6}>
              <TextField select fullWidth label="Categoría (opcional)" value={form.category_id || ''} onChange={(e) => setForm({ ...form, category_id: e.target.value || null })}>
                <MenuItem value="">Sin categoría</MenuItem>
                {categories.map(c => (<MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>))}
              </TextField>
            </Grid>
            <Grid item xs={12}>
              <TextField fullWidth label="Notas (opcional)" value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} inputProps={{ maxLength: 140 }} />
            </Grid>
            {!editing && (
              <Grid item xs={12}>
                <FormControlLabel control={<Switch checked={form.repeat_monthly} onChange={(e) => setForm({ ...form, repeat_monthly: e.target.checked })} />} label="Repetir todos los meses" />
              </Grid>
            )}
            <Grid item xs={12}>
              <FormControlLabel control={<Switch checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />} label="Activo" />
            </Grid>
          </Grid>
          {error && (
            <Typography color="error" sx={{ mt: 1 }}>{error}</Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Cancelar</Button>
          <Button onClick={onSubmit} variant="contained" disabled={loading}>{editing ? 'Guardar cambios' : 'Crear'}</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
