import React, { useEffect, useMemo, useState } from 'react';
import {
  Accordion, AccordionDetails, AccordionSummary, Alert, Box, Button, Container,
  FormControl, Grid, InputLabel, NativeSelect, Skeleton, Stack, Typography,
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
import { formatCLP } from '../utils/format';

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
  const [overviewResult, setOverviewResult] = useState(null);
  const [overviewError, setOverviewError] = useState(false);
  const ownerId = activeSpace?.ownerId || user?.id;
  const userId = user?.id;
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
    setOverviewResult(null);
    setOverviewError(false);
    readExpenseLiquidity({ userId, ownerId, year, month }, { signal: controller.signal })
      .then((response) => { if (current) setOverviewResult(response); })
      .catch(() => { if (current && !controller.signal.aborted) setOverviewError(true); });
    return () => { current = false; controller.abort(); };
  }, [userId, ownerId, year, month, reconnectCount]);

  const nextPeriod = new Date(year, month, 1).toLocaleDateString('es-CL', { month: 'long', year: 'numeric' });
  const report = result?.data;
  const overview = overviewResult?.data;
  return (
    <Container maxWidth="lg" sx={{ py: { xs: 1.5, sm: 3 }, minWidth: 0 }}>
      <Stack spacing={3} sx={{ minWidth: 0 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: { xs: 'stretch', md: 'flex-start' }, flexDirection: { xs: 'column', md: 'row' }, gap: 2 }}>
          <Box><Typography component="h1" variant="h5" fontWeight={700}>Evolución de gastos</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>Tus categorías, mes a mes. Importes de movimientos ya registrados.</Typography></Box>
          <Box sx={{ minWidth: 0 }}><MonthPicker /><SyncButton size="small" variant="outlined" /></Box>
        </Box>

        <Box sx={{ display: 'flex', alignItems: { xs: 'stretch', sm: 'flex-end' }, flexDirection: { xs: 'column', sm: 'row' }, gap: 2 }}>
          <FormControl variant="outlined" size="small" sx={{ minWidth: { xs: 0, sm: 150 } }}>
            <InputLabel htmlFor="expense-window" shrink>Ventana</InputLabel>
            <NativeSelect disableUnderline value={months} onChange={(event) => setMonths(Number(event.target.value))} inputProps={{ id: 'expense-window', 'aria-label': 'Ventana' }} sx={{ px: 1.5, pt: 1 }}>
              <option value={3}>3 meses</option><option value={6}>6 meses</option><option value={12}>12 meses</option>
            </NativeSelect>
          </FormControl>
          <FormControl variant="outlined" size="small" sx={{ minWidth: { xs: 0, sm: 230 }, maxWidth: '100%' }}>
            <InputLabel htmlFor="expense-source" shrink>Fuente</InputLabel>
            <NativeSelect disableUnderline value={source} onChange={(event) => setSource(event.target.value)} inputProps={{ id: 'expense-source', 'aria-label': 'Fuente' }} sx={{ px: 1.5, pt: 1 }}>
              {Object.entries(SOURCES).map(([value, config]) => <option key={value} value={value}>{config.label}</option>)}
            </NativeSelect>
          </FormControl>
          <Typography variant="body2" color="text.secondary">Base temporal: <strong>Facturación</strong></Typography>
        </Box>

        {error && <Alert severity="error" action={<Button color="inherit" onClick={() => setRetry((value) => value + 1)}>Reintentar</Button>}>{error}</Alert>}
        {loading && <Box aria-label="Cargando evolución de gastos" aria-busy="true"><Grid container spacing={2}>{[0, 1, 2].map((key) => <Grid item xs={12} sm={4} key={key}><Skeleton height={70} /></Grid>)}</Grid><Skeleton variant="rounded" height={260} sx={{ mt: 2 }} /><Skeleton variant="rounded" height={220} sx={{ mt: 2 }} /></Box>}
        {!loading && report && <>
          {result.origin === 'cache' && <Alert severity="info">Mostrando una consulta guardada del {new Date(result.cachedAt).toLocaleString('es-CL')}. {isOffline ? 'Sin conexión.' : 'No se pudo actualizar.'}</Alert>}
          <Typography variant="caption" color="text.secondary">Consultado: {new Date(report.generatedAt || result.cachedAt).toLocaleString('es-CL')}</Typography>
          <ExpenseExplorer report={report} onOpenCell={(category, selectedMonth) => setSelection({ category, month: selectedMonth })} />
        </>}

        <Box sx={{ borderTop: '1px solid', borderTopColor: 'divider', pt: 2 }}>
          <Typography component="h2" variant="subtitle1" fontWeight={600} sx={{ mb: 1 }}>Liquidez y compromisos</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>Información complementaria. Los compromisos son proyecciones y no se suman a los gastos de la tabla.</Typography>
          {overviewError && <Typography variant="body2" color="text.secondary">No se pudo actualizar la información de liquidez.</Typography>}
          {overview && <>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>Liquidez consultada: {new Date(overviewResult.cachedAt).toLocaleString('es-CL')}</Typography>
            {overviewResult.origin === 'cache' && <Alert severity="info" sx={{ mb: 1.5 }}>Consulta guardada de liquidez; no se pudo actualizar. {isOffline ? 'Sin conexión.' : 'Los importes corresponden a la fecha de consulta indicada.'}</Alert>}
            <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1.5, flexWrap: 'wrap', mb: 1.5 }}><Typography variant="body2">Disponible hoy</Typography><Typography variant="body1" fontWeight={600}>{formatCLP(overview.disponibleHoy)}</Typography></Box>
            <Accordion disableGutters elevation={0} sx={{ border: '1px solid', borderColor: 'divider', '&:before': { display: 'none' }, boxShadow: 'none' }}>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}><Box sx={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1, width: '100%', pr: 1 }}><Typography variant="body2" fontWeight={600}>Compromisos próximos</Typography><Typography variant="body2" fontWeight={600}>{formatCLP(overview.compromisos?.total || 0)}</Typography></Box></AccordionSummary>
              <AccordionDetails><Stack spacing={1}><Typography variant="caption" color="text.secondary">Proyección para {nextPeriod}</Typography><CommitmentRow label="TC no facturado" value={overview.compromisos?.tcNoFacturado} /><CommitmentRow label="Cuotas del período" value={overview.compromisos?.cuotas} /><CommitmentRow label="Internacional" value={overview.compromisos?.intl} /><CommitmentRow label="Gastos proyectados" value={overview.compromisos?.proyectados} /></Stack></AccordionDetails>
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
  return <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, flexWrap: 'wrap' }}><Typography variant="body2" color="text.secondary">{label}</Typography><Typography variant="body2">{formatCLP(value || 0)}</Typography></Box>;
}
