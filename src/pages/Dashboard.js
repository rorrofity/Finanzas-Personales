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
  Container
} from '@mui/material';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
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
          deuda_total: useComputed ? (computed.ingresos - computed.gastos + computed.pagos) : (summaryData.saldoNeto || 0)
        },
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
  }, [startISO, endISO]);

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
            <Tooltip content={<CustomTooltip />} />
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
        {/* Primera fila - Métricas principales */}
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
              Gastos del Mes
            </Typography>
            <Typography 
              component="p" 
              variant="h3"
              color="error"
              sx={{ 
                fontFamily: 'Inter, sans-serif',
                fontWeight: 600,
                letterSpacing: '-0.5px'
              }}
            >
              {data?.currentMonth ? formatCurrency(data.currentMonth.total_gastos) : '$0'}
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
              Pagos del Mes
            </Typography>
            <Typography 
              component="p" 
              variant="h3"
              color="success.main"
              sx={{ 
                fontFamily: 'Inter, sans-serif',
                fontWeight: 600,
                letterSpacing: '-0.5px'
              }}
            >
              {data?.currentMonth ? formatCurrency(data.currentMonth.total_pagos) : '$0'}
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
              Saldo neto del mes
            </Typography>
            <Typography 
              component="p" 
              variant="h3" 
              color={data?.currentMonth?.deuda_total > 0 ? "error" : "success.main"}
              sx={{ 
                fontFamily: 'Inter, sans-serif',
                fontWeight: 600,
                letterSpacing: '-0.5px'
              }}
            >
              {data?.currentMonth ? formatCurrency(data.currentMonth.deuda_total) : '$0'}
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
                {data?.currentMonth?.deuda_total > 0 ? '(Debes)' : '(A favor)'}
              </Typography>
            </Typography>
          </Paper>
        </Grid>

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
