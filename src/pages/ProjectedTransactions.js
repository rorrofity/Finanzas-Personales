import React, { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  IconButton,
  MenuItem,
  Paper,
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
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null); // occurrence object
  const [form, setForm] = useState(emptyForm(year, month));
  const [error, setError] = useState('');

  useEffect(() => {
    setForm(emptyForm(year, month));
    load();
  }, [year, month]);

  const load = async () => {
    try {
      setLoading(true);
      const res = await axios.get('/api/projected', { params: { year, month } });
      setItems(res.data || []);
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

  const totals = useMemo(() => {
    const acc = items.reduce((a, it) => {
      if (it.active === false) return a;
      const amt = Number(it.monto) || 0;
      if (it.tipo === 'ingreso') a.ingresos += amt;
      if (it.tipo === 'gasto') a.gastos += amt;
      return a;
    }, { ingresos: 0, gastos: 0 });
    return { ...acc, saldo: acc.ingresos - acc.gastos };
  }, [items]);

  return (
    <Box>
      <MonthPicker />
      <Typography variant="h4" sx={{ mb: 2 }}>Transacciones Proyectadas</Typography>

      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid item>
          <Button variant="contained" startIcon={<Add />} onClick={onOpenCreate}>Nueva proyección</Button>
        </Grid>
        <Grid item>
          <Chip label={`Ingresos: ${currency(totals.ingresos)}`} color="success" variant="outlined" />
        </Grid>
        <Grid item>
          <Chip label={`Gastos: ${currency(totals.gastos)}`} color="error" variant="outlined" />
        </Grid>
        <Grid item>
          <Chip label={`Saldo: ${currency(totals.saldo)}`} color={totals.saldo >= 0 ? 'success' : 'error'} variant="filled" />
        </Grid>
      </Grid>

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
              {(!items || items.length === 0) && (
                <TableRow>
                  <TableCell colSpan={8} align="center">
                    No tienes proyecciones para este mes. Crea tu primera proyección.
                  </TableCell>
                </TableRow>
              )}
              {items && items.map((it) => (
                <TableRow key={it.occurrence_id} hover>
                  <TableCell>{new Date(it.fecha).toLocaleDateString('es-CL')}</TableCell>
                  <TableCell>{it.nombre}</TableCell>
                  <TableCell>{it.tipo}</TableCell>
                  <TableCell align="right">{currency(it.monto)}</TableCell>
                  <TableCell>{it.category_id ? it.category_id : '-'}</TableCell>
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
              ))}
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
              <TextField fullWidth label="Categoría (opcional)" value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })} />
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
