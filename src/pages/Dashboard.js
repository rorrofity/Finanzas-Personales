import React, { useState, useEffect } from 'react';
import {
  Box,
  Grid,
  Paper,
  Typography,
  CircularProgress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Card,
  CardContent,
  useTheme,
  Container,
  Tooltip
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
  Treemap,
  PieChart,
  Pie,
  Cell
} from 'recharts';
import axios from 'axios';
import MonthPicker from '../components/MonthPicker';
import { usePeriod } from '../contexts/PeriodContext';
import { alpha } from '@mui/material/styles';
import { useNavigate } from 'react-router-dom';

const COLORS = [
  '#2196F3', // azul
  '#4CAF50', // verde
  '#FFC107', // amarillo
  '#F44336', // rojo
  '#9C27B0', // morado
  '#00BCD4', // cyan
  '#FF9800', // naranja
  '#795548', // marrón
  '#607D8B', // gris azulado
  '#E91E63', // rosa
];

// Brand styles for credit cards
const CARD_BRANDS = {
  visa: {
    color: '#1A1F71', // Visa deep blue
    logo: '/assets/cards/visa.png'
  },
  mastercard: {
    color: '#EB001B', // MasterCard red (we'll blend with orange via gradient-like alpha)
    logo: '/assets/cards/mastercard.png'
  }
};

const Dashboard = () => {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const theme = useTheme();
  const navigate = useNavigate();
  const { startISO, endISO, label, year, month } = usePeriod();

  const formatCurrency = (amount) => {
    if (amount === undefined || amount === null) {
      return '$0';
    }
    const num = typeof amount === 'string' ? parseFloat(amount) : amount;
    return new Intl.NumberFormat('es-CL', {
      style: 'currency',
      currency: 'CLP'
    }).format(num);
  };

  useEffect(() => {
    fetchDashboardData();
  }, [year, month]);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      setError(null);
      // Corregir fechas (si aplica) y luego cargar summary y transacciones del período
      try {
        await axios.post('/api/transactions/fix-dates');
      } catch (e) {
        console.warn('fix-dates no disponible, continuando:', e?.response?.status || e?.message);
      }
      const startDate = startISO?.slice(0, 10);
      const endDate = endISO?.slice(0, 10);
      const periodYear = year;
      const periodMonth = month;
      // Obtener summary (tolerante a errores) y transacciones del período
      let summaryData = { gastos: 0, ingresos: 0, pagos: 0, saldoNeto: 0 };
      try {
        const res = await axios.get('/api/dashboard/summary', { params: { periodYear, periodMonth } });
        summaryData = res.data || summaryData;
      } catch (e) {
        console.warn('Resumen mensual no disponible, usando valores por defecto:', e?.response?.status || e?.message);
      }

      let transactions = [];
      try {
        const txRes = await axios.get('/api/transactions', { params: { periodYear, periodMonth } });
        transactions = txRes.data || [];
      } catch (e) {
        console.warn('Error al cargar transacciones del período:', e?.response?.status || e?.message);
        transactions = [];
      }

      // Load projected transactions for the selected month (materialized on-demand by backend)
      let projected = [];
      try {
        const prjRes = await axios.get('/api/projected', { params: { year: periodYear, month: periodMonth } });
        projected = prjRes.data || [];
      } catch (e) {
        console.warn('Error al cargar transacciones proyectadas:', e?.response?.status || e?.message);
        projected = [];
      }

      // Load credit card installments occurrences for the selected month (to add into TC gastos)
      let installments = [];
      try {
        const instRes = await axios.get('/api/installments/occurrences', { params: { year: periodYear, month: periodMonth } });
        installments = instRes.data || [];
      } catch (e) {
        console.warn('Error al cargar cuotas del mes:', e?.response?.status || e?.message);
        installments = [];
      }
      // Build categories treemap-like data
      const categoryMap = new Map();
      transactions
        .filter(t => t.tipo === 'gasto')
        .forEach(t => {
          const name = t.category_name || 'Sin categorizar';
          const current = categoryMap.get(name) || { name, total: 0, count: 0 };
          current.total += Number(t.monto) || 0;
          current.count += 1;
          categoryMap.set(name, current);
        });
      const categories = Array.from(categoryMap.values()).sort((a, b) => Math.abs(b.total) - Math.abs(a.total));

      // Fallback: compute monthly totals from transactions if summary not available or zero
      const computed = transactions.reduce((acc, t) => {
        const amount = Number(t.monto) || 0;
        if (t.tipo === 'gasto') acc.gastos += amount > 0 ? amount : 0;
        if (t.tipo === 'pago') acc.pagos += Math.abs(amount);
        if (t.tipo === 'ingreso') acc.ingresos += amount;
        return acc;
      }, { gastos: 0, ingresos: 0, pagos: 0 });
      const useComputed = (!summaryData || (summaryData.gastos === 0 && summaryData.pagos === 0 && transactions.length > 0));
      const saldoNetoComputed = computed.pagos - computed.gastos;

      // Credit Cards block: compute Visa, Mastercard, Consolidated (exclude 'desestimar')
      const ccTx = transactions.filter(t => (t.network === 'visa' || t.network === 'mastercard') && t.tipo !== 'desestimar');
      const calcByNetwork = (network) => {
        const list = ccTx.filter(t => t.network === network);
        const totals = list.reduce((acc, t) => {
          const amount = Number(t.monto) || 0;
          if (t.tipo === 'gasto') acc.gastos += amount > 0 ? amount : 0;
          if (t.tipo === 'pago') acc.pagos += Math.abs(amount);
          return acc;
        }, { gastos: 0, pagos: 0 });
        const saldo = totals.pagos - totals.gastos;
        return { gastos: totals.gastos, pagos: totals.pagos, saldo };
      };
      const visaMetrics = calcByNetwork('visa');
      const mcMetrics = calcByNetwork('mastercard');

      // Sum installments amounts into gastos per brand (they behave as gastos TC)
      const installmentsByBrand = installments.reduce((acc, o) => {
        const b = (o.brand || '').toLowerCase();
        const amt = Number(o.amount) || 0;
        if (!acc[b]) acc[b] = 0;
        acc[b] += amt;
        return acc;
      }, {});
      const visaGastosNonFact = visaMetrics.gastos;
      const visaPagosNonFact = visaMetrics.pagos;
      const mcGastosNonFact = mcMetrics.gastos;
      const mcPagosNonFact = mcMetrics.pagos;
      const visaCuotas = installmentsByBrand['visa'] || 0;
      const mcCuotas = installmentsByBrand['mastercard'] || 0;
      visaMetrics.gastos += visaCuotas;
      mcMetrics.gastos += mcCuotas;
      visaMetrics.breakdown = { gastosNonFact: visaGastosNonFact, pagosNonFact: visaPagosNonFact, cuotas: visaCuotas };
      mcMetrics.breakdown = { gastosNonFact: mcGastosNonFact, pagosNonFact: mcPagosNonFact, cuotas: mcCuotas };
      visaMetrics.saldo = (visaMetrics.pagos || 0) - (visaMetrics.gastos || 0);
      mcMetrics.saldo = (mcMetrics.pagos || 0) - (mcMetrics.gastos || 0);
      const consolidatedList = ccTx; // both networks
      const consolidatedTotals = consolidatedList.reduce((acc, t) => {
        const amount = Number(t.monto) || 0;
        if (t.tipo === 'gasto') acc.gastos += amount > 0 ? amount : 0;
        if (t.tipo === 'pago') acc.pagos += Math.abs(amount);
        return acc;
      }, { gastos: 0, pagos: 0 });
      // add installments to consolidated gastos
      const consGastosNonFact = consolidatedTotals.gastos;
      const consPagosNonFact = consolidatedTotals.pagos;
      const consCuotas = (installmentsByBrand['visa'] || 0) + (installmentsByBrand['mastercard'] || 0);
      consolidatedTotals.gastos += consCuotas;
      const consolidatedMetrics = {
        gastos: consolidatedTotals.gastos,
        pagos: consolidatedTotals.pagos,
        saldo: consolidatedTotals.pagos - consolidatedTotals.gastos,
        breakdown: { gastosNonFact: consGastosNonFact, pagosNonFact: consPagosNonFact, cuotas: consCuotas }
      };

      // Projected totals (non-TC): ingresos, gastos, saldo; exclude inactive
      const projectedTotals = projected.reduce((acc, p) => {
        if (p.active === false) return acc;
        const amount = Number(p.monto) || 0;
        if (p.tipo === 'ingreso') acc.ingresos += amount;
        if (p.tipo === 'gasto') acc.gastos += amount;
        return acc;
      }, { ingresos: 0, gastos: 0 });
      projectedTotals.saldo = projectedTotals.ingresos - projectedTotals.gastos;

      // Global net: (Pagos TC − Gastos TC) + (Ingresos Proyectados − Gastos Proyectados)
      const globalNet = (consolidatedMetrics.saldo || 0) + (projectedTotals.saldo || 0);

      const latestTransactions = transactions
        .slice()
        .sort((a, b) => new Date(b.fecha) - new Date(a.fecha))
        .slice(0, 5)
        .map(t => ({
          id: t.id,
          descripcion: t.descripcion,
          monto: t.monto,
          fecha: t.fecha,
          tipo: t.tipo,
          categoria: t.category_name || 'Sin categorizar'
        }));

      setData({
        currentMonth: {
          total_gastos: useComputed ? computed.gastos : (summaryData.gastos || 0),
          total_ingresos: useComputed ? computed.ingresos : (summaryData.ingresos || 0),
          total_pagos: useComputed ? computed.pagos : (summaryData.pagos || 0),
          saldo_neto: useComputed ? saldoNetoComputed : ((summaryData.pagos || 0) - (summaryData.gastos || 0))
        },
        creditCards: {
          visa: visaMetrics,
          mastercard: mcMetrics,
          consolidated: consolidatedMetrics
        },
        projected: projectedTotals,
        globalNet,
        categories,
        trend: [],
        latestTransactions
      });
    } catch (err) {
      setError('Error al cargar los datos del dashboard');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, [year, month]);

  useEffect(() => {
    window.refreshDashboardData = fetchDashboardData;
    return () => {
      delete window.refreshDashboardData;
    };
  }, []);

  const renderTreemap = () => {
    if (!data?.categories?.length) return null;

    const totalGastos = data.categories.reduce((sum, cat) => sum + Math.abs(cat.total), 0);
    
    const treemapData = [{
      name: 'Gastos por Categoría',
      children: data.categories.map((category, index) => ({
        name: category.name,
        size: Math.abs(category.total),
        percentage: ((Math.abs(category.total) / totalGastos) * 100).toFixed(1),
        color: COLORS[index % COLORS.length],
        rawAmount: category.total,
        count: category.count
      }))
    }];

    const CustomizedContent = (props) => {
      const {
        x, y, width, height, depth, name, percentage, color = '#808080' // Color por defecto
      } = props;
      
      const fontSize = width < 50 ? 0 : width < 100 ? 12 : 14;
      const shouldShowText = width > 30 && height > 30;

      // Color del texto basado en el brillo del fondo
      const getTextColor = (bgColor) => {
        if (!bgColor || typeof bgColor !== 'string') {
          return '#ffffff'; // Color de texto por defecto
        }

        try {
          // Convertir el color hex a RGB
          const r = parseInt(bgColor.slice(1, 3), 16);
          const g = parseInt(bgColor.slice(3, 5), 16);
          const b = parseInt(bgColor.slice(5, 7), 16);
          
          // Validar que los valores RGB son números válidos
          if (isNaN(r) || isNaN(g) || isNaN(b)) {
            return '#ffffff';
          }
          
          // Calcular el brillo (fórmula YIQ)
          const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
          
          // Retornar blanco o negro según el brillo
          return yiq >= 128 ? '#000000' : '#ffffff';
        } catch (error) {
          console.error('Error al procesar el color:', error);
          return '#ffffff';
        }
      };

      const textColor = getTextColor(color);

      return (
        <g>
          <rect
            x={x}
            y={y}
            width={width}
            height={height}
            fill={color}
            stroke="#fff"
            strokeWidth={2}
            style={{
              cursor: 'pointer',
              filter: `brightness(${100 + (depth || 0) * 20}%)`,
            }}
          />
          {shouldShowText && (
            <>
              <text
                x={x + width / 2}
                y={y + height / 2 - 8}
                textAnchor="middle"
                fill={textColor}
                fontSize={fontSize}
                style={{ pointerEvents: 'none' }}
              >
                {name || 'Sin categoría'}
              </text>
              <text
                x={x + width / 2}
                y={y + height / 2 + 8}
                textAnchor="middle"
                fill={textColor}
                fontSize={fontSize}
                style={{ pointerEvents: 'none' }}
              >
                {`${percentage || 0}%`}
              </text>
            </>
          )}
        </g>
      );
    };

    const CustomTooltip = ({ active, payload }) => {
      if (!active || !payload || !payload.length) return null;

      const data = payload[0].payload;
      return (
        <Paper
          sx={{
            p: 1.5,
            backgroundColor: 'rgba(255, 255, 255, 0.95)',
            border: `1px solid ${theme.palette.divider}`,
          }}
        >
          <Typography variant="subtitle2" gutterBottom>
            {data.name}
          </Typography>
          <Typography variant="body2">
            Monto: {formatCurrency(data.size)}
          </Typography>
          <Typography variant="body2">
            Porcentaje: {data.percentage}%
          </Typography>
        </Paper>
      );
    };

    return (
      <Box height={400} position="relative">
        <ResponsiveContainer width="100%" height="100%">
          <Treemap
            data={treemapData}
            dataKey="size"
            stroke={theme.palette.background.paper}
            fill="#8884d8"
            content={<CustomizedContent />}
            onClick={(data) => {
              if (data.name !== 'Gastos por Categoría') {
                navigate('/transactions', { 
                  state: { 
                    filterCategory: data.name 
                  } 
                });
              }
            }}
          >
            <RechartsTooltip content={<CustomTooltip />} />
          </Treemap>
        </ResponsiveContainer>
      </Box>
    );
  };

  const renderRecentTransactions = () => {
    if (!data?.latestTransactions?.length) return null;

    return (
      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Fecha</TableCell>
              <TableCell>Descripción</TableCell>
              <TableCell>Monto</TableCell>
              <TableCell>Categoría</TableCell>
              <TableCell>Tipo</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {data.latestTransactions && data.latestTransactions.length > 0 ? data.latestTransactions.map((transaction, index) => (
              <TableRow key={transaction.id}>
                <TableCell>{new Date(transaction.fecha).toLocaleDateString('es-CL')}</TableCell>
                <TableCell>{transaction.descripcion}</TableCell>
                <TableCell>{formatCurrency(transaction.monto)}</TableCell>
                <TableCell>{transaction.categoria}</TableCell>
                <TableCell>{transaction.tipo}</TableCell>
              </TableRow>
            )) : (
              <TableRow>
                <TableCell colSpan={5} align="center">No hay transacciones este mes</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
    );
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="200px">
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Box p={3}>
        <Typography color="error">{error}</Typography>
      </Box>
    );
  }

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('es-CL');
  };

  return (
    <Container maxWidth="xl" sx={{ mt: 4, mb: 6 }}>
      <MonthPicker />
      {/* Título principal del Dashboard */}
      <Typography 
        variant="h3" 
        component="h1" 
        gutterBottom 
        sx={{ 
          mb: 4,
          fontFamily: 'Inter, sans-serif',
          fontWeight: 700,
          color: theme.palette.primary.main,
          letterSpacing: '-0.5px'
        }}
      >
        Dashboard Financiero
      </Typography>

      <Grid container spacing={4}>
        {/* Primera fila - Métricas principales (Ingresos, Gastos, Saldo neto global) */}
        <Grid item xs={12} md={4} sx={{ display: 'flex' }}>
          <Paper
            elevation={2}
            sx={{
              p: 3,
              display: 'flex',
              flexDirection: 'column',
              height: '100%',
              minHeight: 180,
              width: '100%',
              transition: 'all 0.3s ease-in-out',
              '&:hover': {
                transform: 'translateY(-4px)',
                boxShadow: theme.shadows[4]
              }
            }}
          >
            <Typography 
              component="h2" 
              variant="h5" 
              sx={{ 
                color: theme.palette.primary.main,
                fontFamily: 'Inter, sans-serif',
                fontWeight: 700,
                mb: 2,
                letterSpacing: '-0.5px'
              }}
            >
              Ingresos (mes)
            </Typography>
            <Typography 
              component="p" 
              variant="h3"
              color="success.main"
              title="Incluye solo Ingresos Proyectados del mes."
              sx={{ 
                fontFamily: 'Inter, sans-serif',
                fontWeight: 600,
                letterSpacing: '-0.5px'
              }}
            >
              {formatCurrency(data?.projected?.ingresos || 0)}
            </Typography>
          </Paper>
        </Grid>

        <Grid item xs={12} md={4} sx={{ display: 'flex' }}>
          <Paper
            elevation={2}
            sx={{
              p: 3,
              display: 'flex',
              flexDirection: 'column',
              height: '100%',
              minHeight: 180,
              width: '100%',
              transition: 'all 0.3s ease-in-out',
              '&:hover': {
                transform: 'translateY(-4px)',
                boxShadow: theme.shadows[4]
              }
            }}
          >
            <Typography 
              component="h2" 
              variant="h5" 
              sx={{ 
                color: theme.palette.primary.main,
                fontFamily: 'Inter, sans-serif',
                fontWeight: 700,
                mb: 2,
                letterSpacing: '-0.5px'
              }}
            >
              Gastos (mes)
            </Typography>
            <Typography 
              component="p" 
              variant="h3"
              color="error"
              title="Gastos Proyectados + egreso neto TC del mes (max(Gastos TC − Pagos TC, 0))."
              sx={{ 
                fontFamily: 'Inter, sans-serif',
                fontWeight: 600,
                letterSpacing: '-0.5px'
              }}
            >
              {(() => {
                const projG = data?.projected?.gastos || 0;
                const tcG = data?.creditCards?.consolidated?.gastos || 0;
                const tcP = data?.creditCards?.consolidated?.pagos || 0;
                const egresoTC = Math.max(tcG - tcP, 0);
                return formatCurrency(projG + egresoTC);
              })()}
            </Typography>
          </Paper>
        </Grid>
        <Grid item xs={12} md={4} sx={{ display: 'flex' }}>
          <Paper
            elevation={2}
            sx={{
              p: 3,
              display: 'flex',
              flexDirection: 'column',
              height: '100%',
              minHeight: 180,
              width: '100%',
              transition: 'all 0.3s ease-in-out',
              '&:hover': {
                transform: 'translateY(-4px)',
                boxShadow: theme.shadows[4]
              }
            }}
          >
            <Typography 
              component="h2" 
              variant="h5" 
              title="(Pagos TC − Gastos TC) + (Ingresos Proyectados − Gastos Proyectados)"
              sx={{ 
                color: theme.palette.primary.main,
                fontFamily: 'Inter, sans-serif',
                fontWeight: 700,
                mb: 2,
                letterSpacing: '-0.5px'
              }}
            >
              Saldo neto global (mes)
            </Typography>
            {(() => {
              const saldo = data?.globalNet ?? 0;
              const color = saldo > 0 ? 'success.main' : (saldo < 0 ? 'error.main' : 'text.primary');
              const legend = saldo > 0 ? '(A favor)' : (saldo < 0 ? '(Déficit)' : '');
              return (
                <Typography 
                  component="p" 
                  variant="h3" 
                  color={color}
                  sx={{ 
                    fontFamily: 'Inter, sans-serif',
                    fontWeight: 600,
                    letterSpacing: '-0.5px'
                  }}
                >
                  {formatCurrency(saldo)}
                  {legend && (
                    <Typography 
                      component="span" 
                      variant="h6" 
                      color="inherit"
                      sx={{ 
                        ml: 1,
                        fontFamily: 'Inter, sans-serif',
                        fontWeight: 500
                      }}
                    >
                      {legend}
                    </Typography>
                  )}
                </Typography>
              );
            })()}
          </Paper>
        </Grid>

        {/* Bloque Tarjetas de Crédito (debajo de los totales) */}
        <Grid item xs={12}>
          <Typography 
            component="h2" 
            variant="h5" 
            sx={{ 
              mt: 1,
              color: theme.palette.primary.main,
              fontFamily: 'Inter, sans-serif',
              fontWeight: 700,
              letterSpacing: '-0.5px'
            }}
          >
            Tarjetas de Crédito
          </Typography>
        </Grid>

        {(() => {
          const cards = [
            { key: 'visa', title: 'Visa', metrics: data?.creditCards?.visa },
            { key: 'mastercard', title: 'Mastercard', metrics: data?.creditCards?.mastercard },
            { key: 'consolidated', title: 'Consolidado TC', metrics: data?.creditCards?.consolidated }
          ];

          const renderCard = ({ key, title, metrics }) => {
            const gastos = metrics?.gastos || 0;
            const pagos = metrics?.pagos || 0;
            const saldo = metrics?.saldo || 0;
            const hasData = (gastos !== 0 || pagos !== 0 || saldo !== 0);

            const borderColor = title === 'Visa'
              ? theme.palette.primary.main
              : (title === 'Mastercard' ? theme.palette.secondary.main : theme.palette.grey[400]);

            return (
              <Grid item xs={12} md={4} key={key} sx={{ display: 'flex' }}>
                <Paper
                  elevation={3}
                  sx={{
                    position: 'relative',
                    p: 2.5,
                    borderRadius: 2,
                    borderTop: `4px solid ${borderColor}`,
                    backgroundColor: theme.palette.grey[50],
                    minHeight: 230,
                    display: 'flex',
                    flexDirection: 'column',
                    width: '100%'
                  }}
                >
                  <Typography component="h3" variant="h6" sx={{ fontWeight: 700, mb: 2, color: theme.palette.text.primary }}>
                    {title}
                  </Typography>
                  {(() => {
                    const breakdown = metrics?.breakdown || {};
                    const gastosNF = breakdown.gastosNonFact || 0;
                    const pagosNF = breakdown.pagosNonFact || 0;
                    const cuotasMes = breakdown.cuotas || 0;
                    const totalPagar = (gastosNF - pagosNF) + cuotasMes;
                    const totalColor = totalPagar > 0 ? 'error.main' : 'success.main';
                    const totalLabel = totalPagar > 0 ? 'Total a pagar este mes' : 'Saldo a favor este mes';

                    return (
                      <>
                        <Box sx={{ mb: 1.5 }}>
                          <Typography variant="subtitle2" sx={{ opacity: 0.9, fontWeight: 700 }}>Movimientos no facturados</Typography>
                          {/* Row: Gastos */}
                          <Box sx={{
                            mt: 0.75,
                            display: 'grid',
                            gridTemplateColumns: '1fr 160px',
                            alignItems: 'baseline',
                            columnGap: 1
                          }}>
                            <Tooltip title="Compras realizadas con la tarjeta en el mes y aún no facturadas.">
                              <Typography variant="body2" sx={{ opacity: 0.8 }}>Gastos</Typography>
                            </Tooltip>
                            <Typography variant="body1" color="error.main" sx={{ fontWeight: 700, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(gastosNF)}</Typography>
                          </Box>
                          {/* Row: Pagos */}
                          <Box sx={{
                            mt: 0.5,
                            display: 'grid',
                            gridTemplateColumns: '1fr 160px',
                            alignItems: 'baseline',
                            columnGap: 1
                          }}>
                            <Tooltip title="Abonos realizados en el mes que descuentan del saldo no facturado.">
                              <Typography variant="body2" sx={{ opacity: 0.8 }}>Pagos</Typography>
                            </Tooltip>
                            <Typography variant="body1" color="success.main" sx={{ fontWeight: 700, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(pagosNF)}</Typography>
                          </Box>
                        </Box>

                        <Box sx={{ mb: 1.5 }}>
                          <Tooltip title="Monto correspondiente a cuotas programadas que vencen este mes.">
                            <Typography variant="subtitle2" sx={{ opacity: 0.9, fontWeight: 700 }}>Compras en cuotas (mes)</Typography>
                          </Tooltip>
                          <Box sx={{
                            display: 'grid',
                            gridTemplateColumns: '1fr 160px',
                            alignItems: 'baseline',
                            mt: 0.5,
                            columnGap: 1
                          }}>
                            <Typography variant="body2" sx={{ opacity: 0.8 }}>Cuotas del mes</Typography>
                            <Typography variant="body1" color="error.main" sx={{ fontWeight: 700, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(cuotasMes)}</Typography>
                          </Box>
                        </Box>

                        <Box sx={{ mt: 'auto', pt: 1.5, borderTop: `2px dashed ${theme.palette.grey[200]}` }}>
                          <Tooltip title="Suma de movimientos no facturados (gastos − pagos) más cuotas del mes.">
                            <Typography variant="body2" sx={{ opacity: 0.8 }}>{totalLabel}</Typography>
                          </Tooltip>
                          <Typography variant="h5" color={totalColor} sx={{ fontWeight: 800, letterSpacing: '-0.2px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', width: 160, ml: 'auto' }}>
                            {formatCurrency(totalPagar)}
                          </Typography>
                        </Box>
                      </>
                    );
                  })()}
                  {!hasData && (
                    <Typography variant="caption" sx={{ mt: 1, opacity: 0.7 }}>Sin movimientos este mes</Typography>
                  )}
                </Paper>
              </Grid>
            );
          };

          return cards.map(renderCard);
        })()}

        {/* Bloque Transacciones Proyectadas (no TC) */}
        <Grid item xs={12}>
          <Typography 
            component="h2" 
            variant="h5" 
            sx={{ 
              mt: 1,
              color: theme.palette.primary.main,
              fontFamily: 'Inter, sans-serif',
              fontWeight: 700,
              letterSpacing: '-0.5px'
            }}
          >
            Transacciones Proyectadas (no TC)
          </Typography>
        </Grid>

        {(() => {
          const cards = [
            { key: 'ing', title: 'Ingresos Proyectados (mes)', value: data?.projected?.ingresos || 0, color: 'success.main' },
            { key: 'gas', title: 'Gastos Proyectados (mes)', value: data?.projected?.gastos || 0, color: 'error.main' },
            { key: 'sal', title: 'Saldo Proyectado (mes)', value: data?.projected?.saldo || 0, color: (data?.projected?.saldo || 0) > 0 ? 'success.main' : ((data?.projected?.saldo || 0) < 0 ? 'error.main' : 'text.primary') }
          ];
          const hasAny = (data?.projected?.ingresos || 0) !== 0 || (data?.projected?.gastos || 0) !== 0 || (data?.projected?.saldo || 0) !== 0;
          return cards.map((c) => (
            <Grid item xs={12} md={4} key={c.key} sx={{ display: 'flex' }}>
              <Paper elevation={2} sx={{ p: 3, display: 'flex', flexDirection: 'column', width: '100%' }}>
                <Typography component="h3" variant="h6" title="Incluye solo proyecciones manuales (no tarjeta) del mes." sx={{ mb: 1, fontWeight: 700 }}>
                  {c.title}
                </Typography>
                <Typography variant="h4" color={c.color} sx={{ fontWeight: 700 }}>
                  {formatCurrency(c.value)}{' '}
                  {c.key === 'sal' && (c.value > 0 || c.value < 0) && (
                    <Typography component="span" variant="h6" color={c.color} sx={{ ml: 1, fontWeight: 500 }}>
                      {c.value > 0 ? '(A favor)' : '(Déficit)'}
                    </Typography>
                  )}
                </Typography>
                {!hasAny && (
                  <Typography variant="caption" sx={{ mt: 0.5, opacity: 0.7 }}>Sin proyecciones este mes</Typography>
                )}
              </Paper>
            </Grid>
          ));
        })()}

        {/* Segunda fila - Gráficos */}
        <Grid item xs={12} md={8} sx={{ display: 'flex' }}>
          <Paper
            elevation={2}
            sx={{
              p: 3,
              display: 'flex',
              flexDirection: 'column',
              height: '100%',
              minHeight: 400,
              width: '100%'
            }}
          >
            <Typography 
              component="h2" 
              variant="h5" 
              sx={{ 
                color: theme.palette.primary.main,
                fontFamily: 'Inter, sans-serif',
                fontWeight: 700,
                mb: 3,
                letterSpacing: '-0.5px'
              }}
            >
              Tendencia de los últimos 6 meses
            </Typography>
            <div style={{ flexGrow: 1, minHeight: 0 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={data.trend.map(item => ({
                    mes: new Date(item.mes).toLocaleDateString('es-CL', { month: 'short', year: 'numeric' }),
                    gastos: item.total_gastos,
                    pagos: item.total_pagos,
                    deuda: item.deuda_mensual
                  }))}
                  margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="mes" />
                  <YAxis />
                  <Tooltip 
                    formatter={(value, name) => {
                      return [formatCurrency(value), name];
                    }}
                  />
                  <Legend />
                  <Bar dataKey="gastos" name="Gastos" fill="#FF8042" />
                  <Bar dataKey="pagos" name="Pagos" fill="#00C49F" />
                  <Bar dataKey="deuda" name="Deuda" fill="#FF4444" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Paper>
        </Grid>
        <Grid item xs={12} md={4} sx={{ display: 'flex' }}>
          <Paper
            elevation={2}
            sx={{
              p: 3,
              display: 'flex',
              flexDirection: 'column',
              height: '100%',
              minHeight: 400,
              width: '100%'
            }}
          >
            <Typography 
              component="h2" 
              variant="h5" 
              sx={{ 
                color: theme.palette.primary.main,
                fontFamily: 'Inter, sans-serif',
                fontWeight: 700,
                mb: 3,
                letterSpacing: '-0.5px'
              }}
            >
              Gastos por Categoría
            </Typography>
            <div style={{ flexGrow: 1, minHeight: 0 }}>
              {renderTreemap()}
            </div>
          </Paper>
        </Grid>
      </Grid>

      {/* Últimas transacciones */}
      <Grid item xs={12}>
        <Paper 
          elevation={2}
          sx={{ 
            p: 3,
            mt: 2
          }}
        >
          <Typography 
            component="h2" 
            variant="h5" 
            sx={{ 
              color: theme.palette.primary.main,
              fontFamily: 'Inter, sans-serif',
              fontWeight: 700,
              mb: 3,
              letterSpacing: '-0.5px'
            }}
          >
            Últimas Transacciones
          </Typography>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell 
                    sx={{ 
                      fontFamily: 'Inter, sans-serif',
                      fontWeight: 600,
                      backgroundColor: theme.palette.primary.light,
                      color: theme.palette.primary.contrastText,
                      fontSize: '1rem'
                    }}
                  >
                    Fecha
                  </TableCell>
                  <TableCell 
                    sx={{ 
                      fontFamily: 'Inter, sans-serif',
                      fontWeight: 600,
                      backgroundColor: theme.palette.primary.light,
                      color: theme.palette.primary.contrastText,
                      fontSize: '1rem'
                    }}
                  >
                    Descripción
                  </TableCell>
                  <TableCell 
                    sx={{ 
                      fontFamily: 'Inter, sans-serif',
                      fontWeight: 600,
                      backgroundColor: theme.palette.primary.light,
                      color: theme.palette.primary.contrastText,
                      fontSize: '1rem'
                    }}
                  >
                    Monto
                  </TableCell>
                  <TableCell 
                    sx={{ 
                      fontFamily: 'Inter, sans-serif',
                      fontWeight: 600,
                      backgroundColor: theme.palette.primary.light,
                      color: theme.palette.primary.contrastText,
                      fontSize: '1rem'
                    }}
                  >
                    Categoría
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {data.latestTransactions && data.latestTransactions.length > 0 ? (
                  data.latestTransactions.map((transaction, index) => (
                  <TableRow 
                    key={transaction.id}
                    sx={{
                      '&:hover': {
                        backgroundColor: theme.palette.action.hover,
                        cursor: 'pointer'
                      },
                      transition: 'background-color 0.2s ease'
                    }}
                  >
                    <TableCell sx={{ 
                      fontFamily: 'Inter, sans-serif',
                      fontSize: '0.95rem'
                    }}>
                      {formatDate(transaction.fecha)}
                    </TableCell>
                    <TableCell sx={{ 
                      fontFamily: 'Inter, sans-serif',
                      fontSize: '0.95rem'
                    }}>
                      {transaction.descripcion}
                    </TableCell>
                    <TableCell 
                      sx={{ 
                        fontFamily: 'Inter, sans-serif',
                        fontSize: '0.95rem',
                        color: transaction.monto < 0 ? theme.palette.error.main : theme.palette.success.main,
                        fontWeight: 500
                      }}
                    >
                      {formatCurrency(Math.abs(transaction.monto))}
                    </TableCell>
                    <TableCell sx={{ 
                      fontFamily: 'Inter, sans-serif',
                      fontSize: '0.95rem'
                    }}>
                      {transaction.categoria}
                    </TableCell>
                  </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={4} align="center">No hay transacciones este mes</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      </Grid>
      <Box mt={2} textAlign="right" sx={{ opacity: 0.7 }}>
        <Typography variant="caption">Mostrando datos del mes seleccionado.</Typography>
      </Box>
    </Container>
  );
};

export default Dashboard;
