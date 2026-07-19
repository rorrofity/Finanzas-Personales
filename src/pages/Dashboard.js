import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Grid,
  Typography,
  Container,
  Alert,
  Button,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Stack,
  Card,
  CardContent,
  Skeleton,
  useTheme,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { useNavigate } from 'react-router-dom';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
  ResponsiveContainer,
  ComposedChart,
} from 'recharts';
import axios from '../config/axios';
import MonthPicker from '../components/MonthPicker';
import SyncButton from '../components/SyncButton';
import CategoryDetailDrawer from '../components/CategoryDetailDrawer';
import StatCard from '../components/ui/StatCard';
import SectionCard from '../components/ui/SectionCard';
import CategoryBar from '../components/ui/CategoryBar';
import ChartTabs from '../components/ui/ChartTabs';
import { usePeriod } from '../contexts/PeriodContext';
import { useOfflineContext } from '../contexts/OfflineContext';
import { fetchWithCache } from '../services/readCache';
import { formatCLP, formatCLPShort, formatPct } from '../utils/format';

const COLORS = [
  '#2196F3', '#4CAF50', '#FFC107', '#F44336', '#9C27B0',
  '#00BCD4', '#FF9800', '#795548', '#607D8B', '#E91E63',
];

const emptyOverview = {
  balance: { value: null }, gastos: { value: null }, ingresos: { value: null },
  tasaAhorro: null, burnRate: null, disponibleHoy: null,
  compromisos: { total: 0, tcNoFacturado: 0, cuotas: 0, intl: 0, proyectados: 0 },
  topCategorias: [],
};

const Dashboard = () => {
  const theme = useTheme();
  const navigate = useNavigate();
  const { year, month } = usePeriod();
  const { reconnectCount } = useOfflineContext();

  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState(emptyOverview);
  const [monthlyHistory, setMonthlyHistory] = useState([]);
  const [categoryEvolution, setCategoryEvolution] = useState({ data: [], categories: [] });
  const [error, setError] = useState(null);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerCategory, setDrawerCategory] = useState(null);
  const [drawerColor, setDrawerColor] = useState(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const ov = await fetchWithCache(
        `dashboard:overview:${year}-${month}`,
        async () => {
          const res = await axios.get('/api/dashboard/overview', { params: { year, month } });
          return res.data;
        }
      );
      setOverview(ov || emptyOverview);

      const history = await fetchWithCache(
        `dashboard:monthly-history:${year}-${month}`,
        async () => (await axios.get('/api/dashboard/monthly-history', { params: { months: 6 } })).data || []
      );
      setMonthlyHistory(history || []);

      const evo = await fetchWithCache(
        `dashboard:category-evolution:${year}-${month}`,
        async () => (await axios.get('/api/dashboard/category-evolution', { params: { months: 6 } })).data || { data: [], categories: [] }
      );
      setCategoryEvolution(evo || { data: [], categories: [] });
    } catch (err) {
      console.error('Error fetching dashboard data:', err);
      setError('Error al cargar datos del dashboard');
      setOverview(emptyOverview);
    } finally {
      setLoading(false);
    }
  }, [year, month]);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { if (reconnectCount > 0) fetchData(); }, [reconnectCount, fetchData]);

  const openCategoryDrawer = useCallback((categoryName, color) => {
    setDrawerCategory(categoryName);
    setDrawerColor(color || null);
    setDrawerOpen(true);
  }, []);

  const ov = overview || emptyOverview;
  const hasData = (ov.gastos?.value || 0) > 0 || (ov.ingresos?.value || 0) > 0;

  return (
    <Container maxWidth="lg" sx={{ py: { xs: 1.5, sm: 3 }, overflowX: 'hidden' }}>
      {/* Header compacto */}
      <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, justifyContent: 'space-between', alignItems: { xs: 'stretch', sm: 'center' }, gap: 1.5, mb: 2.5 }}>
        <Typography variant="h5" fontWeight={700} color="primary">Dashboard</Typography>
        <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, gap: 1, alignItems: { xs: 'stretch', sm: 'center' } }}>
          <MonthPicker />
          <SyncButton size="small" variant="outlined" />
        </Box>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {/* KPIs — stat-cards compactas (K1, K2, K3, K6) */}
      <Grid container spacing={1.5} sx={{ mb: 2.5 }}>
        <Grid item xs={6} md={3}>
          <StatCard label="Balance" value={ov.balance?.value} deltaPct={ov.balance?.deltaPct}
            positiveIsGood accent="primary.main" loading={loading} />
        </Grid>
        <Grid item xs={6} md={3}>
          <StatCard label="Gastos" value={ov.gastos?.value} deltaPct={ov.gastos?.deltaPct}
            positiveIsGood={false} accent="error.main" loading={loading} />
        </Grid>
        <Grid item xs={6} md={3}>
          <AhorroCard tasaAhorro={ov.tasaAhorro} loading={loading} />
        </Grid>
        <Grid item xs={6} md={3}>
          <StatCard label="Disponible hoy" value={ov.disponibleHoy} accent="success.main" loading={loading} />
        </Grid>
      </Grid>

      {!loading && !hasData && (
        <Alert severity="info" sx={{ mb: 2.5 }}
          action={<Button color="inherit" size="small" onClick={() => navigate('/transactions')}>Ir a transacciones</Button>}>
          Sin movimientos este período. Importar o sincronizar tus cargos para ver tus estadísticas.
        </Alert>
      )}

      {/* K5 — Compromisos próximos (colapsable) */}
      <Accordion disableGutters sx={{ mb: 2.5, borderRadius: 1, '&:before': { display: 'none' }, border: `1px solid ${theme.palette.divider}` }}>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', width: '100%', pr: 1 }}>
            <Typography variant="subtitle2" fontWeight={600}>Compromisos próximos</Typography>
            <Typography variant="subtitle2" fontWeight={700} color="warning.main">
              {formatCLP(ov.compromisos?.total || 0)}
            </Typography>
          </Box>
        </AccordionSummary>
        <AccordionDetails>
          <Stack spacing={1}>
            <CommitmentRow label="TC no facturado" value={ov.compromisos?.tcNoFacturado} />
            <CommitmentRow label="Cuotas del período" value={ov.compromisos?.cuotas} />
            {(ov.compromisos?.intl || 0) > 0 && <CommitmentRow label="Internacional" value={ov.compromisos?.intl} />}
            <CommitmentRow label="Gastos proyectados" value={ov.compromisos?.proyectados} />
          </Stack>
        </AccordionDetails>
      </Accordion>

      <Grid container spacing={2.5}>
        {/* K7 — En qué se va la plata (top categorías) */}
        <Grid item xs={12} md={6}>
          <SectionCard title="En qué se va la plata">
            {ov.topCategorias?.length > 0 ? (
              ov.topCategorias.map((c, idx) => (
                <CategoryBar key={c.name} name={c.name} total={c.total} pct={c.pct} deltaPct={c.deltaPct}
                  color={COLORS[idx % COLORS.length]}
                  onClick={() => openCategoryDrawer(c.name, COLORS[idx % COLORS.length])} />
              ))
            ) : (
              <Typography variant="body2" color="text.disabled" sx={{ py: 2, textAlign: 'center' }}>
                Sin gastos por categoría este período
              </Typography>
            )}
          </SectionCard>
        </Grid>

        {/* Gráficos bajo tabs (un solo gráfico visible) */}
        <Grid item xs={12} md={6}>
          <SectionCard title="Evolución">
            <ChartTabs tabs={[
              { label: 'Evolución', content: <FlowChart data={monthlyHistory} theme={theme} /> },
              { label: 'Por categoría', content: <CategoryEvoChart evo={categoryEvolution} theme={theme} /> },
            ]} />
          </SectionCard>
        </Grid>
      </Grid>

      <CategoryDetailDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        category={drawerCategory}
        year={year}
        month={month}
        color={drawerColor}
      />
    </Container>
  );
};

// K3 — Tasa de ahorro (formato %)
const AhorroCard = ({ tasaAhorro, loading }) => (
  <StatCardRaw label="Ahorro" text={tasaAhorro === null || tasaAhorro === undefined ? null : formatPct(tasaAhorro)}
    accent="secondary.main" loading={loading} />
);

// Variante de StatCard que muestra texto libre (no moneda)
const StatCardRaw = ({ label, text, accent, loading }) => (
  <Card variant="outlined" sx={{ height: '100%', borderLeft: '3px solid', borderLeftColor: accent, maxHeight: 96 }}>
    <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
      <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>{label}</Typography>
      {loading ? <Skeleton variant="text" width="60%" height={32} />
        : text === null ? <Typography variant="body2" color="text.disabled" sx={{ mt: 0.5 }}>Sin datos del período</Typography>
        : <Typography variant="h6" fontWeight={700}>{text}</Typography>}
    </CardContent>
  </Card>
);

const CommitmentRow = ({ label, value }) => (
  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
    <Typography variant="body2" color="text.secondary">{label}</Typography>
    <Typography variant="body2" fontWeight={600}>{formatCLP(value || 0)}</Typography>
  </Box>
);

const FlowChart = ({ data, theme }) => (
  <ResponsiveContainer width="100%" height={240}>
    <ComposedChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
      <CartesianGrid strokeDasharray="3 3" stroke={theme.palette.divider} />
      <XAxis dataKey="label" tick={{ fontSize: 10, fill: theme.palette.text.secondary }} />
      <YAxis tickFormatter={formatCLPShort} tick={{ fontSize: 10, fill: theme.palette.text.secondary }} width={44} />
      <RechartsTooltip formatter={(v, n) => [formatCLP(v), n]} />
      <Legend wrapperStyle={{ fontSize: 11 }} />
      <Bar dataKey="gastosTC" name="Gastos TC" stackId="g" fill={theme.palette.error.main} />
      <Bar dataKey="gastosCC" name="Gastos CC" stackId="g" fill={theme.palette.warning.main} radius={[3, 3, 0, 0]} />
      <Bar dataKey="ingresosCC" name="Ingresos CC" fill={theme.palette.success.main} radius={[3, 3, 0, 0]} />
    </ComposedChart>
  </ResponsiveContainer>
);

const CategoryEvoChart = ({ evo, theme }) => {
  if (!evo.data || evo.data.length === 0) {
    return <Box sx={{ height: 240, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Typography color="text.disabled" variant="body2">Sin datos de categorías</Typography>
    </Box>;
  }
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={evo.data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={theme.palette.divider} />
        <XAxis dataKey="label" tick={{ fontSize: 10, fill: theme.palette.text.secondary }} />
        <YAxis tickFormatter={formatCLPShort} tick={{ fontSize: 10, fill: theme.palette.text.secondary }} width={44} />
        <RechartsTooltip formatter={(v, n) => [formatCLP(v), n]} />
        {evo.categories.slice(0, 10).map((cat, idx) => (
          <Bar key={cat} dataKey={cat} name={cat} stackId="c" fill={COLORS[idx % COLORS.length]} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
};

export default Dashboard;
