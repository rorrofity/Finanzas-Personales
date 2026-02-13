import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Grid,
  Paper,
  Typography,
  CircularProgress,
  Card,
  CardContent,
  useTheme,
  Container,
  Alert,
  LinearProgress,
  Tooltip,
} from '@mui/material';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
  ResponsiveContainer,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  ComposedChart,
  Area,
  Sector,
} from 'recharts';
import axios from 'axios';
import MonthPicker from '../components/MonthPicker';
import SyncButton from '../components/SyncButton';
import CategoryDetailDrawer from '../components/CategoryDetailDrawer';
import { usePeriod } from '../contexts/PeriodContext';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import CreditCardIcon from '@mui/icons-material/CreditCard';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import BalanceIcon from '@mui/icons-material/Balance';

const COLORS = [
  '#2196F3', '#4CAF50', '#FFC107', '#F44336', '#9C27B0',
  '#00BCD4', '#FF9800', '#795548', '#607D8B', '#E91E63'
];

const Dashboard = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [monthlyHistory, setMonthlyHistory] = useState([]);
  const [categoryBreakdown, setCategoryBreakdown] = useState([]);
  const [categoryEvolution, setCategoryEvolution] = useState({ data: [], categories: [] });
  const [currentMonthData, setCurrentMonthData] = useState(null);
  const theme = useTheme();
  const { year, month, setYear, setMonth } = usePeriod();

  // Drawer state
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerCategory, setDrawerCategory] = useState(null);
  const [drawerYear, setDrawerYear] = useState(null);
  const [drawerMonth, setDrawerMonth] = useState(null);
  const [drawerColor, setDrawerColor] = useState(null);

  // Pie chart active sector
  const [activePieIndex, setActivePieIndex] = useState(-1);

  const formatCurrency = (amount) => {
    if (amount === undefined || amount === null) return '$0';
    const num = typeof amount === 'string' ? parseFloat(amount) : amount;
    return new Intl.NumberFormat('es-CL', {
      style: 'currency',
      currency: 'CLP',
      maximumFractionDigits: 0
    }).format(num);
  };

  const formatCurrencyShort = (value) => {
    if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`;
    return `$${value}`;
  };

  useEffect(() => {
    fetchData();
  }, [year, month]);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch monthly history (last 6 months)
      const histRes = await axios.get('/api/dashboard/monthly-history', { params: { months: 6 } });
      const history = histRes.data || [];
      setMonthlyHistory(history);

      // Find current month data from history
      const current = history.find(h => h.year === year && h.month === month);
      setCurrentMonthData(current || { gastosTC: 0, gastosCC: 0, ingresosCC: 0, balance: 0 });

      // Fetch category breakdown for selected month
      const catRes = await axios.get('/api/dashboard/categories', {
        params: { periodYear: year, periodMonth: month, mode: 'monthly' }
      });
      const cats = (catRes.data || [])
        .filter(c => c.total > 0)
        .sort((a, b) => b.total - a.total);
      setCategoryBreakdown(cats);

      // Fetch category evolution (last 6 months)
      const catEvoRes = await axios.get('/api/dashboard/category-evolution', { params: { months: 6 } });
      setCategoryEvolution(catEvoRes.data || { data: [], categories: [] });

    } catch (err) {
      console.error('Error fetching dashboard data:', err);
      setError('Error al cargar datos del dashboard');
    } finally {
      setLoading(false);
    }
  };

  // Summary Card Component
  const SummaryCard = ({ title, value, icon: Icon, color, subtitle }) => (
    <Card 
      elevation={2}
      sx={{ 
        height: '100%',
        transition: 'transform 0.2s, box-shadow 0.2s',
        '&:hover': { transform: 'translateY(-4px)', boxShadow: 4 }
      }}
    >
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
          <Icon sx={{ color, mr: 1, fontSize: 28 }} />
          <Typography variant="body2" color="text.secondary" fontWeight={500}>
            {title}
          </Typography>
        </Box>
        <Typography variant="h4" fontWeight={700} color={color} sx={{ mb: 0.5 }}>
          {formatCurrency(value)}
        </Typography>
        {subtitle && (
          <Typography variant="caption" color="text.secondary">
            {subtitle}
          </Typography>
        )}
      </CardContent>
    </Card>
  );

  // Open the category detail drawer
  const openCategoryDrawer = useCallback((categoryName, targetYear, targetMonth, color) => {
    setDrawerCategory(categoryName);
    setDrawerYear(targetYear || year);
    setDrawerMonth(targetMonth || month);
    setDrawerColor(color || null);
    setDrawerOpen(true);
  }, [year, month]);

  // Handle click on history bar — navigate to that month
  const handleHistoryBarClick = useCallback((data) => {
    if (data && data.activePayload && data.activePayload.length > 0) {
      const payload = data.activePayload[0].payload;
      if (payload.year && payload.month) {
        setYear(payload.year);
        setMonth(payload.month);
      }
    }
  }, [setYear, setMonth]);

  // Handle click on category evolution bar
  const handleCategoryEvoClick = useCallback((data, catName, catColor) => {
    if (data && data.year && data.month) {
      openCategoryDrawer(catName, data.year, data.month, catColor);
    }
  }, [openCategoryDrawer]);

  // Active pie sector renderer for hover effect
  const renderActiveShape = (props) => {
    const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill } = props;
    return (
      <g>
        <Sector
          cx={cx} cy={cy}
          innerRadius={innerRadius - 2}
          outerRadius={outerRadius + 6}
          startAngle={startAngle}
          endAngle={endAngle}
          fill={fill}
        />
      </g>
    );
  };

  if (loading) {
    return (
      <Container maxWidth="xl" sx={{ py: 4 }}>
        <Box display="flex" justifyContent="center" alignItems="center" minHeight={400}>
          <CircularProgress size={60} />
        </Box>
      </Container>
    );
  }

  if (error) {
    return (
      <Container maxWidth="xl" sx={{ py: 4 }}>
        <Alert severity="error">{error}</Alert>
      </Container>
    );
  }

  const totalGastosCategoria = categoryBreakdown.reduce((sum, c) => sum + c.total, 0);

  return (
    <Container maxWidth="xl" sx={{ py: 3 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4" fontWeight={700} color="primary">
          Dashboard
        </Typography>
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
          <MonthPicker />
          <SyncButton />
        </Box>
      </Box>

      {/* Resumen del Mes */}
      <Typography variant="h6" fontWeight={600} sx={{ mb: 2, color: 'text.secondary' }}>
        Resumen del Mes
      </Typography>
      <Grid container spacing={2} sx={{ mb: 4 }}>
        <Grid item xs={6} md={3}>
          <SummaryCard
            title="Gastos TC"
            value={currentMonthData?.gastosTC || 0}
            icon={CreditCardIcon}
            color={theme.palette.error.main}
            subtitle="Tarjeta de crédito"
          />
        </Grid>
        <Grid item xs={6} md={3}>
          <SummaryCard
            title="Gastos CC"
            value={currentMonthData?.gastosCC || 0}
            icon={AccountBalanceIcon}
            color={theme.palette.warning.main}
            subtitle="Cuenta corriente"
          />
        </Grid>
        <Grid item xs={6} md={3}>
          <SummaryCard
            title="Ingresos CC"
            value={currentMonthData?.ingresosCC || 0}
            icon={AccountBalanceWalletIcon}
            color={theme.palette.success.main}
            subtitle="Cuenta corriente"
          />
        </Grid>
        <Grid item xs={6} md={3}>
          <SummaryCard
            title="Balance"
            value={currentMonthData?.balance || 0}
            icon={BalanceIcon}
            color={(currentMonthData?.balance || 0) >= 0 ? theme.palette.success.main : theme.palette.error.main}
            subtitle="Ingresos - Gastos"
          />
        </Grid>
      </Grid>

      {/* Evolución Histórica */}
      <Typography variant="h6" fontWeight={600} sx={{ mb: 2, color: 'text.secondary' }}>
        Evolución Histórica (últimos 6 meses)
      </Typography>
      <Paper elevation={2} sx={{ p: 3, mb: 4 }}>
        <ResponsiveContainer width="100%" height={350}>
          <ComposedChart
            data={monthlyHistory}
            margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
            onClick={handleHistoryBarClick}
            style={{ cursor: 'pointer' }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke={theme.palette.divider} />
            <XAxis 
              dataKey="label" 
              tick={{ fontSize: 12, fill: theme.palette.text.secondary }}
            />
            <YAxis 
              tickFormatter={formatCurrencyShort}
              tick={{ fontSize: 11, fill: theme.palette.text.secondary }}
            />
            <RechartsTooltip
              formatter={(value, name) => [formatCurrency(value), name]}
              contentStyle={{
                backgroundColor: theme.palette.background.paper,
                border: `1px solid ${theme.palette.divider}`,
                borderRadius: 8
              }}
            />
            <Legend />
            <Bar 
              dataKey="gastosTC" 
              name="Gastos TC" 
              stackId="gastos"
              fill={theme.palette.error.main}
              radius={[0, 0, 0, 0]}
            />
            <Bar 
              dataKey="gastosCC" 
              name="Gastos CC" 
              stackId="gastos"
              fill={theme.palette.warning.main}
              radius={[4, 4, 0, 0]}
            />
            <Bar 
              dataKey="ingresosCC" 
              name="Ingresos CC" 
              fill={theme.palette.success.main}
              radius={[4, 4, 0, 0]}
            />
          </ComposedChart>
        </ResponsiveContainer>
        <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block', textAlign: 'center' }}>
          Haz clic en un mes para navegar
        </Typography>
      </Paper>

      {/* Evolución de Gastos por Categoría */}
      <Typography variant="h6" fontWeight={600} sx={{ mb: 2, color: 'text.secondary' }}>
        Evolución de Gastos por Categoría
      </Typography>
      <Paper elevation={2} sx={{ p: 3, mb: 4 }}>
        {categoryEvolution.data.length > 0 ? (
          <ResponsiveContainer width="100%" height={350}>
            <BarChart data={categoryEvolution.data} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={theme.palette.divider} />
              <XAxis 
                dataKey="label" 
                tick={{ fontSize: 12, fill: theme.palette.text.secondary }}
              />
              <YAxis 
                tickFormatter={formatCurrencyShort}
                tick={{ fontSize: 11, fill: theme.palette.text.secondary }}
              />
              <RechartsTooltip
                formatter={(value, name) => [formatCurrency(value), name]}
                contentStyle={{
                  backgroundColor: theme.palette.background.paper,
                  border: `1px solid ${theme.palette.divider}`,
                  borderRadius: 8
                }}
              />
              <Legend />
              {categoryEvolution.categories.slice(0, 10).map((cat, idx) => (
                <Bar 
                  key={cat}
                  dataKey={cat} 
                  name={cat}
                  stackId="categories"
                  fill={COLORS[idx % COLORS.length]}
                  cursor="pointer"
                  onClick={(data) => handleCategoryEvoClick(data, cat, COLORS[idx % COLORS.length])}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 300 }}>
            <Typography color="text.secondary">Sin datos de categorías</Typography>
          </Box>
        )}
      </Paper>

      {/* Categorías y Balance */}
      <Grid container spacing={3}>
        {/* Pie Chart Categorías */}
        <Grid item xs={12} md={6}>
          <Paper elevation={2} sx={{ p: 3, minHeight: 450, display: 'flex', flexDirection: 'column' }}>
            <Typography variant="h6" fontWeight={600} sx={{ mb: 1 }}>
              Categorías del Mes
            </Typography>
            {categoryBreakdown.length > 0 ? (
              <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, gap: 1 }}>
                {/* Pie Chart — clickable */}
                <Box sx={{ width: '100%', display: 'flex', justifyContent: 'center' }}>
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie
                        data={categoryBreakdown}
                        dataKey="total"
                        nameKey="categoria"
                        cx="50%"
                        cy="50%"
                        outerRadius={80}
                        innerRadius={40}
                        activeIndex={activePieIndex}
                        activeShape={renderActiveShape}
                        onMouseEnter={(_, index) => setActivePieIndex(index)}
                        onMouseLeave={() => setActivePieIndex(-1)}
                        onClick={(_, index) => {
                          const cat = categoryBreakdown[index];
                          if (cat) openCategoryDrawer(cat.categoria, year, month, COLORS[index % COLORS.length]);
                        }}
                        cursor="pointer"
                      >
                        {categoryBreakdown.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <RechartsTooltip
                        formatter={(value, name) => [formatCurrency(value), name]}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </Box>
                {/* Lista de TODAS las categorías con progress bar */}
                <Box sx={{ overflow: 'auto', maxHeight: 300 }}>
                  {categoryBreakdown.map((cat, idx) => {
                    const pct = totalGastosCategoria > 0 ? (cat.total / totalGastosCategoria) * 100 : 0;
                    const color = COLORS[idx % COLORS.length];
                    return (
                      <Tooltip key={idx} title="Clic para ver transacciones" arrow placement="left">
                        <Box
                          onClick={() => openCategoryDrawer(cat.categoria, year, month, color)}
                          sx={{
                            display: 'flex',
                            flexDirection: 'column',
                            py: 0.75,
                            px: 1,
                            borderRadius: 1,
                            cursor: 'pointer',
                            transition: 'background-color 0.15s',
                            '&:hover': { bgcolor: theme.palette.action.hover },
                            borderBottom: `1px solid ${theme.palette.divider}`,
                          }}
                        >
                          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.25 }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', minWidth: 0 }}>
                              <Box
                                sx={{
                                  width: 10, height: 10, borderRadius: '50%',
                                  bgcolor: color, mr: 1, flexShrink: 0
                                }}
                              />
                              <Typography variant="body2" noWrap sx={{ fontSize: '0.85rem' }}>
                                {cat.categoria}
                              </Typography>
                            </Box>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0 }}>
                              <Typography variant="caption" color="text.secondary">
                                {pct.toFixed(0)}%
                              </Typography>
                              <Typography variant="body2" fontWeight={600} sx={{ fontSize: '0.85rem' }}>
                                {formatCurrency(cat.total)}
                              </Typography>
                            </Box>
                          </Box>
                          <LinearProgress
                            variant="determinate"
                            value={pct}
                            sx={{
                              height: 4, borderRadius: 2,
                              bgcolor: theme.palette.action.hover,
                              '& .MuiLinearProgress-bar': { bgcolor: color, borderRadius: 2 }
                            }}
                          />
                        </Box>
                      </Tooltip>
                    );
                  })}
                </Box>
              </Box>
            ) : (
              <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flex: 1 }}>
                <Typography color="text.secondary">Sin datos de categorías este mes</Typography>
              </Box>
            )}
          </Paper>
        </Grid>

        {/* Gráfico Balance Mensual */}
        <Grid item xs={12} md={6}>
          <Paper elevation={2} sx={{ p: 3, height: 400 }}>
            <Typography variant="h6" fontWeight={600} sx={{ mb: 2 }}>
              Balance Mensual
            </Typography>
            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart data={monthlyHistory} margin={{ top: 20, right: 20, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={theme.palette.divider} />
                <XAxis 
                  dataKey="monthName" 
                  tick={{ fontSize: 12, fill: theme.palette.text.secondary }}
                />
                <YAxis 
                  tickFormatter={formatCurrencyShort}
                  tick={{ fontSize: 11, fill: theme.palette.text.secondary }}
                />
                <RechartsTooltip
                  formatter={(value, name) => [formatCurrency(value), name]}
                  contentStyle={{
                    backgroundColor: theme.palette.background.paper,
                    border: `1px solid ${theme.palette.divider}`,
                    borderRadius: 8
                  }}
                />
                <defs>
                  <linearGradient id="balanceGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={theme.palette.primary.main} stopOpacity={0.3}/>
                    <stop offset="95%" stopColor={theme.palette.primary.main} stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <Area
                  type="monotone"
                  dataKey="balance"
                  name="Balance"
                  stroke={theme.palette.primary.main}
                  fill="url(#balanceGradient)"
                  strokeWidth={2}
                />
                <Line
                  type="monotone"
                  dataKey="balance"
                  name="Balance"
                  stroke={theme.palette.primary.main}
                  strokeWidth={3}
                  dot={{ fill: theme.palette.primary.main, strokeWidth: 2, r: 5 }}
                  activeDot={{ r: 8 }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </Paper>
        </Grid>
      </Grid>

      {/* Footer */}
      <Box mt={3} textAlign="center">
        <Typography variant="caption" color="text.secondary">
          Datos: TC no facturadas + Cuenta Corriente del mes
        </Typography>
      </Box>

      {/* Category Detail Drawer */}
      <CategoryDetailDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        category={drawerCategory}
        year={drawerYear}
        month={drawerMonth}
        color={drawerColor}
      />
    </Container>
  );
};

export default Dashboard;
