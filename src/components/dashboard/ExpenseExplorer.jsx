import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Accordion, AccordionDetails, AccordionSummary, Alert, Box, Button, Chip, Collapse,
  Divider, FormControl, InputLabel, NativeSelect, Paper, Stack, Tab, Tabs, Table,
  TableBody, TableCell, TableContainer, TableFooter, TableHead, TableRow, Typography,
  alpha, useMediaQuery, useTheme,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatCLPExact as formatCLP, formatCLPShort } from '../../utils/format';

const periodStatus = { past: 'Período pasado', current: 'En curso', future: 'Futuro' };
const percent = (value) => value === null || value === undefined
  ? 'Sin base previa'
  : `${value > 0 ? '+' : ''}${new Intl.NumberFormat('es-CL', { maximumFractionDigits: 1 }).format(value)}%`;
const moneyDelta = (value = 0) => `${value > 0 ? '+' : ''}${formatCLP(value)}`;
const seriesColors = {
  light: ['#1D4ED8', '#047857', '#B45309', '#BE123C', '#6D28D9', '#0E7490'],
  dark: ['#93C5FD', '#6EE7B7', '#FCD34D', '#FDA4AF', '#C4B5FD', '#67E8F9'],
};
export const categoryColor = (id, mode = 'light') => seriesColors[mode === 'dark' ? 'dark' : 'light'][
  Array.from(String(id)).reduce((total, char) => total + char.charCodeAt(0), 0) % 6
];

function deltaColor(delta, theme) {
  if (!delta) return theme.palette.text.secondary;
  const palette = delta > 0 ? theme.palette.error : theme.palette.success;
  return theme.palette.mode === 'dark' ? palette.light : palette.dark;
}

function MonthHistory({ category, months, onOpenCell }) {
  return (
    <Stack spacing={0.5}>
      {[...months].reverse().map((month) => {
        const value = category.values.find((item) => item.month === month.key);
        return (
          <Button
            key={month.key}
            onClick={() => onOpenCell(category, month)}
            aria-label={`Ver movimientos de ${category.name} en ${month.label}`}
            sx={{ justifyContent: 'space-between', gap: 1, minHeight: 48, px: 1, color: 'text.primary', textAlign: 'left', flexWrap: 'wrap' }}
          >
            <Box component="span" sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
              <Typography component="span" variant="body2">{month.label}</Typography>
              {month.status !== 'past' && <Typography component="span" variant="caption" color="text.secondary">{periodStatus[month.status]}</Typography>}
            </Box>
            <Typography component="span" variant="body2" fontWeight={600} sx={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{formatCLP(value?.total ?? 0)}</Typography>
          </Button>
        );
      })}
    </Stack>
  );
}

export default function ExpenseExplorer({ report, onOpenCell, selectedCategoryId, onSelectedCategoryChange }) {
  const theme = useTheme();
  const mobile = useMediaQuery(theme.breakpoints.down('md'));
  const [selected, setSelected] = useState('');
  const [sort, setSort] = useState('current');
  const [mobileView, setMobileView] = useState('categories');
  const [expandedCategory, setExpandedCategory] = useState(null);
  const selection = selectedCategoryId === undefined ? selected : selectedCategoryId;
  const selectCategory = useCallback((id) => {
    setSelected(id);
    onSelectedCategoryChange?.(id);
  }, [onSelectedCategoryChange]);
  const categories = useMemo(() => report.categories || [], [report.categories]);
  const months = report.months || [];
  const lastMonth = months[months.length - 1];
  const previousMonth = months[months.length - 2];
  const summary = report.summary || {};
  const selectedCategory = categories.find((category) => category.id === selection) || categories[0];

  useEffect(() => {
    if (!categories.some((category) => category.id === selection)) selectCategory(categories[0]?.id || '');
  }, [categories, selection, selectCategory]);

  const ordered = useMemo(() => [...categories].sort((a, b) => {
    if (sort === 'name') return a.name.localeCompare(b.name, 'es');
    const difference = sort === 'delta' ? (b.delta || 0) - (a.delta || 0) : (b.currentTotal || 0) - (a.currentTotal || 0);
    return difference || a.name.localeCompare(b.name, 'es');
  }), [categories, sort]);

  const trend = months.map((month) => ({ ...month, amount: selectedCategory?.values.find((value) => value.month === month.key)?.total ?? 0 }));
  const exclusions = report.exclusions || {};
  const excluded = (exclusions.missingPeriodCount || 0) + (exclusions.missingCLPCount || 0);
  const unverified = report.coverage?.consolidation === 'unverified';
  const warnings = (report.coverage?.warnings || []).filter((warning) => !(unverified && /consolidaci[oó]n/i.test(warning)));
  const changeColor = deltaColor(summary.delta, theme);

  const ordering = (
    <FormControl variant="standard" sx={{ minWidth: { xs: 0, md: 190 }, maxWidth: '100%' }}>
      <InputLabel htmlFor="expense-sort">Ordenar categorías</InputLabel>
      <NativeSelect value={sort} onChange={(event) => setSort(event.target.value)} inputProps={{ id: 'expense-sort', 'aria-label': 'Ordenar categorías' }} sx={{ minHeight: 44 }}>
        <option value="current">Gasto del último mes</option><option value="delta">Mayor aumento</option><option value="name">Nombre</option>
      </NativeSelect>
    </FormControl>
  );

  const trendPanel = (
    <Paper variant="outlined" sx={{ p: { xs: 1.5, sm: 2.5 }, minWidth: 0, boxShadow: 'none' }}>
      <Stack spacing={2}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: { xs: 'stretch', sm: 'center' }, flexDirection: { xs: 'column', sm: 'row' }, gap: 1.5 }}>
          <Typography variant="h6" component="h2">Tendencia por categoría</Typography>
          <FormControl variant="standard" sx={{ minWidth: { xs: 0, sm: 220 }, maxWidth: '100%' }}>
            <InputLabel htmlFor="expense-category">Categoría</InputLabel>
            <NativeSelect value={selectedCategory?.id || ''} onChange={(event) => selectCategory(event.target.value)} inputProps={{ id: 'expense-category', 'aria-label': 'Categoría' }} sx={{ minHeight: 44, '& select': { textOverflow: 'ellipsis', maxWidth: '100%' } }}>
              {!categories.length && <option value="">Sin categorías</option>}
              {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
            </NativeSelect>
          </FormControl>
        </Box>
        <Box data-testid="expense-trend" role="img" aria-label={`Tendencia de ${selectedCategory?.name || 'categoría'}`} sx={{ minWidth: 0 }}>
          <ResponsiveContainer width="100%" height={mobile ? 200 : 240}>
            <LineChart data={trend} margin={{ top: 10, right: 14, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={theme.palette.divider} strokeDasharray="3 3" />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: theme.palette.text.secondary }} minTickGap={24} />
              <YAxis tickFormatter={formatCLPShort} width={60} tick={{ fontSize: 11, fill: theme.palette.text.secondary }} />
              <Tooltip formatter={(value) => [formatCLP(value), selectedCategory?.name]} contentStyle={{ backgroundColor: theme.palette.background.paper, color: theme.palette.text.primary, borderColor: theme.palette.divider }} />
              <Line type="linear" dataKey="amount" stroke={categoryColor(selectedCategory?.id, theme.palette.mode)} strokeWidth={2.5} dot={{ r: 3 }} activeDot={{ r: 5 }} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </Box>
        <Typography variant="body2" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>{selectedCategory?.name || 'Selecciona una categoría'}. Importes exactos por período de facturación.</Typography>
        {mobile && selectedCategory && <MonthHistory category={selectedCategory} months={months} onOpenCell={onOpenCell} />}
      </Stack>
    </Paper>
  );

  return (
    <Stack spacing={{ xs: 2, md: 3 }} sx={{ minWidth: 0 }}>
      <Paper variant="outlined" data-testid="expense-summary" sx={{ p: { xs: 2, md: 2.5 }, minWidth: 0, boxShadow: 'none', bgcolor: alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? 0.12 : 0.045), borderColor: alpha(theme.palette.primary.main, 0.28) }}>
        <Stack spacing={1.25}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
            <Typography variant="body2" fontWeight={600}>Gasto registrado · {lastMonth?.label}</Typography>
            <Chip size="small" variant="outlined" label={lastMonth ? periodStatus[lastMonth.status] : 'Período seleccionado'} />
          </Box>
          <Typography component="p" variant={mobile ? 'h5' : 'h4'} fontWeight={700} data-testid="expense-current-total" sx={{ overflowWrap: 'anywhere', fontVariantNumeric: 'tabular-nums', lineHeight: 1.2 }}>{formatCLP(summary.currentTotal)}</Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap', color: changeColor }}>
            {summary.delta > 0 ? <TrendingUpIcon fontSize="small" /> : summary.delta < 0 ? <TrendingDownIcon fontSize="small" /> : null}
            <Typography variant="body2" fontWeight={600} sx={{ overflowWrap: 'anywhere' }}>{moneyDelta(summary.delta)}</Typography>
            <Typography variant="body2">{percent(summary.deltaPct)}</Typography>
            <Typography variant="caption" color="secondary.main">vs. {previousMonth?.label || 'mes anterior'}</Typography>
          </Box>
          {summary.largestIncrease && <Typography variant="caption" color="secondary.main" sx={{ overflowWrap: 'anywhere' }}>Mayor aumento: <Box component="span" sx={{ color: 'text.primary', fontWeight: 600 }}>{summary.largestIncrease.name}</Box> · {moneyDelta(summary.largestIncrease.delta)}</Typography>}
        </Stack>
      </Paper>

      {!(lastMonth?.count > 0) && <Alert severity="info">Sin movimientos registrados en el mes seleccionado. {lastMonth?.status === 'future' ? 'Es un período futuro; las proyecciones se consultan en Salud Financiera.' : 'Esto no confirma ausencia de gastos bancarios. Importar o sincronizar permite incorporar movimientos desde sus pantallas correspondientes.'}</Alert>}

      <Box data-testid="expense-coverage" sx={{ minWidth: 0 }}>
        {unverified && <Alert severity="warning" sx={{ mb: 1 }}>Suma de registros de las fuentes seleccionadas. La consolidación entre fuentes no está verificada.</Alert>}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 0.75, flexWrap: 'wrap', mb: excluded ? 0.5 : 0 }}>
          <Typography variant="caption" color="text.secondary">Cobertura bancaria no verificada</Typography>
          {excluded > 0 && <Typography variant="caption" sx={{ color: theme.palette.mode === 'dark' ? 'warning.light' : 'warning.dark', fontWeight: 600 }}>{excluded} movimientos fuera del análisis</Typography>}
        </Box>
        <Accordion disableGutters elevation={0} sx={{ bgcolor: 'transparent', boxShadow: 'none', '&:before': { display: 'none' } }}>
          <AccordionSummary aria-label="Detalle de los datos" expandIcon={<ExpandMoreIcon />} sx={{ px: 0, minHeight: 40, '& .MuiAccordionSummary-content': { my: 0.5 } }}><Typography variant="caption" color="text.secondary">Detalle de los datos</Typography></AccordionSummary>
          <AccordionDetails sx={{ px: 0, pt: 0 }}>
            <Stack spacing={0.75}>
              <Typography variant="body2" color="text.secondary">{report.coverage?.message || 'Importes de movimientos registrados; cobertura bancaria no verificada.'}</Typography>
              {report.generatedAt && <Typography variant="caption" color="text.secondary">Consultado: {new Date(report.generatedAt).toLocaleString('es-CL')}</Typography>}
              {warnings.map((warning, index) => <Typography key={index} variant="body2" color="text.secondary">{warning}</Typography>)}
              {(exclusions.missingPeriodCount || 0) > 0 && <Typography variant="body2" color="text.secondary">{exclusions.missingPeriodCount} movimientos sin período de facturación en el histórico de estas fuentes; no se incluyen en el rango.</Typography>}
              {(exclusions.missingCLPCount || 0) > 0 && <Typography variant="body2" color="text.secondary">{exclusions.missingCLPCount} movimiento{exclusions.missingCLPCount === 1 ? '' : 's'} internacional{exclusions.missingCLPCount === 1 ? '' : 'es'} sin conversión CLP registrada en el rango; no se incluye{exclusions.missingCLPCount === 1 ? '' : 'n'} en los importes.</Typography>}
            </Stack>
          </AccordionDetails>
        </Accordion>
      </Box>

      {mobile ? <>
        <Tabs value={mobileView} onChange={(event, value) => setMobileView(value)} variant="fullWidth" aria-label="Vista del análisis de gastos" sx={{ minHeight: 44, borderBottom: '1px solid', borderColor: 'divider' }}>
          <Tab value="categories" label="Categorías" id="expense-categories-tab" aria-controls="expense-categories-panel" sx={{ minHeight: 44 }} />
          <Tab value="trend" label="Tendencia" id="expense-trend-tab" aria-controls="expense-trend-panel" sx={{ minHeight: 44 }} />
        </Tabs>
        {mobileView === 'categories' ? <Box role="tabpanel" id="expense-categories-panel" aria-labelledby="expense-categories-tab" sx={{ minWidth: 0 }}>
          <Stack spacing={1.5}>
            <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 1, flexWrap: 'wrap' }}>
              <Typography variant="h6" component="h2">Categorías mes a mes</Typography>
              <Typography variant="caption" color="text.secondary">{categories.length} categorías · {lastMonth?.label}</Typography>
            </Box>
            {ordering}
            <Box component="ul" data-testid="expense-category-list" sx={{ p: 0, m: 0, listStyle: 'none', display: 'grid', gap: 1, minWidth: 0 }}>
              {ordered.map((category) => {
                const expanded = expandedCategory === category.id;
                const current = category.values.find((value) => value.month === lastMonth?.key);
                return <Paper key={category.id} component="li" variant="outlined" data-testid={`expense-category-card-${category.id}`} sx={{ overflow: 'hidden', minWidth: 0, boxShadow: 'none' }}>
                  <Button
                    aria-label={`Ver historial de ${category.name}`}
                    aria-expanded={expanded}
                    aria-controls={`expense-category-history-${category.id}`}
                    onClick={() => { setExpandedCategory(expanded ? null : category.id); selectCategory(category.id); }}
                    sx={{ display: 'block', textAlign: 'left', width: '100%', p: 1.5, color: 'text.primary', borderRadius: 0, minWidth: 0, textTransform: 'none' }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, mb: 0.5 }}><Typography component="span" variant="body2" fontWeight={600} sx={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>{category.name}</Typography><ExpandMoreIcon fontSize="small" sx={{ flexShrink: 0, color: 'text.secondary', transform: expanded ? 'rotate(180deg)' : 'none' }} /></Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 0.75, flexWrap: 'wrap' }}>
                      <Typography component="span" variant="body1" fontWeight={700} data-testid={`expense-category-total-${category.id}`} sx={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{formatCLP(category.currentTotal)}</Typography>
                      <Typography component="span" variant="caption" sx={{ color: deltaColor(category.delta, theme), overflowWrap: 'anywhere' }}>{moneyDelta(category.delta)} · {percent(category.deltaPct)}</Typography>
                    </Box>
                    {(!current?.count || lastMonth?.status === 'future') && <Typography component="span" variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25 }}>{lastMonth?.status === 'future' ? 'Período futuro' : 'Sin movimientos registrados'}</Typography>}
                  </Button>
                  <Collapse in={expanded} unmountOnExit>
                    <Divider />
                    <Box id={`expense-category-history-${category.id}`} data-testid={`expense-category-history-${category.id}`} sx={{ p: 1 }}>
                      <MonthHistory category={category} months={months} onOpenCell={onOpenCell} />
                      <Button onClick={() => { selectCategory(category.id); setMobileView('trend'); }} sx={{ minHeight: 44, width: '100%', mt: 0.5 }} aria-label={`Ver tendencia de ${category.name}`}>Ver tendencia</Button>
                    </Box>
                  </Collapse>
                </Paper>;
              })}
            </Box>
          </Stack>
        </Box> : <Box role="tabpanel" id="expense-trend-panel" aria-labelledby="expense-trend-tab" sx={{ minWidth: 0 }}>{trendPanel}</Box>}
      </> : <>
        {trendPanel}
        <Box sx={{ minWidth: 0 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1.5, mb: 1.5 }}>
            <Box><Typography variant="h6" component="h2">Categorías mes a mes</Typography><Typography variant="body2" color="text.secondary">Todas las categorías · abre un importe para revisar sus movimientos.</Typography></Box>
            {ordering}
          </Box>
          <TableContainer component={Paper} variant="outlined" data-testid="expense-matrix" sx={{ maxWidth: '100%', maxHeight: 'min(65vh, 600px)', overflow: 'auto', boxShadow: 'none' }}>
            <Table stickyHeader size="small" aria-label="Gastos por categoría y mes" sx={{ '& th, & td': { px: 1.5, py: 1.2, fontVariantNumeric: 'tabular-nums' }, '& tr > :first-child': { position: 'sticky', left: 0, zIndex: 1, bgcolor: 'background.paper', borderRight: '1px solid', borderRightColor: 'divider' }, '& thead th': { bgcolor: 'background.paper' } }}>
              <TableHead><TableRow>
                <TableCell scope="col" sx={{ minWidth: 210, maxWidth: 260, zIndex: '3 !important' }}>Categoría</TableCell>
                {months.map((month) => <TableCell key={month.key} scope="col" align="right" sx={{ minWidth: 125 }}><Typography variant="body2" fontWeight={600} sx={{ whiteSpace: 'nowrap' }}>{month.label}</Typography><Typography variant="caption" color="text.secondary">{periodStatus[month.status]}</Typography></TableCell>)}
                <TableCell scope="col" align="right" sx={{ minWidth: 150 }}>Variación{previousMonth && <Typography variant="caption" component="p" color="text.secondary">{previousMonth.label} → {lastMonth?.label}</Typography>}</TableCell>
              </TableRow></TableHead>
              <TableBody>{ordered.map((category) => <TableRow key={category.id} hover>
                <TableCell component="th" scope="row"><Button variant="text" onClick={() => selectCategory(category.id)} aria-label={`Ver tendencia de ${category.name}`} sx={{ textAlign: 'left', justifyContent: 'flex-start', color: 'text.primary', minWidth: 0, width: '100%', p: 0, overflowWrap: 'anywhere', textTransform: 'none', fontWeight: selectedCategory?.id === category.id ? 700 : 400 }}>{category.name}</Button></TableCell>
                {months.map((month) => <TableCell key={month.key} align="right"><Button onClick={() => onOpenCell(category, month)} aria-label={`Ver movimientos de ${category.name} en ${month.label}`} variant="text" sx={{ color: 'text.primary', minWidth: 0, p: 0.5, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums', fontWeight: 400 }}>{formatCLP(category.values.find((value) => value.month === month.key)?.total ?? 0)}</Button></TableCell>)}
                <TableCell align="right"><Typography variant="body2" sx={{ whiteSpace: 'nowrap' }}>{moneyDelta(category.delta)}</Typography><Typography variant="caption" color="text.secondary">{percent(category.deltaPct)}</Typography></TableCell>
              </TableRow>)}</TableBody>
              <TableFooter><TableRow><TableCell component="th" scope="row" sx={{ fontWeight: 700, color: 'text.primary' }}>Total registrado</TableCell>{months.map((month) => <TableCell key={month.key} align="right" sx={{ color: 'text.primary', fontWeight: 700, whiteSpace: 'nowrap' }}>{formatCLP(month.total)}</TableCell>)}<TableCell align="right" sx={{ color: 'text.primary', whiteSpace: 'nowrap' }}>{moneyDelta(summary.delta)}</TableCell></TableRow></TableFooter>
            </Table>
          </TableContainer>
        </Box>
      </>}
    </Stack>
  );
}
