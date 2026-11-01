import React, { useEffect, useRef, useState } from 'react';
import {
  Alert, Box, Button, Chip, CircularProgress, Paper, Stack, Typography,
} from '@mui/material';
import { AccountBalanceOutlined, OpenInNew, SearchOutlined } from '@mui/icons-material';
import axios from '../config/axios';
import { useAuth } from '../contexts/AuthContext';
import { useSpace } from '../contexts/SpaceContext';
import FintocDailySyncStatus from './FintocDailySyncStatus';

const STATUS_PATH = '/api/checking/fintoc/status';
const PREVIEW_PATH = '/api/checking/fintoc/preview';
const MODES = ['live', 'test'];
const STATES = ['disabled', 'configuration_required', 'access_unconfirmed', 'ready'];
const EMPTY = { config: null, configLoading: true, preview: null, previewLoading: false, error: null, forbidden: false };
const peso = new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 });
const timestamp = new Intl.DateTimeFormat('es-CL', {
  timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit',
});

function timeLabel(value) {
  return value && Number.isFinite(new Date(value).getTime())
    ? timestamp.format(new Date(value))
    : 'Sin fecha disponible';
}

function validStatus(data) {
  return data?.provider === 'fintoc' && data.readOnly === true && data.writesEnabled === false
    && STATES.includes(data.state)
    && (data.mode === null || MODES.includes(data.mode))
    && (data.state !== 'ready' || MODES.includes(data.mode));
}

function validPreview(data, year, month, mode) {
  if (data?.provider !== 'fintoc' || data.mode !== mode || data.readOnly !== true || data.imported !== false
    || data.period?.year !== year || data.period?.month !== month || data.account?.currency !== 'CLP'
    || data.coverage?.complete !== true || !Array.isArray(data.items) || data.items.length > 3000
    || data.total !== data.items.length || !Number.isSafeInteger(data.coverage.excludedNonConfirmed)
    || data.coverage.excludedNonConfirmed < 0 || !Number.isFinite(new Date(data.queriedAt).getTime())
    || (data.bankUpdatedAt !== null && !Number.isFinite(new Date(data.bankUpdatedAt).getTime()))) return false;
  const prefix = `${year}-${String(month).padStart(2, '0')}-`;
  const ids = new Set();
  return data.items.every((item) => {
    if (typeof item.externalId !== 'string' || ids.has(item.externalId)
      || typeof item.description !== 'string' || item.status !== 'confirmed'
      || !['cargo', 'abono'].includes(item.type) || typeof item.amount !== 'string'
      || !/^\d+$/.test(item.amount) || !Number.isSafeInteger(Number(item.amount))
      || typeof item.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(item.date)
      || !item.date.startsWith(prefix)) return false;
    const date = new Date(`${item.date}T12:00:00.000Z`);
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== item.date) return false;
    ids.add(item.externalId);
    return true;
  });
}

function safeError(error) {
  const status = error?.response?.status;
  if (status === 401) return 'Tu sesión terminó. Inicia sesión para volver a consultar.';
  if (status === 403) return 'Esta conexión solo está disponible para su titular.';
  if (status === 429) return 'Fintoc alcanzó su límite de consultas. Inténtalo más tarde.';
  if (status === 504) return 'La consulta demoró demasiado. Inténtalo más tarde.';
  if (error?.response?.data?.code === 'FINTOC_NOT_READY') return 'La conexión todavía no está habilitada para consultar movimientos.';
  return 'No se pudo completar la consulta de Fintoc. Inténtalo más tarde.';
}

export default function FintocCheckingPreview({ year, month, showDailyStatus = false }) {
  const { user } = useAuth();
  const { activeSpace } = useSpace();
  const ownSpace = Boolean(user?.id && activeSpace?.isOwner
    && String(activeSpace.ownerId) === String(user.id));
  const scope = `${user?.id || ''}:${activeSpace?.ownerId || ''}:${ownSpace}:${year}:${month}`;
  const currentScope = useRef(scope);
  currentScope.current = scope;
  const generation = useRef(0);
  const previewRequest = useRef(null);
  const [state, setState] = useState({ ...EMPTY, scope });
  const visible = state.scope === scope ? state : EMPTY;

  useEffect(() => {
    const version = ++generation.current;
    const controller = new AbortController();
    previewRequest.current?.abort();
    setState({ ...EMPTY, scope });
    if (ownSpace) {
      axios.get(STATUS_PATH, { signal: controller.signal, headers: { 'Cache-Control': 'no-store' } })
        .then(({ data }) => {
          if (controller.signal.aborted || version !== generation.current || currentScope.current !== scope) return;
          if (!validStatus(data)) {
            setState({ ...EMPTY, scope, configLoading: false, error: 'No se pudo verificar el estado de la conexión.' });
            return;
          }
          setState({ ...EMPTY, scope, config: data, configLoading: false });
        })
        .catch((error) => {
          if (controller.signal.aborted || version !== generation.current || currentScope.current !== scope) return;
          setState({ ...EMPTY, scope, configLoading: false, forbidden: error?.response?.status === 403, error: safeError(error) });
        });
    }
    return () => {
      generation.current += 1;
      controller.abort();
      previewRequest.current?.abort();
    };
  }, [scope, ownSpace]);

  const query = async () => {
    if (!ownSpace || visible.config?.state !== 'ready' || visible.previewLoading) return;
    const version = generation.current;
    const controller = new AbortController();
    previewRequest.current?.abort();
    previewRequest.current = controller;
    setState((previous) => ({ ...previous, preview: null, error: null, previewLoading: true }));
    try {
      const { data } = await axios.get(PREVIEW_PATH, {
        params: { year, month }, signal: controller.signal, headers: { 'Cache-Control': 'no-store' },
      });
      if (controller.signal.aborted || version !== generation.current || currentScope.current !== scope) return;
      if (!validPreview(data, year, month, visible.config.mode)) {
        setState((previous) => ({ ...previous, previewLoading: false, error: 'La consulta no entregó un resultado completo y válido.' }));
        return;
      }
      setState((previous) => ({ ...previous, preview: data, previewLoading: false }));
    } catch (error) {
      if (controller.signal.aborted || version !== generation.current || currentScope.current !== scope) return;
      setState((previous) => ({ ...previous, preview: null, previewLoading: false, error: safeError(error) }));
    }
  };

  if (!ownSpace || visible.forbidden) return null;
  const result = visible.preview;
  const ready = visible.config?.state === 'ready';
  const monthLabel = new Intl.DateTimeFormat('es-CL', { month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(Date.UTC(year, month - 1, 1)));
  const stale = result?.bankUpdatedAt && Date.now() - new Date(result.bankUpdatedAt).getTime() > 24 * 60 * 60 * 1000;

  return (
    <Paper component="section" role="region" aria-label="Conexión Fintoc" aria-busy={visible.configLoading || visible.previewLoading}
      data-testid="fintoc-checking-preview" variant="outlined"
      sx={{ mb: 2, p: { xs: 1.5, sm: 2 }, minWidth: 0, overflowWrap: 'anywhere', borderColor: 'divider' }}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ xs: 'stretch', sm: 'center' }} justifyContent="space-between">
        <Box sx={{ minWidth: 0 }}>
          <Stack direction="row" spacing={1} alignItems="center">
            <AccountBalanceOutlined color="primary" fontSize="small" />
            <Typography variant="subtitle1" component="h2" fontWeight={700}>Movimientos con Fintoc</Typography>
          </Stack>
          <Typography variant="body2" color="text.secondary">Vista previa de solo lectura · {monthLabel}</Typography>
        </Box>
        {ready && <Button variant="outlined" onClick={query} disabled={visible.previewLoading}
          startIcon={visible.previewLoading ? <CircularProgress size={16} color="inherit" /> : <SearchOutlined />}
          sx={{ flexShrink: 0, whiteSpace: 'normal', textAlign: 'center' }}>
          Consultar movimientos con Fintoc
        </Button>}
      </Stack>

      {showDailyStatus && <FintocDailySyncStatus year={year} month={month} />}

      {visible.configLoading && <Typography role="status" variant="body2" color="text.secondary" sx={{ mt: 1 }}>Verificando conexión…</Typography>}
      {visible.config && !ready && <Box sx={{ mt: 1.5 }}>
        <Typography variant="body2" fontWeight={700}>Conexión pendiente</Typography>
        <Typography variant="body2" color="text.secondary">
          {visible.config.state === 'access_unconfirmed'
            ? 'Falta confirmar que tu acceso personal permite consultar sin costo.'
            : 'Necesitas habilitar tu cuenta Fintoc para consultar tus movimientos aquí.'}
        </Typography>
        <Button component="a" href="https://dashboard.fintoc.com/" target="_blank" rel="noopener noreferrer" size="small" endIcon={<OpenInNew fontSize="small" />} sx={{ mt: 0.5 }}>
          Abrir Fintoc
        </Button>
      </Box>}
      {visible.config?.mode === 'test' && <Chip size="small" color="warning" variant="outlined" label="Modo de prueba · Datos ficticios" sx={{ mt: 1.5, maxWidth: '100%', height: 'auto', '& .MuiChip-label': { py: 0.5, whiteSpace: 'normal' } }} />}
      {ready && <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 1, mb: 0 }}>
        Esta consulta no cambia tus gastos ni clasificaciones. Los movimientos se muestran separados de tus registros.
      </Typography>}
      {visible.error && <Alert severity="error" sx={{ mt: 1.5 }}>{visible.error}</Alert>}

      {result && <Box data-testid="fintoc-movements" sx={{ mt: 2, minWidth: 0 }}>
        <Typography variant="body2" fontWeight={700}>
          {result.account.name || 'Cuenta corriente'}{result.account.numberLast4 ? ` · •••• ${result.account.numberLast4}` : ''}
        </Typography>
        <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 0.5, mb: 0 }}>
          Consulta realizada: {timeLabel(result.queriedAt)}
        </Typography>
        <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 0.5, mb: 1.5 }}>
          Última actualización bancaria: {timeLabel(result.bankUpdatedAt)}
        </Typography>
        {stale && <Alert severity="warning" sx={{ mb: 1.5 }}>El banco no registra una actualización en las últimas 24 horas.</Alert>}
        {result.coverage.excludedNonConfirmed > 0 && <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          Se excluyeron {result.coverage.excludedNonConfirmed} movimientos pendientes o no confirmados.
        </Typography>}
        {result.items.length === 0
          ? <Typography variant="body2" sx={{ py: 1 }}>No hay movimientos confirmados en este mes.</Typography>
          : <Stack component="ul" spacing={1} aria-label="Movimientos consultados en Fintoc" sx={{ m: 0, p: 0, listStyle: 'none', minWidth: 0 }}>
            {result.items.map((item) => <Box key={item.externalId} component="li"
              sx={{ border: 1, borderColor: 'divider', borderRadius: 1.5, p: 1.5, minWidth: 0, bgcolor: 'background.default' }}>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={0.75} justifyContent="space-between" sx={{ minWidth: 0 }}>
                <Box sx={{ minWidth: 0 }}>
                  <Typography variant="caption" color="text.secondary">{item.date.split('-').reverse().join('/')}</Typography>
                  <Typography variant="body2" fontWeight={600} sx={{ overflowWrap: 'anywhere' }}>{item.description}</Typography>
                </Box>
                <Box sx={{ flexShrink: 0, textAlign: { xs: 'left', sm: 'right' } }}>
                  <Typography data-testid={`fintoc-amount-${item.externalId}`} variant="body1" fontWeight={700} sx={{ fontVariantNumeric: 'tabular-nums' }}>
                    {peso.format(Number(item.amount))}
                  </Typography>
                  <Stack direction="row" spacing={1} justifyContent={{ xs: 'flex-start', sm: 'flex-end' }}>
                    <Typography variant="caption" color={item.type === 'cargo' ? 'error.main' : 'success.main'} fontWeight={600}>{item.type === 'cargo' ? 'Cargo' : 'Abono'}</Typography>
                    <Typography variant="caption" color="text.secondary">Confirmado</Typography>
                  </Stack>
                </Box>
              </Stack>
            </Box>)}
          </Stack>}
      </Box>}
    </Paper>
  );
}
