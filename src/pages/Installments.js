import React, { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  IconButton,
  MenuItem,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
  Divider,
} from '@mui/material';
import { Add, Delete, Edit } from '@mui/icons-material';
import axios from 'axios';
import MonthPicker from '../components/MonthPicker';
import { usePeriod } from '../contexts/PeriodContext';

const currency = (v) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(Number(v || 0));

const emptyPlan = (year, month) => ({
  brand: 'mastercard',
  descripcion: '',
  amount_per_installment: '',
  start_year: year,
  start_month: month,
  start_installment: 1,
  total_installments: 1,
  category_id: '',
  notas: '',
});

export default function Installments() {
  const { year, month } = usePeriod();
  const [plans, setPlans] = useState([]);
  const [occurrences, setOccurrences] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyPlan(year, month));
  const [error, setError] = useState('');

  const load = async () => {
    try {
      setLoading(true);
      const [pRes, oRes] = await Promise.all([
        axios.get('/api/installments/plans'),
        axios.get('/api/installments/occurrences', { params: { year, month } }),
      ]);
      setPlans(pRes.data || []);
      setOccurrences(oRes.data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setForm(emptyPlan(year, month));
    load();
  }, [year, month]);

  const totals = useMemo(() => {
    const byBrand = occurrences.reduce((acc, o) => {
      const b = (o.brand || '').toLowerCase();
      const amt = Number(o.amount) || 0;
      if (!acc[b]) acc[b] = 0;
      acc[b] += amt;
      return acc;
    }, {});
    const total = Object.values(byBrand).reduce((s, n) => s + n, 0);
    return { ...byBrand, total };
  }, [occurrences]);

  const onOpenCreate = () => {
    setForm(emptyPlan(year, month));
    setError('');
    setOpen(true);
  };

  const onClose = () => { setOpen(false); setError(''); };

  const validate = () => {
    if (!['visa','mastercard'].includes(form.brand)) return 'Tarjeta inválida';
    if (!form.descripcion || form.descripcion.length < 3 || form.descripcion.length > 60) return 'Descripción entre 3 y 60 caracteres';
    const amt = Number(form.amount_per_installment);
    if (!amt || amt <= 0) return 'Monto por cuota > 0';
    const si = Number(form.start_installment);
    const ti = Number(form.total_installments);
    if (!si || !ti || si < 1 || ti < 1 || si > ti) return 'Cuota actual y total inválidos';
    if (!form.start_year || !form.start_month) return 'Periodo inválido';
    if (form.notas && form.notas.length > 140) return 'Notas demasiado largas';
    return '';
  };

  const onSubmit = async () => {
    const err = validate();
    if (err) { setError(err); return; }
    try {
      setLoading(true);
      await axios.post('/api/installments/plans', {
        ...form,
        category_id: form.category_id || null,
      });
      await load();
      onClose();
    } catch (e) {
      setError(e?.response?.data?.error || 'Error al crear plan');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteOccurrence = async (occ) => {
    if (!window.confirm('¿Eliminar esta cuota del mes?')) return;
    await axios.delete(`/api/installments/occurrences/${occ.id}`);
    await load();
  };

  const handleDeletePlanForward = async (plan) => {
    if (!window.confirm('¿Eliminar plan desde este mes en adelante?')) return;
    await axios.delete(`/api/installments/plans/${plan.id}`, { params: { fromYear: year, fromMonth: month } });
    await load();
  };

  return (
    <Box>
      <MonthPicker />
      <Typography variant="h4" sx={{ mb: 2 }}>Compras en Cuotas (TC)</Typography>

      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid item>
          <Button variant="contained" startIcon={<Add />} onClick={onOpenCreate}>Nueva compra en cuotas</Button>
        </Grid>
        <Grid item>
          <Chip label={`Visa mes: ${currency(totals.visa || 0)}`} color="primary" variant="outlined" />
        </Grid>
        <Grid item>
          <Chip label={`Mastercard mes: ${currency(totals.mastercard || 0)}`} color="secondary" variant="outlined" />
        </Grid>
        <Grid item>
          <Chip label={`Total mes: ${currency(totals.total || 0)}`} color="default" variant="filled" />
        </Grid>
      </Grid>

      <Paper sx={{ mb: 3 }}>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Tarjeta</TableCell>
                <TableCell>Descripción</TableCell>
                <TableCell align="right">Monto cuota</TableCell>
                <TableCell>Cuota actual</TableCell>
                <TableCell>Total cuotas</TableCell>
                <TableCell>Categoría</TableCell>
                <TableCell align="right">Acciones</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {plans.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} align="center">No tienes compras en cuotas registradas. Crea tu primera compra en cuotas.</TableCell>
                </TableRow>
              )}
              {plans.map((p) => {
                // calcular cuota del mes si existe
                const occ = occurrences.find(o => o.plan_id === p.id);
                const currentLabel = occ ? `${occ.installment_number}/${p.total_installments}` : '-';
                return (
                  <TableRow key={p.id} hover>
                    <TableCell sx={{ textTransform: 'capitalize' }}>{p.brand}</TableCell>
                    <TableCell>{p.descripcion}</TableCell>
                    <TableCell align="right">{currency(p.amount_per_installment)}</TableCell>
                    <TableCell>{currentLabel}</TableCell>
                    <TableCell>{p.total_installments}</TableCell>
                    <TableCell>{p.category_id || '-'}</TableCell>
                    <TableCell align="right">
                      <Tooltip title="Eliminar plan (desde este mes)">
                        <IconButton size="small" color="error" onClick={() => handleDeletePlanForward(p)}><Delete fontSize="small" /></IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      <Paper>
        <Box p={2}>
          <Typography variant="h6">Cuotas del mes</Typography>
        </Box>
        <Divider />
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Fecha (período)</TableCell>
                <TableCell>Tarjeta</TableCell>
                <TableCell>Descripción</TableCell>
                <TableCell>Cuota</TableCell>
                <TableCell align="right">Monto</TableCell>
                <TableCell align="right">Acciones</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {occurrences.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} align="center">No hay cuotas para este mes</TableCell>
                </TableRow>
              )}
              {occurrences.map((o) => (
                <TableRow key={o.id} hover>
                  <TableCell>{`${o.year}-${String(o.month).padStart(2,'0')}`}</TableCell>
                  <TableCell sx={{ textTransform: 'capitalize' }}>{o.brand}</TableCell>
                  <TableCell>{o.descripcion}</TableCell>
                  <TableCell>{`${o.installment_number}`}</TableCell>
                  <TableCell align="right">{currency(o.amount)}</TableCell>
                  <TableCell align="right">
                    <Tooltip title="Eliminar cuota">
                      <IconButton size="small" onClick={() => handleDeleteOccurrence(o)}><Delete fontSize="small" /></IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
        <DialogTitle>Nueva compra en cuotas</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 0.5 }}>
            <Grid item xs={12} sm={6}>
              <TextField select fullWidth label="Tarjeta" value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })}>
                <MenuItem value="visa">Visa</MenuItem>
                <MenuItem value="mastercard">Mastercard</MenuItem>
              </TextField>
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField fullWidth label="Descripción / Comercio" value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField fullWidth label="Monto por cuota" type="number" inputProps={{ min: 0 }} value={form.amount_per_installment} onChange={(e) => setForm({ ...form, amount_per_installment: e.target.value })} />
            </Grid>
            <Grid item xs={6} sm={3}>
              <TextField fullWidth label="Cuota actual" type="number" inputProps={{ min: 1 }} value={form.start_installment} onChange={(e) => setForm({ ...form, start_installment: Number(e.target.value) })} />
            </Grid>
            <Grid item xs={6} sm={3}>
              <TextField fullWidth label="Total cuotas" type="number" inputProps={{ min: 1 }} value={form.total_installments} onChange={(e) => setForm({ ...form, total_installments: Number(e.target.value) })} />
            </Grid>
            <Grid item xs={6} sm={3}>
              <TextField fullWidth label="Año inicio" type="number" inputProps={{ min: 2000, max: 2100 }} value={form.start_year} onChange={(e) => setForm({ ...form, start_year: Number(e.target.value) })} />
            </Grid>
            <Grid item xs={6} sm={3}>
              <TextField fullWidth label="Mes inicio" type="number" inputProps={{ min: 1, max: 12 }} value={form.start_month} onChange={(e) => setForm({ ...form, start_month: Number(e.target.value) })} />
            </Grid>
            <Grid item xs={12}>
              <TextField fullWidth label="Notas (opcional)" value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} inputProps={{ maxLength: 140 }} />
            </Grid>
          </Grid>
          {error && (<Typography color="error" sx={{ mt: 1 }}>{error}</Typography>)}
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Cancelar</Button>
          <Button onClick={onSubmit} variant="contained" disabled={loading}>Crear</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
