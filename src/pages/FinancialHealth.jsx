import React, { useState, useEffect } from 'react';
import {
  Container,
  Grid,
  Paper,
  Typography,
  Box,
  Card,
  CardContent,
  CircularProgress,
  Alert,
  Chip,
  Divider,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  LinearProgress,
  IconButton,
  Tooltip,
  useTheme
} from '@mui/material';
import {
  AccountBalance as BankIcon,
  CreditCard as CardIcon,
  TrendingUp as IncomeIcon,
  TrendingDown as ExpenseIcon,
  Warning as WarningIcon,
  CheckCircle as CheckIcon,
  Error as ErrorIcon,
  Info as InfoIcon,
  Refresh as RefreshIcon,
  ArrowForward as ArrowIcon
} from '@mui/icons-material';
import axios from '../config/axios';

const FinancialHealth = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);
  const theme = useTheme();

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await axios.get('/api/financial-health/summary');
      setData(response.data);
    } catch (err) {
      console.error('Error fetching financial health:', err);
      setError(err.response?.data?.error || 'Error al cargar datos de salud financiera');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

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
      <Container maxWidth="lg" sx={{ mt: 4, mb: 4, textAlign: 'center' }}>
        <CircularProgress size={60} />
        <Typography sx={{ mt: 2 }} variant="h6">
          Calculando tu salud financiera...
        </Typography>
      </Container>
    );
  }

  if (error) {
    return (
      <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
        <Alert severity="error">{error}</Alert>
      </Container>
    );
  }

  const { checking, creditCards, projected, summary, targetMonth, alerts } = data;

  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h4" fontWeight="bold">
            💰 Salud Financiera
          </Typography>
          <Typography variant="subtitle1" color="text.secondary">
            Proyección para {targetMonth?.name}
          </Typography>
        </Box>
        <Tooltip title="Actualizar datos">
          <IconButton onClick={fetchData} color="primary">
            <RefreshIcon />
          </IconButton>
        </Tooltip>
      </Box>

      {/* Alertas */}
      {alerts && alerts.length > 0 && (
        <Box sx={{ mb: 3 }}>
          {alerts.map((alert, idx) => (
            <Alert 
              key={idx} 
              severity={alert.type === 'critical' ? 'error' : alert.type === 'warning' ? 'warning' : 'info'}
              sx={{ mb: 1 }}
            >
              <strong>{alert.title}:</strong> {alert.message}
            </Alert>
          ))}
        </Box>
      )}

      <Grid container spacing={3}>
        {/* Health Score Card */}
        <Grid item xs={12} md={4}>
          <Paper 
            elevation={3} 
            sx={{ 
              p: 3, 
              height: '100%',
              background: `linear-gradient(135deg, ${getHealthColor(summary?.healthStatus)}22 0%, ${getHealthColor(summary?.healthStatus)}11 100%)`,
              border: `2px solid ${getHealthColor(summary?.healthStatus)}44`
            }}
          >
            <Box sx={{ textAlign: 'center' }}>
              <Typography variant="h6" gutterBottom>
                Indicador de Salud
              </Typography>
              
              {/* Circular Progress */}
              <Box sx={{ position: 'relative', display: 'inline-flex', my: 2 }}>
                <CircularProgress
                  variant="determinate"
                  value={summary?.healthScore || 0}
                  size={120}
                  thickness={8}
                  sx={{ color: getHealthColor(summary?.healthStatus) }}
                />
                <Box
                  sx={{
                    top: 0,
                    left: 0,
                    bottom: 0,
                    right: 0,
                    position: 'absolute',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexDirection: 'column'
                  }}
                >
                  <Typography variant="h4" fontWeight="bold">
                    {summary?.healthScore || 0}%
                  </Typography>
                </Box>
              </Box>
              
              <Chip 
                icon={getHealthIcon(summary?.healthStatus)}
                label={getHealthLabel(summary?.healthStatus)}
                sx={{ 
                  bgcolor: getHealthColor(summary?.healthStatus),
                  color: 'white',
                  fontWeight: 'bold',
                  fontSize: '1rem',
                  py: 2
                }}
              />
            </Box>
          </Paper>
        </Grid>

        {/* Saldo Actual */}
        <Grid item xs={12} md={8}>
          <Paper elevation={3} sx={{ p: 3, height: '100%' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
              <BankIcon sx={{ mr: 1, color: theme.palette.primary.main }} />
              <Typography variant="h6">
                Saldo Actual (Cuenta Corriente)
              </Typography>
            </Box>
            
            <Typography variant="h3" fontWeight="bold" color="primary">
              {formatCurrency(checking?.currentBalance)}
            </Typography>
            
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              Tu dinero disponible hoy
            </Typography>

            <Divider sx={{ my: 2 }} />

            {/* Resumen rápido */}
            <Grid container spacing={2}>
              <Grid item xs={6}>
                <Typography variant="body2" color="text.secondary">
                  Compromisos del mes
                </Typography>
                <Typography variant="h6" color="error.main">
                  -{formatCurrency(summary?.totalCommitments)}
                </Typography>
              </Grid>
              <Grid item xs={6}>
                <Typography variant="body2" color="text.secondary">
                  Saldo proyectado
                </Typography>
                <Typography 
                  variant="h6" 
                  color={summary?.projectedBalance >= 0 ? 'success.main' : 'error.main'}
                >
                  {formatCurrency(summary?.projectedBalance)}
                </Typography>
              </Grid>
            </Grid>
          </Paper>
        </Grid>

        {/* Tarjetas de Crédito */}
        <Grid item xs={12}>
          <Paper elevation={3} sx={{ p: 3 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
              <CardIcon sx={{ mr: 1, color: theme.palette.secondary.main }} />
              <Typography variant="h6">
                Compromisos Tarjetas de Crédito
              </Typography>
              <Chip 
                label={formatCurrency(creditCards?.combined)} 
                color="error" 
                sx={{ ml: 'auto' }}
              />
            </Box>

            <Grid container spacing={3}>
              {/* Visa */}
              <Grid item xs={12} md={6}>
                <Card variant="outlined" sx={{ bgcolor: '#1A1F7111' }}>
                  <CardContent>
                    <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                      <Box 
                        sx={{ 
                          bgcolor: '#1A1F71', 
                          color: 'white', 
                          px: 2, 
                          py: 0.5, 
                          borderRadius: 1,
                          fontWeight: 'bold'
                        }}
                      >
                        VISA
                      </Box>
                      <Typography variant="h6" sx={{ ml: 'auto' }}>
                        {formatCurrency(creditCards?.visa?.total)}
                      </Typography>
                    </Box>
                    
                    <List dense>
                      <ListItem>
                        <ListItemText primary="No facturado nacional" />
                        <Typography>{formatCurrency(creditCards?.visa?.unbilled)}</Typography>
                      </ListItem>
                      <ListItem>
                        <ListItemText primary="Cuotas" />
                        <Typography>{formatCurrency(creditCards?.visa?.installments)}</Typography>
                      </ListItem>
                      <ListItem>
                        <ListItemText primary="Internacional" />
                        <Typography>{formatCurrency(creditCards?.visa?.international)}</Typography>
                      </ListItem>
                      {creditCards?.visa?.payments > 0 && (
                        <ListItem>
                          <ListItemText primary="Pagos realizados" />
                          <Typography color="success.main">-{formatCurrency(creditCards?.visa?.payments)}</Typography>
                        </ListItem>
                      )}
                    </List>
                  </CardContent>
                </Card>
              </Grid>

              {/* Mastercard */}
              <Grid item xs={12} md={6}>
                <Card variant="outlined" sx={{ bgcolor: '#EB001B11' }}>
                  <CardContent>
                    <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                      <Box 
                        sx={{ 
                          bgcolor: '#EB001B', 
                          color: 'white', 
                          px: 2, 
                          py: 0.5, 
                          borderRadius: 1,
                          fontWeight: 'bold'
                        }}
                      >
                        MASTERCARD
                      </Box>
                      <Typography variant="h6" sx={{ ml: 'auto' }}>
                        {formatCurrency(creditCards?.mastercard?.total)}
                      </Typography>
                    </Box>
                    
                    <List dense>
                      <ListItem>
                        <ListItemText primary="No facturado nacional" />
                        <Typography>{formatCurrency(creditCards?.mastercard?.unbilled)}</Typography>
                      </ListItem>
                      <ListItem>
                        <ListItemText primary="Cuotas" />
                        <Typography>{formatCurrency(creditCards?.mastercard?.installments)}</Typography>
                      </ListItem>
                      <ListItem>
                        <ListItemText primary="Internacional" />
                        <Typography>{formatCurrency(creditCards?.mastercard?.international)}</Typography>
                      </ListItem>
                      {creditCards?.mastercard?.payments > 0 && (
                        <ListItem>
                          <ListItemText primary="Pagos realizados" />
                          <Typography color="success.main">-{formatCurrency(creditCards?.mastercard?.payments)}</Typography>
                        </ListItem>
                      )}
                    </List>
                  </CardContent>
                </Card>
              </Grid>
            </Grid>
          </Paper>
        </Grid>

        {/* Gastos e Ingresos Proyectados */}
        <Grid item xs={12} md={6}>
          <Paper elevation={3} sx={{ p: 3, height: '100%' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
              <ExpenseIcon sx={{ mr: 1, color: theme.palette.error.main }} />
              <Typography variant="h6">
                Gastos Fijos Proyectados
              </Typography>
              <Chip 
                label={formatCurrency(projected?.expenses)} 
                color="error" 
                size="small"
                sx={{ ml: 'auto' }}
              />
            </Box>
            
            {projected?.details?.expenses?.length > 0 ? (
              <List dense>
                {projected.details.expenses.map((item, idx) => (
                  <ListItem key={idx}>
                    <ListItemIcon>
                      <ArrowIcon fontSize="small" color="error" />
                    </ListItemIcon>
                    <ListItemText primary={item.name} />
                    <Typography color="error.main">
                      {formatCurrency(item.amount)}
                    </Typography>
                  </ListItem>
                ))}
              </List>
            ) : (
              <Typography color="text.secondary" sx={{ fontStyle: 'italic' }}>
                No hay gastos fijos configurados
              </Typography>
            )}
          </Paper>
        </Grid>

        <Grid item xs={12} md={6}>
          <Paper elevation={3} sx={{ p: 3, height: '100%' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
              <IncomeIcon sx={{ mr: 1, color: theme.palette.success.main }} />
              <Typography variant="h6">
                Ingresos Proyectados
              </Typography>
              <Chip 
                label={formatCurrency(projected?.income)} 
                color="success" 
                size="small"
                sx={{ ml: 'auto' }}
              />
            </Box>
            
            {projected?.details?.income?.length > 0 ? (
              <List dense>
                {projected.details.income.map((item, idx) => (
                  <ListItem key={idx}>
                    <ListItemIcon>
                      <ArrowIcon fontSize="small" color="success" />
                    </ListItemIcon>
                    <ListItemText primary={item.name} />
                    <Typography color="success.main">
                      {formatCurrency(item.amount)}
                    </Typography>
                  </ListItem>
                ))}
              </List>
            ) : (
              <Typography color="text.secondary" sx={{ fontStyle: 'italic' }}>
                No hay ingresos proyectados configurados
              </Typography>
            )}
          </Paper>
        </Grid>

        {/* Proyección Final */}
        <Grid item xs={12}>
          <Paper 
            elevation={3} 
            sx={{ 
              p: 3, 
              background: summary?.projectedBalance >= 0 
                ? 'linear-gradient(135deg, #4caf5022 0%, #4caf5011 100%)'
                : 'linear-gradient(135deg, #f4433622 0%, #f4433611 100%)'
            }}
          >
            <Typography variant="h6" gutterBottom>
              📊 Proyección para {targetMonth?.name}
            </Typography>
            
            <Grid container spacing={2} alignItems="center">
              <Grid item xs={12} md={3}>
                <Typography variant="body2" color="text.secondary">Saldo actual</Typography>
                <Typography variant="h6">{formatCurrency(checking?.currentBalance)}</Typography>
              </Grid>
              <Grid item xs={12} md={3}>
                <Typography variant="body2" color="text.secondary">+ Ingresos</Typography>
                <Typography variant="h6" color="success.main">+{formatCurrency(projected?.income)}</Typography>
              </Grid>
              <Grid item xs={12} md={3}>
                <Typography variant="body2" color="text.secondary">- Compromisos</Typography>
                <Typography variant="h6" color="error.main">-{formatCurrency(summary?.totalCommitments)}</Typography>
              </Grid>
              <Grid item xs={12} md={3}>
                <Typography variant="body2" color="text.secondary">= Saldo proyectado</Typography>
                <Typography 
                  variant="h4" 
                  fontWeight="bold"
                  color={summary?.projectedBalance >= 0 ? 'success.main' : 'error.main'}
                >
                  {formatCurrency(summary?.projectedBalance)}
                </Typography>
              </Grid>
            </Grid>

            {/* Barra de progreso */}
            <Box sx={{ mt: 3 }}>
              <LinearProgress 
                variant="determinate" 
                value={Math.min(100, Math.max(0, summary?.healthScore || 0))}
                sx={{ 
                  height: 10, 
                  borderRadius: 5,
                  bgcolor: 'grey.200',
                  '& .MuiLinearProgress-bar': {
                    bgcolor: getHealthColor(summary?.healthStatus)
                  }
                }}
              />
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 1 }}>
                <Typography variant="caption" color="error">Crítico</Typography>
                <Typography variant="caption" color="warning.main">Precaución</Typography>
                <Typography variant="caption" color="success.light">Saludable</Typography>
                <Typography variant="caption" color="success.main">Excelente</Typography>
              </Box>
            </Box>
          </Paper>
        </Grid>
      </Grid>
    </Container>
  );
};

export default FinancialHealth;
