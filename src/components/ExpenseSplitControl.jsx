import React, { forwardRef, useEffect, useRef, useState } from 'react';
import { Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Grid, MenuItem, Slider, Stack, TextField, Typography } from '@mui/material';
import { DragIndicator, CallSplit } from '@mui/icons-material';
import { SliderThumb } from '@mui/material/Slider';
import axios from 'axios';
import useOffline from '../hooks/useOffline';
import { clearReadCache } from '../services/readCache';
import { getActiveSpaceOwner } from '../services/activeSpace';
import { formatCLPExact } from '../utils/format';
import { eligibleExpenseSplit, hasExpenseSplit, minorToClp, parseClpMinor } from '../utils/expenseSplits';

const inputAmount = minor => minorToClp(minor).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1');
const partColor = index => ['primary.main', 'secondary.main', 'success.main', 'warning.main'][index % 4];
const SplitThumb = forwardRef(function SplitThumb(props, ref) {
  const { children, ...other } = props;
  return <SliderThumb {...other} ref={ref}>{children}<DragIndicator fontSize="small" aria-hidden="true" /></SliderThumb>;
});

export default function ExpenseSplitControl({ source, row, categories = [], canEdit = false, disabled = false, onChange, children }) {
  const { isOffline } = useOffline();
  const space = getActiveSpaceOwner() || 'own';
  const generation = useRef(0);
  const [open, setOpen] = useState(false);
  const [data, setData] = useState(null);
  const [draft, setDraft] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState(false);
  const [removeConfirmation, setRemoveConfirmation] = useState(false);
  const split = hasExpenseSplit(row) ? row.split : null;
  const allowed = canEdit && !disabled && !isOffline;
  const total = parseClpMinor(data?.total_clp);
  const amounts = draft.map(part => parseClpMinor(part.amount));
  const sum = amounts.reduce((value, amount) => value + (amount || 0), 0);
  const valid = total !== null && total > 1 && draft.length >= 2 && draft.length <= 50 && amounts.every(amount => amount !== null && amount > 0) && sum === total;
  const endpoint = `/api/expense-splits/${source}/${row.id}`;
  const currentSpace = () => (getActiveSpaceOwner() || 'own') === space;
  useEffect(() => {
    setOpen(false); generation.current += 1;
    return () => { generation.current += 1; };
  }, [source, row.id, space]);

  function close() { if (!saving) { generation.current += 1; setOpen(false); } }
  async function load() {
    if (!allowed || !currentSpace()) return;
    const request = ++generation.current;
    setLoading(true); setError(''); setConflict(false); setRemoveConfirmation(false);
    try {
      const response = await axios.get(endpoint);
      if (request !== generation.current || !currentSpace()) return;
      const next = response.data;
      const minor = parseClpMinor(next.total_clp);
      if (minor === null || minor < 2) throw new Error('El movimiento no tiene un monto válido para dividir.');
      setData(next);
      setDraft(next.split ? next.split.parts.map(part => ({ amount: inputAmount(parseClpMinor(part.amount_clp)), category_id: part.category_id ?? null })) : [
        { amount: inputAmount(Math.floor(minor / 2)), category_id: row.category_id || null },
        { amount: inputAmount(minor - Math.floor(minor / 2)), category_id: row.category_id || null },
      ]);
    } catch (failure) {
      if (request === generation.current && currentSpace()) setError(failure?.response?.data?.error || failure.message || 'No pudimos cargar la división.');
    } finally { if (request === generation.current && currentSpace()) setLoading(false); }
  }
  function show() { if (!allowed) return; setData(null); setDraft([]); setOpen(true); load(); }
  function changeAmount(index, value) {
    setDraft(previous => {
      const next = previous.map(part => ({ ...part }));
      const balanceIndex = index === next.length - 1 ? index - 1 : next.length - 1;
      next[index].amount = value;
      const remaining = total - next.reduce((value, part, i) => value + (i === balanceIndex ? 0 : parseClpMinor(part.amount) || 0), 0);
      next[balanceIndex].amount = inputAmount(remaining);
      return next;
    });
  }
  function moveDivider(event, values, activeThumb) {
    if (!valid || !allowed || conflict) return;
    setDraft(previous => {
      const next = previous.map(part => ({ ...part }));
      const index = activeThumb ?? 0;
      const before = previous.slice(0, index).reduce((value, part) => value + parseClpMinor(part.amount), 0);
      const adjacent = parseClpMinor(previous[index].amount) + parseClpMinor(previous[index + 1].amount);
      const value = Math.max(1, Math.min(adjacent - 1, Math.round(values[index]) - before));
      next[index].amount = inputAmount(value);
      next[index + 1].amount = inputAmount(adjacent - value);
      return next;
    });
  }
  function addPart() {
    if (!valid || draft.length >= 50) return;
    const next = draft.map(part => ({ ...part }));
    const last = next[next.length - 1];
    const amount = parseClpMinor(last.amount);
    if (amount < 2) return;
    const half = Math.floor(amount / 2);
    last.amount = inputAmount(amount - half);
    next.push({ amount: inputAmount(half), category_id: null });
    setDraft(next);
  }
  function equalParts() {
    if (total < draft.length) return;
    const amount = Math.floor(total / draft.length);
    setDraft(previous => previous.map((part, index) => ({ ...part, amount: inputAmount(index === previous.length - 1 ? total - amount * index : amount) })));
  }
  function removePart(index) {
    if (!valid || draft.length <= 2) return;
    const next = draft.map(part => ({ ...part }));
    const [removed] = next.splice(index, 1);
    const mergeIndex = Math.max(0, index - 1);
    next[mergeIndex].amount = inputAmount(parseClpMinor(next[mergeIndex].amount) + parseClpMinor(removed.amount));
    setDraft(next);
  }
  async function persist(remove = false) {
    if (!allowed || !currentSpace() || saving || conflict || (!remove && !valid)) return;
    const request = generation.current;
    setSaving(true); setError('');
    try {
      const expectedVersion = data.split?.version || 0;
      const response = remove ? await axios.delete(endpoint, { data: { expectedVersion } }) : await axios.put(endpoint, {
        expectedVersion,
        parts: draft.map(part => ({ amount_clp: minorToClp(parseClpMinor(part.amount)), category_id: part.category_id === '' || part.category_id === null ? null : Number(part.category_id) })),
      });
      if (request !== generation.current || !currentSpace()) return;
      if (typeof clearReadCache === 'function') await clearReadCache();
      if (request !== generation.current || !currentSpace()) return;
      onChange?.(response.data.split);
      if (typeof window.refreshDashboardData === 'function') window.refreshDashboardData();
      setOpen(false);
    } catch (failure) {
      if (request !== generation.current || !currentSpace()) return;
      if (failure?.response?.status === 409) { setConflict(true); setError('El movimiento o su división cambió. Recarga la división antes de volver a guardar.'); }
      else setError(failure?.response?.data?.error || 'No pudimos guardar la división. Tu borrador se conserva.');
    } finally { if (request === generation.current && currentSpace()) setSaving(false); }
  }
  if (!eligibleExpenseSplit(source, row) && !split) return children || null;
  const categoryName = id => categories.find(category => String(category.id) === String(id))?.name || 'Sin categoría';
  let position = 0;
  const dividers = amounts.slice(0, -1).map(amount => (position += amount || 0));
  return <Box sx={{ minWidth: 0, maxWidth: '100%', flex: 1, '& > .MuiInputBase-root': { width: '100%' } }}>
    {!split && children}
    {split && <Stack spacing={0.5} sx={{ mb: 0.5 }} aria-label="Desglose del gasto">
      {split.parts.map((part, index) => <Typography key={index} variant="caption" sx={{ display: 'block', overflowWrap: 'anywhere' }}>{part.category_name || categoryName(part.category_id)}: {formatCLPExact(part.amount_clp)}</Typography>)}
    </Stack>}
    <Button size="small" startIcon={<CallSplit fontSize="small" />} onClick={show} disabled={!allowed} sx={{ whiteSpace: 'normal' }}>{split ? 'Editar división' : 'Dividir gasto'}</Button>
    <Dialog open={open} onClose={close} fullWidth maxWidth="sm" aria-labelledby={`expense-split-title-${row.id}`}>
      <DialogTitle id={`expense-split-title-${row.id}`}>{data?.split || split ? 'Editar división' : 'Dividir gasto'}</DialogTitle>
      <DialogContent sx={{ overflowX: 'hidden' }}>
        <Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>{row.descripcion}</Typography>
        {loading && <Box sx={{ py: 3, textAlign: 'center' }}><CircularProgress aria-label="Cargando división" size={28} /></Box>}
        {error && <Alert severity="error" sx={{ my: 2 }} action={conflict || !data ? <Button color="inherit" onClick={load} disabled={saving || !allowed}>Recargar división</Button> : null}>{error}</Alert>}
        {data && !loading && <>
          <Typography variant="h6" sx={{ mt: 1 }}>{formatCLPExact(data.total_clp)} CLP</Typography>
          <Box sx={{ position: 'relative', mx: 2.5, my: 1.5, height: 52 }}>
            <Box role="img" aria-label="Reparto del total" sx={{ position: 'absolute', top: 14, width: '100%', height: 24, display: 'flex', borderRadius: 1, overflow: 'hidden', bgcolor: 'action.hover' }}>
              {draft.map((part, index) => <Box key={index} sx={{ width: `${Math.max(0, amounts[index] || 0) / Math.max(total, sum) * 100}%`, bgcolor: partColor(index) }} />)}
            </Box>
            <Slider value={dividers} min={1} max={Math.max(2, total - 1)} step={1} track={false} disableSwap onChange={moveDivider}
              disabled={!valid || !allowed || saving || conflict} components={{ Thumb: SplitThumb }}
              getAriaLabel={index => `Mover división entre partes ${index + 1} y ${index + 2}`}
              getAriaValueText={value => formatCLPExact(minorToClp(value))}
              sx={{ position: 'absolute', top: 0, left: 0, height: 24, py: '14px', '& .MuiSlider-rail': { display: 'none' }, '& .MuiSlider-thumb': { width: 36, height: 40, borderRadius: 1.5, bgcolor: 'background.paper', border: '2px solid', borderColor: 'primary.main', boxShadow: 'none', '&:before': { boxShadow: 'none' }, color: 'primary.main' } }} />
          </Box>
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mb: 1 }}>
            <Button onClick={equalParts} disabled={!allowed || saving || conflict || total < draft.length}>Partes iguales</Button>
            <Button onClick={addPart} disabled={!valid || !allowed || saving || conflict || draft.length >= 50 || amounts[amounts.length - 1] < 2}>Agregar parte</Button>
          </Stack>
          <Grid container spacing={2}>
            {draft.map((part, index) => <Grid item xs={12} sm={6} key={index}>
              <Box sx={{ borderBottom: '1px solid', borderColor: 'divider', pb: 2 }}>
                <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1, minHeight: 36 }}>
                  <Typography variant="subtitle2" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}><Box component="span" sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: partColor(index) }} />Parte {index + 1}</Typography>
                  {draft.length > 2 && <Button size="small" aria-label={`Quitar parte ${index + 1}`} disabled={!valid || !allowed || saving || conflict} onClick={() => removePart(index)}>Quitar</Button>}
                </Stack>
                <Stack spacing={2}>
                  <TextField select fullWidth label="Categoría" value={part.category_id ?? ''} disabled={!allowed || saving || conflict}
                    SelectProps={{ SelectDisplayProps: { 'aria-label': `Categoría, parte ${index + 1}`, 'aria-labelledby': undefined }, displayEmpty: true }} InputLabelProps={{ shrink: true }}
                    onChange={event => setDraft(previous => previous.map((item, i) => i === index ? { ...item, category_id: event.target.value || null } : item))}>
                    <MenuItem value="">Sin categoría</MenuItem>
                    {categories.map(category => <MenuItem key={category.id} value={category.id}>{category.name}</MenuItem>)}
                  </TextField>
                  <TextField fullWidth label="Monto CLP" type="number" value={part.amount} onChange={event => changeAmount(index, event.target.value)}
                    disabled={!allowed || saving || conflict} inputProps={{ min: '0.01', step: '0.01', inputMode: 'decimal', 'aria-label': `Monto CLP, parte ${index + 1}` }} />
                </Stack>
              </Box>
            </Grid>)}
          </Grid>
          <Stack direction="row" justifyContent="space-between" flexWrap="wrap" gap={1} sx={{ mt: 2 }} aria-live="polite">
            <Typography variant="body2">Total repartido {formatCLPExact(minorToClp(sum))}</Typography>
            <Typography variant="body2">Diferencia {formatCLPExact(minorToClp(total - sum))}</Typography>
          </Stack>
          {!valid && <Alert severity="warning" sx={{ mt: 1 }}>Cada parte debe tener un monto positivo de hasta dos decimales y sumar el total original.</Alert>}
          {data.split && !removeConfirmation && <Button color="warning" onClick={() => setRemoveConfirmation(true)} disabled={!allowed || saving || conflict} sx={{ mt: 2 }}>Deshacer división</Button>}
          {removeConfirmation && <Alert severity="warning" sx={{ mt: 2 }}>Se quitará el desglose y volverá a usarse la categoría original: {categoryName(row.category_id)}.
            <Stack direction="row" flexWrap="wrap" gap={1} sx={{ mt: 1 }}><Button onClick={() => setRemoveConfirmation(false)} disabled={saving}>Volver</Button><Button color="warning" onClick={() => persist(true)} disabled={!allowed || saving || conflict}>Confirmar deshacer</Button></Stack>
          </Alert>}
        </>}
      </DialogContent>
      <DialogActions sx={{ flexWrap: 'wrap' }}><Button onClick={close} disabled={saving}>Cancelar</Button><Button variant="contained" onClick={() => persist()} disabled={!data || loading || saving || !allowed || !valid || conflict || removeConfirmation}>{saving ? 'Guardando…' : 'Confirmar división'}</Button></DialogActions>
    </Dialog>
  </Box>;
}
