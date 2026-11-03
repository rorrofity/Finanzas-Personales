import React, { useEffect, useMemo, useState } from 'react';
import {
  Accordion, AccordionDetails, AccordionSummary, Alert, Box, Button, Container,
  FormControl, InputLabel, Select, Skeleton, Stack, Typography,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { Link as RouterLink } from 'react-router-dom';
import MonthPicker from '../components/MonthPicker';
import SyncButton from '../components/SyncButton';
import ExpenseExplorer from '../components/dashboard/ExpenseExplorer';
import ExpenseDetailDrawer from '../components/dashboard/ExpenseDetailDrawer';
import { usePeriod } from '../contexts/PeriodContext';
import { useOfflineContext } from '../contexts/OfflineContext';
import { useAuth } from '../contexts/AuthContext';
import { useSpace } from '../contexts/SpaceContext';
import { readExpenseLiquidity, readExpenseReport } from '../services/expenseEvolution';
import { formatCLPExact as formatCLP } from '../utils/format';
import useFinancialAutoRefresh from '../hooks/useFinancialAutoRefresh';

const knownAmount = value => (typeof value === 'number' || (typeof value === 'string' && /^-?\d+(?:\.\d{1,2})?$/.test(value))) && Number.isFinite(Number(value));
const bankDate = value => value && Number.isFinite(Date.parse(value)) ? new Intl.DateTimeFormat('es-CL', { timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(value)) : 'Sin fecha disponible';

const SOURCES = {
  tc_nacional: { label: 'Tarjetas nacionales', values: ['tc_nacional'] },
  tc_internacional: { label: 'Tarjetas internacionales', values: ['tc_internacional'] },
  cuenta_corriente: { label: 'Cuenta corriente', values: ['cuenta_corriente'] },
  all: { label: 'Todas las fuentes', values: ['tc_nacional', 'tc_internacional', 'cuenta_corriente'] },
};

export default function Dashboard() {
  const { year, month } = usePeriod();
  const { reconnectCount, isOffline } = useOfflineContext();
  const { user } = useAuth();
  const { activeSpace } = useSpace();
  const [months, setMonths] = useState(6);
  const [source, setSource] = useState('tc_nacional');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [retry, setRetry] = useState(0);
  const [selection, setSelection] = useState(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  const [overviewResult, setOverviewResult] = useState(null);
  const [overviewError, setOverviewError] = useState(false);
  const [liquidityRefresh, setLiquidityRefresh] = useState(0);
  const ownerId = activeSpace?.ownerId || user?.id;
  const userId = user?.id;
  const overviewScope = `${userId || ''}:${ownerId || ''}:${year}:${month}`;
  useFinancialAutoRefresh(() => { setLiquidityRefresh(value => value + 1); setRetry(value => value + 1); }, { enabled: Boolean(userId && ownerId) });
  const scope = useMemo(() => ({ userId, ownerId, endYear: year, endMonth: month, months, sources: SOURCES[source].values }), [userId, ownerId, year, month, months, source]);

  useEffect(() => {
    let current = true;
    const controller = new AbortController();
    setLoading(true);
    setResult(null);
    setSelection(null);
    setError(null);
    readExpenseReport(scope, { signal: controller.signal })
      .then((response) => { if (current) setResult(response); })
      .catch((failure) => { if (current && !controller.signal.aborted) setError(failure.code === 'OFFLINE_MISS' ? failure.message : 'No pudimos cargar la evolución de gastos. Comprueba tu conexión y vuelve a intentarlo.'); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; controller.abort(); };
  }, [scope, reconnectCount, retry]);

  useEffect(() => {
    let current = true;
    const controller = new AbortController();
    setOverviewResult(previous => previous?.scopeKey === overviewScope ? previous : null);
    setOverviewError(false);
    readExpenseLiquidity({ userId, ownerId, year, month }, { signal: controller.signal })
      .then((response) => { if (current) setOverviewResult({ ...response, scopeKey: overviewScope }); })
      .catch(() => { if (current && !controller.signal.aborted) setOverviewError(true); });
    return () => { current = false; controller.abort(); };
  }, [userId, ownerId, year, month, reconnectCount, liquidityRefresh, overviewScope]);

  const nextPeriod = new Date(year, month, 1).toLocaleDateString('es-CL', { month: 'long', year: 'numeric' });
  const report = result?.data;
  const overview = overviewResult?.scopeKey === overviewScope ? overviewResult.data : null;
  const bank = overview?.checking;
  const bankAvailable = bank?.source === 'fintoc' && bank?.state === 'available' && knownAmount(bank.amount);
  const bankVerified = bankAvailable && bank.freshness === 'current' && overviewResult?.origin !== 'cache' && !overviewError && !isOffline;
  const pendingConversions = Number.isSafeInteger(overview?.compromisos?.conversionPendingCount) && overview.compromisos.conversionPendingCount > 0 ? overview.compromisos.conversionPendingCount : 0;
  const amountsPartial = overview?.compromisos?.amountsPartial === true || pendingConversions > 0;
  return (
    <Container maxWidth="lg" sx={{ py: { xs: 1.5, md: 3 }, minWidth: 0 }}>
      <Stack spacing={{ xs: 2, md: 3 }} sx={{ minWidth: 0 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 1 }}>
          <Box sx={{ minWidth: 0 }}><Typography component="h1" variant="h5" fontWeight={700}>Evolución de gastos</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: 0.75, display: { xs: 'none', md: 'block' } }}>Tus categorías, mes a mes.</Typography></Box>
          <Box sx={{ display: { xs: 'none', md: 'block' }, flexShrink: 0 }}><SyncButton size="small" variant="outlined" /></Box>
        </Box>

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr) 96px', md: 'minmax(260px, 1fr) minmax(220px, 260px) 140px' }, gap: { xs: 1.25, md: 2 }, alignItems: 'center' }}>
          <Box sx={{ gridColumn: { xs: '1 / -1', md: 'auto' }, minWidth: 0, '& > .MuiBox-root': { mb: 0 }, '& > .MuiBox-root > .MuiTypography-root': { display: 'none' } }}><MonthPicker /></Box>
          <FormControl variant="outlined" size="small" sx={{ minWidth: 0 }}>
            <InputLabel htmlFor="expense-source">Fuente</InputLabel>
            <Select native value={source} label="Fuente" onChange={(event) => setSource(event.target.value)} inputProps={{ id: 'expense-source', 'aria-label': 'Fuente' }} sx={{ minHeight: 44, '& select': { pl: 1.25, pr: '24px !important' } }}>
              {Object.entries(SOURCES).map(([value, config]) => <option key={value} value={value}>{config.label}</option>)}
            </Select>
          </FormControl>
          <FormControl variant="outlined" size="small" sx={{ minWidth: 0 }}>
            <InputLabel htmlFor="expense-window">Ventana</InputLabel>
            <Select native value={months} label="Ventana" onChange={(event) => setMonths(Number(event.target.value))} inputProps={{ id: 'expense-window', 'aria-label': 'Ventana' }} sx={{ minHeight: 44, '& select': { pl: 1.25, pr: '24px !important' } }}>
              <option value={3}>3 meses</option><option value={6}>6 meses</option><option value={12}>12 meses</option>
            </Select>
          </FormControl>
        </Box>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
          <Typography variant="caption" color="text.secondary">Base temporal: <strong>Facturación</strong></Typography>
          <Box sx={{ display: { xs: 'block', md: 'none' }, '& .MuiButton-root': { minWidth: 0 } }}><SyncButton size="small" variant="outlined" /></Box>
        </Box>

        {error && <Alert severity="error" action={<Button color="inherit" onClick={() => setRetry((value) => value + 1)}>Reintentar</Button>}>{error}</Alert>}
        {loading && <Box aria-label="Cargando evolución de gastos" aria-busy="true"><Skeleton variant="rounded" height={140} /><Skeleton variant="rounded" height={80} sx={{ mt: 2 }} /><Skeleton variant="rounded" height={220} sx={{ mt: 2 }} /></Box>}
        {!loading && report && <>
          {result.origin === 'cache' && <Alert severity="info">Mostrando una consulta guardada del {new Date(result.cachedAt).toLocaleString('es-CL')}. {isOffline ? 'Sin conexión.' : 'No se pudo actualizar.'}</Alert>}
          <ExpenseExplorer report={report} selectedCategoryId={selectedCategoryId} onSelectedCategoryChange={setSelectedCategoryId} onOpenCell={(category, selectedMonth) => setSelection({ category, month: selectedMonth })} />
        </>}

        <Box sx={{ borderTop: '1px solid', borderTopColor: 'divider', pt: 2 }}>
          <Typography component="h2" variant="subtitle1" fontWeight={600} sx={{ mb: 1 }}>Liquidez y compromisos</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>Información complementaria. Los compromisos son proyecciones y no se suman a los gastos de la tabla.</Typography>
          {overviewError && <Typography variant="body2" color="text.secondary">No se pudo actualizar la información de liquidez.</Typography>}
          {overview && <>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>Liquidez consultada: {new Date(overviewResult.cachedAt).toLocaleString('es-CL')}</Typography>
            {overviewResult.origin === 'cache' && <Alert severity="info" sx={{ mb: 1.5 }}>Consulta guardada de liquidez; no se pudo actualizar. {isOffline ? 'Sin conexión.' : 'Los importes corresponden a la fecha de consulta indicada.'}</Alert>}
            {amountsPartial && <Alert severity="warning" data-testid="liquidity-partial-warning" sx={{ mb: 1.5 }}>{pendingConversions > 0 ? `${pendingConversions} ${pendingConversions === 1 ? 'movimiento' : 'movimientos'} USD sin conversión.` : 'Hay información pendiente de verificar.'} Los compromisos en CLP son parciales.</Alert>}
            <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1.5, flexWrap: 'wrap', mb: 1 }}><Typography variant="body2">{bankVerified ? 'Disponible hoy' : bankAvailable ? 'Último saldo bancario conocido' : 'Saldo bancario no disponible'}</Typography><Typography variant="body1" fontWeight={600}>{bankAvailable ? formatCLP(bank.amount) : 'Sin verificar'}</Typography></Box>
            {bankAvailable && <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>Actualización bancaria: {bankDate(bank.bankUpdatedAt)} · Consulta del saldo: {bankDate(bank.queriedAt)}</Typography>}
            {bankAvailable && !bankVerified && <Alert severity="warning" sx={{ mb: 1.5 }}>El saldo mostrado es el último dato bancario guardado; su vigencia actual no está confirmada.</Alert>}
            <Accordion disableGutters elevation={0} sx={{ border: '1px solid', borderColor: 'divider', '&:before': { display: 'none' }, boxShadow: 'none' }}>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}><Box sx={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1, width: '100%', pr: 1 }}><Typography variant="body2" fontWeight={600}>Compromisos próximos{amountsPartial ? ' · importe parcial' : ''}</Typography><Typography variant="body2" fontWeight={600}>{knownAmount(overview.compromisos?.total) ? formatCLP(overview.compromisos.total) : 'No disponible'}</Typography></Box></AccordionSummary>
              <AccordionDetails><Stack spacing={1}><Typography variant="caption" color="text.secondary">Proyección para {nextPeriod}</Typography><CommitmentRow label="TC no facturado" value={overview.compromisos?.tcNoFacturado} /><CommitmentRow label="Cuotas del período" value={overview.compromisos?.cuotas} /><CommitmentRow label={amountsPartial ? 'Internacional · importe parcial' : 'Internacional'} value={overview.compromisos?.intl} /><CommitmentRow label="Gastos proyectados" value={overview.compromisos?.proyectados} /></Stack></AccordionDetails>
            </Accordion>
          </>}
          <Button component={RouterLink} to="/financial-health" sx={{ mt: 1 }}>Ver salud financiera</Button>
        </Box>
      </Stack>
      <ExpenseDetailDrawer key={selection ? `${selection.category.id}:${selection.month.key}` : 'closed'} selection={selection} scope={scope} onClose={() => setSelection(null)} />
    </Container>
  );
}

function CommitmentRow({ label, value }) {
  return <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, flexWrap: 'wrap' }}><Typography variant="body2" color="text.secondary">{label}</Typography><Typography variant="body2">{knownAmount(value) ? formatCLP(value) : 'No disponible'}</Typography></Box>;
}
