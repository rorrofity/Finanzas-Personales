import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
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
import { usePeriod } from '../contexts/PeriodContext';
import { useAuth } from '../contexts/AuthContext';
import { useSpace } from '../contexts/SpaceContext';
import { readFinancialHealth } from '../services/financialHealth';
import useFinancialAutoRefresh from '../hooks/useFinancialAutoRefresh';
import MonthPicker from '../components/MonthPicker';
import { formatCLPExact } from '../utils/format';

// Soft color palette for categories
const CATEGORY_COLORS = [
  '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6',
  '#EC4899', '#06B6D4', '#84CC16', '#F97316', '#6366F1'
];

const isAmount = value => value !== null && value !== undefined && Number.isFinite(Number(value));
const timeLabel = value => value && Number.isFinite(new Date(value).getTime())
  ? new Intl.DateTimeFormat('es-CL', { timeZone: 'America/Santiago', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : 'Fecha no disponible';
const sourceLabel = source => source?.state === 'error' || source?.state === 'unavailable' ? 'No disponible'
  : source?.freshness === 'stale' ? 'Atrasado' : source?.freshness === 'current' ? 'Actualizado' : 'Fecha no verificada';
const amountColor = value => !isAmount(value) ? 'text.secondary' : value >= 0 ? 'success.main' : 'error.main';
const PARTIAL_REASONS = {
  CHECKING_UNAVAILABLE: 'No hay un saldo bancario disponible para este hogar.',
  CHECKING_STALE: 'El saldo bancario está atrasado.',
  CHECKING_DATE_UNKNOWN: 'No hay una fecha bancaria verificada.',
  NATIONAL_UNAVAILABLE: 'No se pudieron consultar los cargos nacionales.',
  INTERNATIONAL_UNAVAILABLE: 'No se pudieron consultar los cargos internacionales.',
  INSTALLMENTS_UNAVAILABLE: 'No se pudieron consultar las cuotas.',
  PROJECTED_UNAVAILABLE: 'No se pudieron consultar las proyecciones.',
  UNKNOWN_CARD_NETWORK: 'Hay cargos cuya tarjeta no pudo identificarse.',
  USD_CONVERSION_PENDING: 'Quedan cargos internacionales sin importe CLP confirmado.',
  EMAIL_SYNC_UNVERIFIED: 'No se pudo verificar la última sincronización de correos.',
  EMAIL_SYNC_STALE: 'La última sincronización de correos tiene más de 24 horas.',
  EMAIL_SYNC_FAILED: 'La última sincronización de correos informó un error.',
};

const FinancialHealth = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState('');
  const request = useRef(0);
  const controller = useRef(null);
  const theme = useTheme();
  const { year, month } = usePeriod();
  const { user } = useAuth();
  const { activeSpace } = useSpace();
  const userId = user?.id, ownerId = activeSpace?.ownerId || userId;
  const scopeKey = `${userId}:${ownerId}:${year}:${month}`;
  const scopeRef = useRef(scopeKey); scopeRef.current = scopeKey;
  const resultRef = useRef(result); resultRef.current = result;
  const data = result?.scopeKey === scopeKey ? result.data : null;

  const fetchData = useCallback(async () => {
    if (!userId || !ownerId) return;
    controller.current?.abort();
    const abort = new AbortController(); controller.current = abort;
    const version = ++request.current;
    const current = () => request.current === version && scopeRef.current === scopeKey && !abort.signal.aborted;
    const existing = resultRef.current?.scopeKey === scopeKey;
    try {
      setLoading(!existing); setRefreshing(existing); setError(null); setRefreshError('');
      const next = await readFinancialHealth({ userId, ownerId, year, month }, { signal: abort.signal, isCurrent: current });
      if (current()) setResult({ ...next, scopeKey });
    } catch (failure) {
      if (!current()) return;
      if ([401, 403].includes(failure.response?.status)) {
        setResult(null); setError(failure.response.status === 401 ? 'Tu sesión terminó. Inicia sesión para consultar tu salud financiera.' : 'Ya no tienes acceso a este hogar.');
      } else if (existing) setRefreshError('No pudimos actualizar. Se conservan los últimos datos consultados y su fecha.');
      else setError(failure.code === 'OFFLINE_MISS' ? failure.message : failure.response?.data?.error || 'Error al cargar datos');
    } finally {
      if (current()) { setLoading(false); setRefreshing(false); }
    }
  }, [userId, ownerId, year, month, scopeKey]);

  useEffect(() => {
    fetchData();
    return () => { request.current += 1; controller.current?.abort(); };
  }, [fetchData]);
  useFinancialAutoRefresh(fetchData, { enabled: Boolean(userId && ownerId) });

  const categoryData = useMemo(() => {
      const health = data || {};
      const commitments = [
        { name: 'Tarjeta Visa', value: Number(health.creditCards?.visa?.total) || 0 },
        { name: 'Tarjeta Mastercard', value: Number(health.creditCards?.mastercard?.total) || 0 },
        ...(health.projected?.details?.expenses || []).map((item) => ({
          name: item.name,
          value: Number(item.amount) || 0,
        })),
      ].filter((item) => item.value > 0).sort((a, b) => b.value - a.value);
      const undisclosed = (Number(health.summary?.totalCommitments) || 0)
        - commitments.reduce((sum, item) => sum + item.value, 0);
      if (undisclosed > 0.005) {
        commitments.push({ name: 'Compromisos sin desglose', value: undisclosed });
        commitments.sort((a, b) => b.value - a.value);
      }
      const visible = commitments.slice(0, 6);
      const remaining = commitments.slice(6).reduce((sum, item) => sum + item.value, 0);
      if (remaining > 0) visible.push({ name: 'Otros compromisos', value: remaining });
      const categories = visible.map((item, i) => ({
        ...item,
        color: CATEGORY_COLORS[i % CATEGORY_COLORS.length],
      }));
      return categories;
  }, [data]);

  const formatCurrency = (amount) => {
    if (!isAmount(amount)) return 'No disponible';
    return formatCLPExact(amount);
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

  if (loading || (!data && !error)) {
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
        <Alert severity="error" action={<IconButton aria-label="Actualizar salud financiera" onClick={fetchData}><RefreshIcon /></IconButton>}>{error}</Alert>
      </Box>
    );
  }

  const { checking, creditCards, projected, summary, alerts } = data || {};
  const pendingConversions = Number.isSafeInteger(summary?.conversionPendingCount) && summary.conversionPendingCount > 0 ? summary.conversionPendingCount : 0;
  const bankUnavailable = !isAmount(checking?.currentBalance);
  const bankStale = checking?.freshness === 'stale';
  const cached = result?.scopeKey === scopeKey && result.origin === 'cache';
  const sourceErrors = Object.values(data?.sources || {}).some(source => source?.state === 'error' || source?.state === 'unavailable');
  const amountsPartial = summary?.amountsPartial === true || pendingConversions > 0 || bankUnavailable || bankStale
    || checking?.freshness === 'unknown' || cached || Boolean(refreshError) || sourceErrors;
  const evaluationColor = amountsPartial ? theme.palette.warning.main : getHealthColor(summary?.healthStatus);
  
  // Calculate totals for flow section
  const totalIncome = projected?.income ?? null;
  const totalCommitments = summary?.totalCommitments ?? null;
  const projectedResult = summary?.projectedBalance ?? null;
  const netBalance = isAmount(totalIncome) && isAmount(totalCommitments) ? totalIncome - totalCommitments : null;
  const commitmentPercent = totalIncome > 0 && isAmount(totalCommitments) ? (totalCommitments / totalIncome) * 100 : null;
  const commitmentLabel = commitmentPercent === null
    ? 'Sin ingresos de referencia'
    : `${new Intl.NumberFormat('es-CL', { maximumFractionDigits: 1 }).format(commitmentPercent)}% comprometido${amountsPartial ? ' · parcial' : ''}`;
  
  // Month name for display
  const monthName = new Date(year, month - 1).toLocaleDateString('es-CL', { month: 'long', year: 'numeric' });
  const upcoming = (projected?.details?.expenses || []).filter(item => typeof item.fecha === 'string'
    && /^\d{4}-\d{2}-\d{2}$/.test(item.fecha) && item.fecha.startsWith(`${year}-${String(month).padStart(2, '0')}`)
    && (!data.currentDate || item.fecha >= data.currentDate)).sort((a, b) => a.fecha.localeCompare(b.fecha)).slice(0, 5);

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
            <IconButton aria-label="Actualizar salud financiera" onClick={fetchData} disabled={refreshing} size="small" sx={{ bgcolor: alpha(theme.palette.primary.main, 0.1) }}>
              <RefreshIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      <Typography variant="body1" fontWeight={600} sx={{ mb: 1 }}>Compromisos a pagar en {monthName}</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>El saldo es la última referencia bancaria guardada; el período seleccionado corresponde a los compromisos a pagar.</Typography>
      {refreshing && <LinearProgress aria-label="Actualizando salud financiera" sx={{ mb: 1.5 }} />}
      {cached && <Alert severity="info" sx={{ mb: 1.5 }}>Datos guardados del {timeLabel(result.cachedAt)}. No se pudo consultar una versión nueva; esta copia no confirma el saldo actual.</Alert>}
      {refreshError && <Alert severity="warning" sx={{ mb: 1.5 }}>{refreshError}</Alert>}
      {bankUnavailable && <Alert severity="warning" sx={{ mb: 1.5 }}>Saldo bancario no disponible</Alert>}
      {bankStale && <Alert severity="warning" sx={{ mb: 1.5 }}>El saldo bancario tiene más de 24 horas. Se muestra el último dato conocido y la evaluación es parcial.</Alert>}
      {amountsPartial && <Alert severity="warning" data-testid="financial-partial-warning" sx={{ mb: 2 }}>
        {pendingConversions > 0 ? `${pendingConversions} ${pendingConversions === 1 ? 'movimiento' : 'movimientos'} USD sin conversión.` : 'La vigencia o disponibilidad de las fuentes no está completamente verificada.'} Los compromisos, la evaluación y la proyección en CLP son parciales; no representan un saldo definitivo.
        {[...new Set(Array.isArray(summary?.partialReasons) ? summary.partialReasons : [])].filter(code => Object.prototype.hasOwnProperty.call(PARTIAL_REASONS, code)).map(code => <Typography key={code} variant="body2" component="p" sx={{ mt: 0.5 }}>{PARTIAL_REASONS[code]}</Typography>)}
      </Alert>}

      <Paper component="section" aria-label="Vigencia de los datos" variant="outlined" sx={{ p: 1.5, mb: 2, overflowWrap: 'anywhere' }}>
        <Typography variant="body2">Resumen consultado: {timeLabel(data?.generatedAt || result?.cachedAt)}</Typography>
        <Typography variant="body2">Actualización bancaria: {timeLabel(checking?.bankUpdatedAt || checking?.lastUpdated)}</Typography>
        <Typography variant="caption" color="text.secondary" component="p">Consulta guardada del banco: {timeLabel(checking?.queriedAt)}</Typography>
        {[
          ['national', 'Tarjetas nacionales'], ['international', 'Tarjetas internacionales'],
          ['installments', 'Cuotas'], ['projected', 'Proyecciones'],
        ].map(([key, name]) => <Typography key={key} variant="caption" component="p" sx={{ mt: 0.5 }}>
          {name}: {sourceLabel(data?.sources?.[key])} · {timeLabel(data?.sources?.[key]?.asOf)}
        </Typography>)}
        <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 1 }}>El refresco automático consulta la web; no inicia otra sincronización con el banco.</Typography>
      </Paper>

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
              Disponible y compromisos
            </Typography>
            
            <Grid container spacing={2} alignItems="stretch">
              <Grid item xs={12} sm={4}>
                <Box component="section" aria-label="Saldo disponible bancario" sx={{ textAlign: 'center', py: 1 }}>
                  <WalletIcon sx={{ fontSize: 28, color: theme.palette.primary.main, mb: 0.5 }} />
                  <Typography variant="caption" color="text.secondary" display="block">Saldo disponible bancario</Typography>
                  <Typography variant="h6" fontWeight={700} color={bankUnavailable ? 'text.secondary' : 'primary.main'} sx={{ fontVariantNumeric: 'tabular-nums', overflowWrap: 'anywhere' }}>{formatCurrency(checking?.currentBalance)}</Typography>
                  <Typography variant="caption" color="text.secondary">{bankStale ? 'Último dato conocido' : 'Referencia bancaria guardada'}</Typography>
                </Box>
              </Grid>
              <Grid item xs={12} sm={4}>
                <Box component="section" aria-label="Compromisos del período" sx={{ textAlign: 'center', py: 1 }}>
                  <Typography variant="caption" color="text.secondary" display="block">Compromisos del período</Typography>
                  <Typography variant="h6" fontWeight={700} color={isAmount(totalCommitments) ? 'error.main' : 'text.secondary'} sx={{ fontVariantNumeric: 'tabular-nums', overflowWrap: 'anywhere' }}>{formatCurrency(totalCommitments)}</Typography>
                  <Typography variant="caption" color="text.secondary">Tarjetas y gastos proyectados</Typography>
                </Box>
              </Grid>
              <Grid item xs={12} sm={4}>
                <Box component="section" aria-label="Resultado previsto" sx={{ textAlign: 'center', py: 1 }}>
                  {isAmount(projectedResult) && (projectedResult >= 0 ? <TrendingUpIcon sx={{ fontSize: 28, color: 'success.main', mb: 0.5 }} /> : <TrendingDownIcon sx={{ fontSize: 28, color: 'error.main', mb: 0.5 }} />)}
                  <Typography variant="caption" color="text.secondary" display="block">{amountsPartial ? 'Proyección parcial fin de mes' : 'Proyección fin de mes'}</Typography>
                  <Typography variant="h6" fontWeight={700} color={amountColor(projectedResult)} sx={{ fontVariantNumeric: 'tabular-nums', overflowWrap: 'anywhere' }}>{isAmount(projectedResult) && projectedResult >= 0 ? '+' : ''}{formatCurrency(projectedResult)}</Typography>
                </Box>
              </Grid>
            </Grid>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1, mt: 2, pt: 1.5, borderTop: '1px solid', borderColor: 'divider' }}>
              <CircularProgress variant="determinate" size={28} value={!amountsPartial && isAmount(summary?.healthScore) ? summary.healthScore : 0} sx={{ color: evaluationColor }} aria-label="Indicador de evaluación financiera" />
              <Typography variant="body2" sx={{ color: evaluationColor, fontWeight: 600 }}>{bankUnavailable ? 'Evaluación no disponible' : amountsPartial ? 'Evaluación parcial' : getHealthLabel(summary?.healthStatus)}</Typography>
              {!amountsPartial && isAmount(summary?.healthScore) && <Typography variant="caption" color="text.secondary">{summary.healthScore}/100</Typography>}
            </Box>
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
                { name: 'Tarjetas de Crédito', amount: creditCards?.combined ?? null },
                ...(projected?.details?.expenses || [])
              ].filter(item => isAmount(item.amount)).sort((a, b) => b.amount - a.amount);
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
                            {projected?.income === null ? 'Ingresos no disponibles' : 'Sin ingresos configurados'}
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
                      <Typography variant="body2" color="text.secondary" fontWeight={600}>{amountsPartial ? 'COMPROMISOS PARCIALES' : 'COMPROMISOS'}</Typography>
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
                          {isAmount(totalCommitments) ? '-' : ''}{formatCurrency(totalCommitments)}
                        </Typography>
                      </Box>
                    </Box>
                  </Grid>
                  
                  {/* Resultado */}
                  <Grid item xs={12} md={4}>
                    <Box sx={{ 
                      p: 2, 
                      borderRadius: 2, 
                      bgcolor: !isAmount(projectedResult) ? 'background.default' : projectedResult >= 0
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
                        NETEO DEL MES{amountsPartial ? ' · PARCIAL' : ''}
                      </Typography>
                      <Typography 
                        variant="h6" 
                        fontWeight={600} 
                        color={amountColor(netBalance)}
                        sx={{ mb: 1.5 }}
                      >
                        {isAmount(netBalance) && netBalance >= 0 ? '+' : ''}{formatCurrency(netBalance)}
                      </Typography>
                      
                      {/* Resultado proyectado (con saldo inicial) */}
                      <Typography variant="caption" color="text.secondary" fontWeight={500}>
                        RESULTADO PROYECTADO{amountsPartial ? ' PARCIAL' : ''}
                      </Typography>
                      <Typography 
                        variant="h5" 
                        fontWeight={700} 
                        color={amountColor(projectedResult)}
                      >
                        {isAmount(projectedResult) && projectedResult >= 0 ? '+' : ''}{formatCurrency(projectedResult)}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5 }}>
                        (incluye el saldo bancario guardado)
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
                  {commitmentLabel}
                </Typography>
              </Box>
              <LinearProgress 
                variant="determinate" 
                value={commitmentPercent === null ? 0 : Math.min(100, commitmentPercent)}
                aria-label="Proporción visual de compromisos sobre ingresos"
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

        <Paper component="section" aria-label="Próximos compromisos" variant="outlined" sx={{ p: 2, minWidth: 0 }}>
          <Typography variant="subtitle1" fontWeight={600}>Próximos compromisos</Typography>
          <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 0.5 }}>Fechas de proyecciones del período. Los vencimientos de tarjetas se consultan en sus cartolas.</Typography>
          {upcoming.length ? upcoming.map((item, index) => <Box key={`${item.fecha}:${index}`} sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'baseline', mt: 1.5 }}>
            <Typography variant="body2" color="text.secondary">{item.fecha.split('-').reverse().join('/')}</Typography>
            <Typography variant="body2" sx={{ flex: '1 1 140px', minWidth: 0, overflowWrap: 'anywhere' }}>{item.name}</Typography>
            <Typography variant="body2" fontWeight={600}>{formatCurrency(item.amount)}</Typography>
          </Box>) : <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>{data?.sources?.projected?.state === 'error' ? 'No se pudieron consultar las fechas de proyecciones.' : 'No hay fechas futuras de proyecciones registradas en este período.'}</Typography>}
        </Paper>

        {/* ===== EN QUÉ GASTAMOS + TARJETAS ===== */}
        <Box sx={{ display: 'flex', gap: 2, flexDirection: { xs: 'column', md: 'row' } }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
          <Paper elevation={0} sx={{ p: 2, border: `1px solid ${theme.palette.divider}`, height: '100%' }}>
            <Typography variant="overline" color="text.secondary" sx={{ mb: 2, display: 'block' }}>
              {amountsPartial ? 'Composición parcial de compromisos' : 'Composición de compromisos'}
            </Typography>
            
            {categoryData.length > 0 ? (
              <Grid container spacing={2}>
                <Grid item xs={12} md={5}>
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
                <Grid item xs={12} md={7}>
                  {categoryData.map((cat, idx) => {
                    const percent = isAmount(totalCommitments) && totalCommitments > 0 ? Math.round((cat.value / totalCommitments) * 100) : null;
                    return (
                      <Box key={idx} sx={{ display: 'flex', alignItems: 'center', mb: 1.5 }}>
                        <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: cat.color, mr: 1 }} />
                        <Typography variant="body2" sx={{ flex: 1 }} noWrap>{cat.name}</Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ mr: 1 }}>{percent === null ? '—' : `${percent}%`}</Typography>
                        <Typography variant="body2" fontWeight={600}>{formatCurrency(cat.value)}</Typography>
                      </Box>
                    );
                  })}
                </Grid>
              </Grid>
            ) : (
              <Box sx={{ textAlign: 'center', py: 4 }}>
                <Typography color="text.secondary">Sin compromisos registrados este período</Typography>
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
                      {creditCards?.visa?.payments > 0 ? `-${formatCurrency(creditCards.visa.payments)}` : formatCurrency(creditCards?.visa?.payments)}
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
                      {creditCards?.mastercard?.payments > 0 ? `-${formatCurrency(creditCards.mastercard.payments)}` : formatCurrency(creditCards?.mastercard?.payments)}
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
