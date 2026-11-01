import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert, Box, Button, FormControl, Grid, InputLabel, NativeSelect,
  Paper, Stack, Table, TableBody, TableCell, TableContainer, TableFooter, TableHead,
  TableRow, Typography, useTheme,
} from '@mui/material';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatCLPExact as formatCLP, formatCLPShort } from '../../utils/format';

const periodStatus = { past: 'Período pasado', current: 'En curso', future: 'Futuro' };
const percent = (value) => value === null || value === undefined ? 'Sin base previa' : `${value > 0 ? '+' : ''}${new Intl.NumberFormat('es-CL', { maximumFractionDigits: 1 }).format(value)}%`;
const moneyDelta = (value = 0) => `${value > 0 ? '+' : ''}${formatCLP(value)}`;
const colors = ['#1D4ED8', '#047857', '#B45309', '#BE123C', '#6D28D9', '#0E7490'];
export const categoryColor = (id) => colors[Array.from(String(id)).reduce((total, c) => total + c.charCodeAt(0), 0) % colors.length];

export default function ExpenseExplorer({ report, onOpenCell }) {
  const theme = useTheme();
  const [selected, setSelected] = useState('');
  const [sort, setSort] = useState('current');
  const categories = useMemo(() => report.categories || [], [report.categories]);
  const months = report.months || [];
  const lastMonth = months[months.length - 1];
  const previousMonth = months[months.length - 2];
  const summary = report.summary || {};
  const selectedCategory = categories.find((c) => c.id === selected) || categories[0];

  useEffect(() => {
    if (!categories.some((c) => c.id === selected)) setSelected(categories[0]?.id || '');
  }, [categories, selected]);

  const ordered = useMemo(() => [...categories].sort((a, b) => {
    if (sort === 'name') return a.name.localeCompare(b.name, 'es');
    const difference = sort === 'delta' ? (b.delta || 0) - (a.delta || 0) : (b.currentTotal || 0) - (a.currentTotal || 0);
    return difference || a.name.localeCompare(b.name, 'es');
  }), [categories, sort]);

  const trend = months.map((month) => ({ ...month, amount: selectedCategory?.values.find((value) => value.month === month.key)?.total ?? 0 }));
  const exclusions = report.exclusions || {};

  return (
    <Stack spacing={3} sx={{ minWidth: 0 }}>
      <Box data-testid="expense-coverage">
        <Typography variant="body2" color="text.secondary">{report.coverage?.message || 'Importes de movimientos registrados; cobertura bancaria no verificada.'}</Typography>
        {report.coverage?.consolidation === 'unverified' && <Alert severity="warning" sx={{ mt: 1 }}>Suma de registros de las fuentes seleccionadas. La consolidación entre fuentes no está verificada.</Alert>}
        {(report.coverage?.warnings || []).map((warning, index) => <Typography key={index} variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>{warning}</Typography>)}
        {(exclusions.missingPeriodCount || 0) > 0 && <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>{exclusions.missingPeriodCount} movimientos sin período de facturación en el histórico de estas fuentes; no se incluyen en el rango.</Typography>}
        {(exclusions.missingCLPCount || 0) > 0 && <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>{exclusions.missingCLPCount} movimiento{exclusions.missingCLPCount === 1 ? '' : 's'} internacional{exclusions.missingCLPCount === 1 ? '' : 'es'} sin conversión CLP registrada en el rango; no se incluye{exclusions.missingCLPCount === 1 ? '' : 'n'} en los importes.</Typography>}
      </Box>

      <Grid container spacing={2} sx={{ width: 'auto' }}>
        <Grid item xs={12} sm={4}>
          <Typography variant="body2" color="text.secondary">Gasto registrado · {lastMonth?.label}</Typography>
          <Typography component="p" variant="h5" fontWeight={700} data-testid="expense-current-total" sx={{ overflowWrap: 'anywhere', fontVariantNumeric: 'tabular-nums', mt: 0.5 }}>{formatCLP(summary.currentTotal)}</Typography>
          <Typography variant="caption" color="text.secondary">{lastMonth ? periodStatus[lastMonth.status] : 'Período seleccionado'}</Typography>
        </Grid>
        <Grid item xs={12} sm={4}>
          <Typography variant="body2" color="text.secondary">Variación frente al mes anterior</Typography>
          <Typography component="p" variant="h6" fontWeight={600} sx={{ overflowWrap: 'anywhere', mt: 0.5 }}>{moneyDelta(summary.delta)}</Typography>
          <Typography variant="body2" color="text.secondary">{percent(summary.deltaPct)} · solo registros disponibles</Typography>
        </Grid>
        <Grid item xs={12} sm={4}>
          <Typography variant="body2" color="text.secondary">Categoría con mayor aumento</Typography>
          <Typography variant="body1" fontWeight={600} sx={{ mt: 0.5, overflowWrap: 'anywhere' }}>{summary.largestIncrease?.name || 'Sin aumentos registrados'}</Typography>
          {summary.largestIncrease && <Typography variant="body2">{moneyDelta(summary.largestIncrease.delta)}</Typography>}
        </Grid>
      </Grid>

      {!(lastMonth?.count > 0) && <Alert severity="info">Sin movimientos registrados en el mes seleccionado. {lastMonth?.status === 'future' ? 'Es un período futuro; las proyecciones se consultan en Salud Financiera.' : 'Esto no confirma ausencia de gastos bancarios. Importar o sincronizar permite incorporar movimientos desde sus pantallas correspondientes.'}</Alert>}

      <Paper variant="outlined" sx={{ p: { xs: 1.5, sm: 2.5 }, minWidth: 0, boxShadow: 'none' }}>
        <Stack spacing={2}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: { xs: 'stretch', sm: 'center' }, flexDirection: { xs: 'column', sm: 'row' }, gap: 2 }}>
            <Typography variant="h6" component="h2">Tendencia por categoría</Typography>
            <FormControl variant="standard" sx={{ minWidth: { xs: 0, sm: 220 }, maxWidth: '100%' }}>
              <InputLabel htmlFor="expense-category">Categoría</InputLabel>
              <NativeSelect value={selectedCategory?.id || ''} onChange={(e) => setSelected(e.target.value)} inputProps={{ id: 'expense-category', 'aria-label': 'Categoría' }} sx={{ '& select': { textOverflow: 'ellipsis', maxWidth: '100%' } }}>
                {!categories.length && <option value="">Sin categorías</option>}
                {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
              </NativeSelect>
            </FormControl>
          </Box>
          <Box data-testid="expense-trend" role="img" aria-label={`Tendencia de ${selectedCategory?.name || 'categoría'}`} sx={{ minWidth: 0 }}>
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={trend} margin={{ top: 10, right: 14, left: 0, bottom: 0 }}>
                <CartesianGrid stroke={theme.palette.divider} strokeDasharray="3 3" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: theme.palette.text.secondary }} minTickGap={24} />
                <YAxis tickFormatter={formatCLPShort} width={64} tick={{ fontSize: 11, fill: theme.palette.text.secondary }} />
                <Tooltip formatter={(value) => [formatCLP(value), selectedCategory?.name]} />
                <Line type="linear" dataKey="amount" stroke={categoryColor(selectedCategory?.id)} strokeWidth={2.5} dot={{ r: 3 }} activeDot={{ r: 5 }} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </Box>
          <Typography variant="body2" color="text.secondary">{selectedCategory?.name || 'Selecciona una categoría'}. Los importes exactos y su detalle están disponibles en la tabla.</Typography>
        </Stack>
      </Paper>

      <Box sx={{ minWidth: 0 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: { xs: 'stretch', sm: 'center' }, flexDirection: { xs: 'column', sm: 'row' }, gap: 1.5, mb: 1.5 }}>
          <Box>
            <Typography variant="h6" component="h2">Categorías mes a mes</Typography>
            <Typography variant="body2" color="text.secondary">Todas las categorías · abre un importe para revisar sus movimientos.</Typography>
          </Box>
          <FormControl variant="standard" sx={{ minWidth: 190 }}>
            <InputLabel htmlFor="expense-sort">Ordenar categorías</InputLabel>
            <NativeSelect value={sort} onChange={(e) => setSort(e.target.value)} inputProps={{ id: 'expense-sort', 'aria-label': 'Ordenar categorías' }}>
              <option value="current">Gasto del último mes</option><option value="delta">Mayor aumento</option><option value="name">Nombre</option>
            </NativeSelect>
          </FormControl>
        </Box>
        <TableContainer component={Paper} variant="outlined" data-testid="expense-matrix" sx={{ maxWidth: '100%', maxHeight: 'min(65vh, 600px)', overflow: 'auto', boxShadow: 'none' }}>
          <Table stickyHeader size="small" aria-label="Gastos por categoría y mes" sx={{ '& th, & td': { px: 1.5, py: 1.2, fontVariantNumeric: 'tabular-nums' }, '& tr > :first-child': { position: 'sticky', left: 0, zIndex: 1, bgcolor: 'background.paper', borderRight: '1px solid', borderRightColor: 'divider' }, '& thead th': { bgcolor: 'background.paper' } }}>
            <TableHead>
              <TableRow>
                <TableCell scope="col" sx={{ minWidth: { xs: 140, sm: 210 }, maxWidth: { xs: 170, sm: 260 }, zIndex: '3 !important' }}>Categoría</TableCell>
                {months.map((m) => <TableCell key={m.key} scope="col" align="right" sx={{ minWidth: 125 }}><Typography variant="body2" fontWeight={600} sx={{ whiteSpace: 'nowrap' }}>{m.label}</Typography><Typography variant="caption" color="text.secondary">{periodStatus[m.status]}</Typography></TableCell>)}
                <TableCell scope="col" align="right" sx={{ minWidth: 150 }}>Variación{previousMonth && <Typography variant="caption" component="p" color="text.secondary">{previousMonth.label} → {lastMonth?.label}</Typography>}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {ordered.map((category) => <TableRow key={category.id} hover>
                <TableCell component="th" scope="row"><Button variant="text" onClick={() => setSelected(category.id)} aria-label={`Ver tendencia de ${category.name}`} sx={{ textAlign: 'left', justifyContent: 'flex-start', color: 'text.primary', minWidth: 0, width: '100%', p: 0, overflowWrap: 'anywhere', textTransform: 'none', fontWeight: selectedCategory?.id === category.id ? 700 : 400 }}>{category.name}</Button></TableCell>
                {months.map((m) => {
                  const amount = category.values.find((v) => v.month === m.key)?.total ?? 0;
                  return <TableCell key={m.key} align="right"><Button onClick={() => onOpenCell(category, m)} aria-label={`Ver movimientos de ${category.name} en ${m.label}`} variant="text" sx={{ color: 'text.primary', minWidth: 0, p: 0.5, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums', fontWeight: 400 }}>{formatCLP(amount)}</Button></TableCell>;
                })}
                <TableCell align="right"><Typography variant="body2" sx={{ whiteSpace: 'nowrap' }}>{moneyDelta(category.delta)}</Typography><Typography variant="caption" color="text.secondary">{percent(category.deltaPct)}</Typography></TableCell>
              </TableRow>)}
            </TableBody>
            <TableFooter><TableRow><TableCell component="th" scope="row" sx={{ fontWeight: 700, color: 'text.primary' }}>Total registrado</TableCell>{months.map((m) => <TableCell key={m.key} align="right" sx={{ color: 'text.primary', fontWeight: 700, whiteSpace: 'nowrap' }}>{formatCLP(m.total)}</TableCell>)}<TableCell align="right" sx={{ color: 'text.primary', whiteSpace: 'nowrap' }}>{moneyDelta(summary.delta)}</TableCell></TableRow></TableFooter>
          </Table>
        </TableContainer>
      </Box>
    </Stack>
  );
}
