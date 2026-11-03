import React, { useEffect, useRef, useState } from 'react';
import { Alert, Box, Paper, Stack, Typography } from '@mui/material';
import axios from '../config/axios';
import { useAuth } from '../contexts/AuthContext';
import { useSpace } from '../contexts/SpaceContext';
import useFinancialAutoRefresh from '../hooks/useFinancialAutoRefresh';
import useOffline from '../hooks/useOffline';

const PATH = '/api/checking/fintoc/bank-balance';
const EMPTY = { balance: null, loading: true, forbidden: false, error: null };
const integer = value => typeof value === 'string' && /^-?(0|[1-9]\d{0,19})$/.test(value);
const validTime = value => value === null || (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value)));
const timestamp = new Intl.DateTimeFormat('es-CL', {
  timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
});
const timeLabel = value => value ? timestamp.format(new Date(value)) : 'Sin fecha disponible';
// Render integer peso strings directly: neither formatting nor comparison rounds them.
const pesoLabel = value => {
  const negative = value.startsWith('-') && !/^-0$/.test(value);
  const digits = value.replace(/^-/, '');
  return `${negative ? '-' : ''}$${digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;
};
function validBalance(data) {
  if (data?.provider !== 'fintoc' || data.currency !== 'CLP' || !['available', 'unavailable'].includes(data.state)
    || !['current', 'stale', 'unknown'].includes(data.freshness) || !validTime(data.bankUpdatedAt) || !validTime(data.queriedAt)) return false;
  if (data.state === 'unavailable') return data.available === null && data.current === null
    && data.bankUpdatedAt === null && data.queriedAt === null && data.freshness === 'unknown';
  return integer(data.available) && integer(data.current) && data.queriedAt !== null
    && (data.freshness === 'unknown' || data.bankUpdatedAt !== null);
}
export default function FintocBankBalance({ year, month }) {
  const { user } = useAuth();
  const { activeSpace } = useSpace();
  const { isOffline } = useOffline();
  const canReadSpace = Boolean(user?.id && activeSpace?.ownerId && (activeSpace.isOwner === false || (activeSpace.isOwner === true && String(activeSpace.ownerId) === String(user.id))));
  const scope = `${user?.id || ''}:${activeSpace?.ownerId || ''}:${canReadSpace}:${year}:${month}`;
  const currentScope = useRef(scope);
  currentScope.current = scope;
  const generation = useRef(0);
  const [state, setState] = useState({ ...EMPTY, scope });
  const [refresh, setRefresh] = useState(0);
  const visible = state.scope === scope ? state : EMPTY;
  useFinancialAutoRefresh(() => setRefresh(value => value + 1), { enabled: canReadSpace });

  useEffect(() => {
    const version = ++generation.current;
    const controller = new AbortController();
    setState(previous => previous.scope === scope ? { ...previous, loading: true, error: null } : { ...EMPTY, scope });
    if (canReadSpace) {
      axios.get(PATH, { signal: controller.signal, headers: { 'Cache-Control': 'no-store' } })
        .then(({ data }) => {
          if (controller.signal.aborted || generation.current !== version || currentScope.current !== scope) return;
          setState({ ...EMPTY, scope, loading: false, ...(validBalance(data)
            ? { balance: data } : { error: 'No se pudo verificar el saldo bancario.' }) });
        })
        .catch(error => {
          if (controller.signal.aborted || generation.current !== version || currentScope.current !== scope) return;
          setState(previous => ({ ...EMPTY, scope, loading: false,
            balance: ![401, 403].includes(error?.response?.status) && previous.scope === scope ? previous.balance : null,
            forbidden: error?.response?.status === 403,
            error: error?.response?.status === 401 ? 'Tu sesión terminó. Inicia sesión para consultar el saldo bancario.'
              : 'No se pudo actualizar el saldo bancario guardado.' }));
        });
    }
    return () => { generation.current += 1; controller.abort(); };
  }, [scope, canReadSpace, refresh]);

  if (!canReadSpace || visible.forbidden) return null;
  const balance = visible.balance;
  const verified = balance?.freshness === 'current' && !visible.error && !isOffline;
  return (
    <Paper component="section" role="region" aria-label="Saldo bancario Fintoc" data-testid="fintoc-bank-balance"
      variant="outlined" aria-busy={visible.loading}
      sx={{ p: { xs: 2, sm: 2.5 }, mb: 2, minWidth: 0, overflowWrap: 'anywhere', borderTop: '3px solid', borderTopColor: 'primary.main' }}>
      <Typography component="h2" variant="subtitle1" fontWeight={700}>Saldo informado por el banco</Typography>
      {visible.loading && <Typography role="status" variant="body2" color="text.secondary" sx={{ mt: 1 }}>Consultando saldo bancario…</Typography>}
      {visible.error && <Alert severity="error" sx={{ mt: 1 }}>{visible.error}</Alert>}
      {balance?.state === 'unavailable' && <Box sx={{ mt: 1 }}>
        <Typography variant="body1" fontWeight={600}>Saldo bancario no disponible</Typography>
        <Typography variant="body2" color="text.secondary">Cuando exista una sincronización bancaria válida, se mostrará aquí su saldo guardado.</Typography>
      </Box>}
      {balance?.state === 'available' && <>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={{ xs: 1, sm: 4 }} sx={{ mt: 1.5, alignItems: { sm: 'center' }, minWidth: 0 }}>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="body2" color="text.secondary">{verified ? 'Saldo disponible' : 'Último saldo bancario conocido'}</Typography>
            <Typography variant="h4" component="p" data-testid="bank-available-value" fontWeight={750}
              sx={{ mt: 0.25, fontSize: { xs: '1.9rem', sm: '2.25rem' }, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.025em', lineHeight: 1.25 }}>
              {pesoLabel(balance.available)}
            </Typography>
          </Box>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="body2" fontWeight={600}>Saldo contable: {pesoLabel(balance.current)}</Typography>
            <Typography variant="caption" color="text.secondary">El disponible no incluye línea de crédito.</Typography>
          </Box>
        </Stack>
        <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 1.5, mb: 0 }}>Actualización bancaria: {timeLabel(balance.bankUpdatedAt)}</Typography>
        <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 0.25, mb: 0 }}>Consulta del saldo: {timeLabel(balance.queriedAt)}</Typography>
        {isOffline && <Alert severity="warning" sx={{ mt: 1.25 }}>Sin conexión. Se muestra el último saldo bancario consultado.</Alert>}
        {balance.freshness === 'stale' && <Alert severity="warning" sx={{ mt: 1.25 }}>La actualización bancaria tiene más de 24 horas. El banco puede mostrar un saldo más reciente.</Alert>}
        {balance.freshness === 'unknown' && <Alert severity="warning" sx={{ mt: 1.25 }}>No hay una fecha bancaria válida para comprobar la vigencia de este saldo.</Alert>}
      </>}
    </Paper>
  );
}
