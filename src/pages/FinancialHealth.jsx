import React, { useState, useEffect, useCallback } from 'react';
import {
  Grid,
  Paper,
  Typography,
  Box,
  CircularProgress,
  Alert,
  LinearProgress,
  IconButton,
  Tooltip,
  useTheme,
  alpha
} from '@mui/material';
import {
  Warning as WarningIcon,
  CheckCircle as CheckIcon,
  Error as ErrorIcon,
  Info as InfoIcon,
  Refresh as RefreshIcon,
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon,
  AccountBalanceWallet as WalletIcon
} from '@mui/icons-material';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip } from 'recharts';
import axios from '../config/axios';
import { usePeriod } from '../contexts/PeriodContext';
import MonthPicker from '../components/MonthPicker';

// Soft color palette for categories
const CATEGORY_COLORS = [
  '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6',
  '#EC4899', '#06B6D4', '#84CC16', '#F97316', '#6366F1'
];

const FinancialHealth = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);
  const [categoryData, setCategoryData] = useState([]);
  const theme = useTheme();
  const { year, month, startISO, endISO } = usePeriod();

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Fetch financial health summary
      const healthRes = await axios.get('/api/financial-health/summary', {
        params: { year, month }
      });
      setData(healthRes.data);
      
      // Fetch category breakdown for the pie chart (use period, not date range)
      const catRes = await axios.get('/api/dashboard/categories', {
        params: { periodYear: year, periodMonth: month }
      });
      
      // Transform for pie chart - top 6 categories
      const categories = (catRes.data || [])
        .filter(c => c.total > 0)
        .sort((a, b) => b.total - a.total)
        .slice(0, 6)
        .map((c, i) => ({
          name: c.categoria || 'Sin categoría',
          value: c.total,
          color: CATEGORY_COLORS[i % CATEGORY_COLORS.length]
        }));
      setCategoryData(categories);
      
    } catch (err) {
      console.error('Error fetching financial health:', err);
      setError(err.response?.data?.error || 'Error al cargar datos');
    } finally {
      setLoading(false);
    }
  }, [year, month, startISO, endISO]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('es-CL', {
      style: 'currency',
      currency: 'CLP'
    }).format(amount || 0);
  };

  const getHealthColor = (status) => {
    switch (status) {
      case 'excellent': return theme.palette.success.main;
      case 'healthy': return theme.palette.success.light;
      case 'warning': return theme.palette.warning.main;
      case 'critical': return theme.palette.error.main;
      default: return theme.palette.grey[500];
    }
  };

  const getHealthLabel = (status) => {
    switch (status) {
      case 'excellent': return 'Excelente';
      case 'healthy': return 'Saludable';
      case 'warning': return 'Precaución';
      case 'critical': return 'Crítico';
      default: return 'Sin datos';
    }
  };

  const getHealthIcon = (status) => {
    switch (status) {
      case 'excellent':
      case 'healthy':
        return <CheckIcon sx={{ color: getHealthColor(status) }} />;
      case 'warning':
        return <WarningIcon sx={{ color: getHealthColor(status) }} />;
      case 'critical':
        return <ErrorIcon sx={{ color: getHealthColor(status) }} />;
      default:
        return <InfoIcon sx={{ color: getHealthColor(status) }} />;
    }
  };

  if (loading) {
    return (
      <Box sx={{ py: 4, textAlign: 'center' }}>
        <CircularProgress size={60} />
        <Typography sx={{ mt: 2 }} variant="h6">
          Calculando tu salud financiera...
        </Typography>
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ py: 4, px: 2 }}>
        <Alert severity="error">{error}</Alert>
      </Box>
    );
  }

  const { checking, creditCards, projected, summary, alerts } = data || {};
  
  // Calculate totals for flow section
  const totalIncome = (projected?.income || 0);
  const totalCommitments = (summary?.totalCommitments || 0);
  const projectedResult = (summary?.projectedBalance || 0);
  const netBalance = totalIncome - totalCommitments; // Neteo del mes (sin considerar saldo inicial)
  const commitmentPercent = totalIncome > 0 ? Math.min(100, Math.round((totalCommitments / totalIncome) * 100)) : 0;
  
  // Month name for display
  const monthName = new Date(year, month - 1).toLocaleDateString('es-CL', { month: 'long', year: 'numeric' });

  return (
    <Box sx={{ py: { xs: 1, md: 1 } }}>
      {/* Header */}
      <Box sx={{ 
        display: 'flex', 
        flexDirection: { xs: 'column', sm: 'row' },
        justifyContent: 'space-between', 
        alignItems: { xs: 'flex-start', sm: 'center' }, 
        gap: 2,
        mb: 2 
      }}>
        <Typography variant="h4" fontWeight={700} color="text.primary">
          Salud Financiera
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <MonthPicker />
          <Tooltip title="Actualizar">
            <IconButton onClick={fetchData} size="small" sx={{ bgcolor: alpha(theme.palette.primary.main, 0.1) }}>
              <RefreshIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      {/* Alerts Section */}
      {alerts && alerts.length > 0 && (
        <Box sx={{ mb: 3 }}>
          {alerts.slice(0, 3).map((alert, idx) => (
            <Alert 
              key={idx} 
              severity={alert.type === 'critical' ? 'error' : alert.type === 'warning' ? 'warning' : 'info'}
              sx={{ mb: 1, borderRadius: 2 }}
              icon={alert.type === 'critical' ? <ErrorIcon /> : alert.type === 'warning' ? <WarningIcon /> : <InfoIcon />}
            >
              <strong>{alert.title}:</strong> {alert.message}
            </Alert>
          ))}
        </Box>
      )}

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        
        {/* ===== RESUMEN DEL MES ===== */}
        <Box>
          <Paper elevation={0} sx={{ p: 2, border: `1px solid ${theme.palette.divider}` }}>
            <Typography variant="overline" color="text.secondary" sx={{ mb: 2, display: 'block' }}>
              Resumen del Mes
            </Typography>
            
            <Grid container spacing={2} alignItems="center">
              {/* Health Score */}
              <Grid item xs={4} sm={4}>
                <Box sx={{ textAlign: 'center' }}>
                  <Box sx={{ position: 'relative', display: 'inline-flex' }}>
                    {/* Background circle */}
                    <CircularProgress
                      variant="determinate"
                      value={100}
                      size={80}
                      thickness={5}
                      sx={{ color: theme.palette.grey[200] }}
                    />
                    {/* Foreground progress */}
                    <CircularProgress
                      variant="determinate"
                      value={summary?.healthScore || 0}
                      size={80}
                      thickness={5}
                      sx={{ 
                        color: getHealthColor(summary?.healthStatus),
                        position: 'absolute',
                        left: 0,
                        '& .MuiCircularProgress-circle': { strokeLinecap: 'round' }
                      }}
                    />
                    <Box sx={{
                      position: 'absolute',
                      top: 0, left: 0, bottom: 0, right: 0,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexDirection: 'column'
                    }}>
                      <Typography variant="h5" fontWeight={700} lineHeight={1}>
                        {summary?.healthScore || 0}
                      </Typography>
                    </Box>
                  </Box>
                  <Typography 
                    variant="caption" 
                    sx={{ 
                      mt: 0.5, 
                      px: 1, 
                      py: 0.25, 
                      borderRadius: 1,
                      display: 'inline-block',
                      bgcolor: alpha(getHealthColor(summary?.healthStatus), 0.15),
                      color: getHealthColor(summary?.healthStatus),
                      fontWeight: 600
                    }}
                  >
                    {getHealthLabel(summary?.healthStatus)}
                  </Typography>
                </Box>
              </Grid>
              
              {/* Available Today */}
              <Grid item xs={4} sm={4}>
                <Box sx={{ textAlign: 'center' }}>
                  <WalletIcon sx={{ fontSize: { xs: 24, sm: 32 }, color: theme.palette.primary.main, mb: 0.5 }} />
                  <Typography variant="caption" color="text.secondary" display="block">
                    Disponible hoy
                  </Typography>
                  <Typography variant="h6" fontWeight={700} color="primary.main" sx={{ fontSize: { xs: '1rem', sm: '1.25rem' } }}>
                    {formatCurrency(checking?.currentBalance)}
                  </Typography>
                </Box>
              </Grid>
              
              {/* Projected Balance */}
              <Grid item xs={4} sm={4}>
                <Box sx={{ textAlign: 'center' }}>
                  {projectedResult >= 0 ? (
                    <TrendingUpIcon sx={{ fontSize: { xs: 24, sm: 32 }, color: theme.palette.success.main, mb: 0.5 }} />
                  ) : (
                    <TrendingDownIcon sx={{ fontSize: { xs: 24, sm: 32 }, color: theme.palette.error.main, mb: 0.5 }} />
                  )}
                  <Typography variant="caption" color="text.secondary" display="block">
                    Proyección fin de mes
                  </Typography>
                  <Typography 
                    variant="h6" 
                    fontWeight={700} 
                    color={projectedResult >= 0 ? 'success.main' : 'error.main'}
                    sx={{ fontSize: { xs: '1rem', sm: '1.25rem' } }}
                  >
                    {projectedResult >= 0 ? '+' : ''}{formatCurrency(projectedResult)}
                  </Typography>
                </Box>
              </Grid>
            </Grid>
          </Paper>
        </Box>

        {/* ===== FLUJO DEL MES ===== */}
        <Box>
          <Paper elevation={0} sx={{ p: 2, border: `1px solid ${theme.palette.divider}` }}>
            <Typography variant="overline" color="text.secondary" sx={{ mb: 2, display: 'block' }}>
              Flujo del Mes - {monthName}
            </Typography>
            
            {(() => {
              // Preparar compromisos: tarjetas + gastos fijos, ordenados por monto
              const allCommitments = [
                { name: 'Tarjetas de Crédito', amount: creditCards?.combined || 0 },
                ...(projected?.details?.expenses || [])
              ].sort((a, b) => b.amount - a.amount);
              const maxItems = 4;
              const displayedCommitments = allCommitments.slice(0, maxItems);
              const remainingCount = allCommitments.length - maxItems;
              const remainingAmount = allCommitments.slice(maxItems).reduce((sum, item) => sum + item.amount, 0);
              
              return (
                <Grid container spacing={2} sx={{ mb: 3 }}>
                  {/* Ingresos */}
                  <Grid item xs={12} md={4}>
                    <Box sx={{ p: 2, borderRadius: 2, bgcolor: alpha(theme.palette.success.main, 0.08), height: '100%', minHeight: 180 }}>
                      <Typography variant="body2" color="text.secondary" fontWeight={600}>INGRESOS</Typography>
                      <Box sx={{ minHeight: 100 }}>
                        {projected?.details?.income?.length > 0 ? (
                          projected.details.income.map((item, idx) => (
                            <Box key={idx} sx={{ display: 'flex', justifyContent: 'space-between', mt: 1 }}>
                              <Typography variant="body2" noWrap sx={{ maxWidth: '60%' }}>{item.name}</Typography>
                              <Typography variant="body2" fontWeight={600}>{formatCurrency(item.amount)}</Typography>
                            </Box>
                          ))
                        ) : (
                          <Typography variant="body2" color="text.secondary" sx={{ mt: 1, fontStyle: 'italic' }}>
                            Sin ingresos configurados
                          </Typography>
                        )}
                      </Box>
                      <Box sx={{ borderTop: `1px solid ${theme.palette.divider}`, mt: 2, pt: 1 }}>
                        <Typography variant="h6" fontWeight={700} color="success.main" textAlign="right">
                          {formatCurrency(totalIncome)}
                        </Typography>
                      </Box>
                    </Box>
                  </Grid>
                  
                  {/* Compromisos - Top 4 por monto */}
                  <Grid item xs={12} md={4}>
                    <Box sx={{ p: 2, borderRadius: 2, bgcolor: alpha(theme.palette.error.main, 0.08), height: '100%', minHeight: 180 }}>
                      <Typography variant="body2" color="text.secondary" fontWeight={600}>COMPROMISOS</Typography>
                      <Box sx={{ minHeight: 100 }}>
                        {displayedCommitments.map((item, idx) => (
                          <Box key={idx} sx={{ display: 'flex', justifyContent: 'space-between', mt: 1 }}>
                            <Typography variant="body2" noWrap sx={{ maxWidth: '55%' }}>{item.name}</Typography>
                            <Typography variant="body2" fontWeight={600}>{formatCurrency(item.amount)}</Typography>
                          </Box>
                        ))}
                        {remainingCount > 0 && (
                          <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 1 }}>
                            <Typography variant="body2" color="text.secondary" fontStyle="italic">
                              +{remainingCount} más
                            </Typography>
                            <Typography variant="body2" color="text.secondary">{formatCurrency(remainingAmount)}</Typography>
                          </Box>
                        )}
                      </Box>
                      <Box sx={{ borderTop: `1px solid ${theme.palette.divider}`, mt: 2, pt: 1 }}>
                        <Typography variant="h6" fontWeight={700} color="error.main" textAlign="right">
                          -{formatCurrency(totalCommitments)}
                        </Typography>
                      </Box>
                    </Box>
                  </Grid>
                  
                  {/* Resultado */}
                  <Grid item xs={12} md={4}>
                    <Box sx={{ 
                      p: 2, 
                      borderRadius: 2, 
                      bgcolor: projectedResult >= 0 
                        ? alpha(theme.palette.success.main, 0.08) 
                        : alpha(theme.palette.error.main, 0.08),
                      height: '100%',
                      minHeight: 180,
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'center',
                      alignItems: 'center'
                    }}>
                      {/* Neteo del mes (sin saldo inicial) */}
                      <Typography variant="caption" color="text.secondary" fontWeight={500}>
                        NETEO DEL MES
                      </Typography>
                      <Typography 
                        variant="h6" 
                        fontWeight={600} 
                        color={netBalance >= 0 ? 'success.main' : 'error.main'}
                        sx={{ mb: 1.5 }}
                      >
                        {netBalance >= 0 ? '+' : ''}{formatCurrency(netBalance)}
                      </Typography>
                      
                      {/* Resultado proyectado (con saldo inicial) */}
                      <Typography variant="caption" color="text.secondary" fontWeight={500}>
                        RESULTADO PROYECTADO
                      </Typography>
                      <Typography 
                        variant="h5" 
                        fontWeight={700} 
                        color={projectedResult >= 0 ? 'success.main' : 'error.main'}
                      >
                        {projectedResult >= 0 ? '+' : ''}{formatCurrency(projectedResult)}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5 }}>
                        (incluye saldo inicial)
                      </Typography>
                    </Box>
                  </Grid>
                </Grid>
              );
            })()}
            
            {/* Progress bar */}
            <Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                <Typography variant="body2" color="text.secondary">
                  Compromisos vs Ingresos
                </Typography>
                <Typography variant="body2" fontWeight={600} color={commitmentPercent > 80 ? 'error.main' : 'text.primary'}>
                  {commitmentPercent}% comprometido
                </Typography>
              </Box>
              <LinearProgress 
                variant="determinate" 
                value={commitmentPercent}
                sx={{ 
                  height: 8, 
                  borderRadius: 4,
                  bgcolor: theme.palette.grey[200],
                  '& .MuiLinearProgress-bar': {
                    borderRadius: 4,
                    bgcolor: commitmentPercent > 80 ? theme.palette.error.main : 
                             commitmentPercent > 60 ? theme.palette.warning.main : 
                             theme.palette.success.main
                  }
                }}
              />
            </Box>
          </Paper>
        </Box>

        {/* ===== EN QUÉ GASTAMOS + TARJETAS ===== */}
        <Box sx={{ display: 'flex', gap: 2, flexDirection: { xs: 'column', md: 'row' } }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
          <Paper elevation={0} sx={{ p: 2, border: `1px solid ${theme.palette.divider}`, height: '100%' }}>
            <Typography variant="overline" color="text.secondary" sx={{ mb: 2, display: 'block' }}>
              ¿En qué gastamos?
            </Typography>
            
            {categoryData.length > 0 ? (
              <Grid container spacing={2}>
                <Grid item xs={5}>
                  <ResponsiveContainer width="100%" height={160}>
                    <PieChart>
                      <Pie
                        data={categoryData}
                        cx="50%"
                        cy="50%"
                        innerRadius={40}
                        outerRadius={70}
                        paddingAngle={2}
                        dataKey="value"
                      >
                        {categoryData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <RechartsTooltip 
                        formatter={(value) => formatCurrency(value)}
                        contentStyle={{ borderRadius: 8, border: 'none', boxShadow: '0 2px 8px rgba(0,0,0,0.15)' }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </Grid>
                <Grid item xs={7}>
                  {categoryData.map((cat, idx) => {
                    const total = categoryData.reduce((sum, c) => sum + c.value, 0);
                    const percent = total > 0 ? Math.round((cat.value / total) * 100) : 0;
                    return (
                      <Box key={idx} sx={{ display: 'flex', alignItems: 'center', mb: 1.5 }}>
                        <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: cat.color, mr: 1 }} />
                        <Typography variant="body2" sx={{ flex: 1 }} noWrap>{cat.name}</Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ mr: 1 }}>{percent}%</Typography>
                        <Typography variant="body2" fontWeight={600}>{formatCurrency(cat.value)}</Typography>
                      </Box>
                    );
                  })}
                </Grid>
              </Grid>
            ) : (
              <Box sx={{ textAlign: 'center', py: 4 }}>
                <Typography color="text.secondary">Sin gastos categorizados este mes</Typography>
              </Box>
            )}
          </Paper>
          </Box>

          {/* Tarjetas de Crédito */}
          <Box sx={{ flex: 1, minWidth: 0 }}>
          <Paper elevation={0} sx={{ p: 2, border: `1px solid ${theme.palette.divider}`, height: '100%' }}>
            <Typography variant="overline" color="text.secondary" sx={{ mb: 2, display: 'block' }}>
              Tarjetas de Crédito
            </Typography>
            
            <Grid container spacing={2}>
              {/* Visa Card */}
              <Grid item xs={12} sm={6}>
                <Box sx={{ 
                  p: 2, 
                  borderRadius: 2, 
                  border: `1px solid ${alpha('#1A1F71', 0.3)}`,
                  bgcolor: alpha('#1A1F71', 0.03)
                }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', mb: 1.5 }}>
                    <Box sx={{ 
                      bgcolor: '#1A1F71', 
                      color: 'white', 
                      px: 1.5, 
                      py: 0.25, 
                      borderRadius: 1,
                      fontSize: '0.75rem',
                      fontWeight: 700
                    }}>
                      VISA
                    </Box>
                    <Typography variant="h6" fontWeight={700} sx={{ ml: 'auto' }}>
                      {formatCurrency(creditCards?.visa?.total)}
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                    <Typography variant="body2" color="text.secondary">No facturado</Typography>
                    <Typography variant="body2">{formatCurrency(creditCards?.visa?.unbilled)}</Typography>
                  </Box>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                    <Typography variant="body2" color="text.secondary">Internacional</Typography>
                    <Typography variant="body2">{formatCurrency(creditCards?.visa?.international)}</Typography>
                  </Box>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                    <Typography variant="body2" color="text.secondary">Cuotas</Typography>
                    <Typography variant="body2">{formatCurrency(creditCards?.visa?.installments)}</Typography>
                  </Box>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Typography variant="body2" color="text.secondary">Pagos</Typography>
                    <Typography variant="body2" color={(creditCards?.visa?.payments || 0) > 0 ? 'success.main' : 'text.secondary'}>
                      {(creditCards?.visa?.payments || 0) > 0 ? `-${formatCurrency(creditCards?.visa?.payments)}` : '$0'}
                    </Typography>
                  </Box>
                </Box>
              </Grid>
              
              {/* Mastercard */}
              <Grid item xs={12} sm={6}>
                <Box sx={{ 
                  p: 2, 
                  borderRadius: 2, 
                  border: `1px solid ${alpha('#EB001B', 0.3)}`,
                  bgcolor: alpha('#EB001B', 0.03)
                }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', mb: 1.5 }}>
                    <Box sx={{ 
                      bgcolor: '#EB001B', 
                      color: 'white', 
                      px: 1.5, 
                      py: 0.25, 
                      borderRadius: 1,
                      fontSize: '0.75rem',
                      fontWeight: 700
                    }}>
                      MASTERCARD
                    </Box>
                    <Typography variant="h6" fontWeight={700} sx={{ ml: 'auto' }}>
                      {formatCurrency(creditCards?.mastercard?.total)}
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                    <Typography variant="body2" color="text.secondary">No facturado</Typography>
                    <Typography variant="body2">{formatCurrency(creditCards?.mastercard?.unbilled)}</Typography>
                  </Box>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                    <Typography variant="body2" color="text.secondary">Internacional</Typography>
                    <Typography variant="body2">{formatCurrency(creditCards?.mastercard?.international)}</Typography>
                  </Box>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                    <Typography variant="body2" color="text.secondary">Cuotas</Typography>
                    <Typography variant="body2">{formatCurrency(creditCards?.mastercard?.installments)}</Typography>
                  </Box>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Typography variant="body2" color="text.secondary">Pagos</Typography>
                    <Typography variant="body2" color={(creditCards?.mastercard?.payments || 0) > 0 ? 'success.main' : 'text.secondary'}>
                      {(creditCards?.mastercard?.payments || 0) > 0 ? `-${formatCurrency(creditCards?.mastercard?.payments)}` : '$0'}
                    </Typography>
                  </Box>
                </Box>
              </Grid>
              
              {/* Combined Total */}
              <Grid item xs={12}>
                <Box sx={{ 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  alignItems: 'center',
                  pt: 2,
                  borderTop: `1px solid ${theme.palette.divider}`
                }}>
                  <Typography variant="body1" fontWeight={600}>Total Tarjetas</Typography>
                  <Typography variant="h6" fontWeight={700} color="error.main">
                    {formatCurrency(creditCards?.combined)}
                  </Typography>
                </Box>
              </Grid>
            </Grid>
          </Paper>
          </Box>
        </Box>
        
      </Box>
    </Box>
  );
};

export default FinancialHealth;
