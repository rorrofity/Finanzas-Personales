import React, { useEffect, useRef, useState } from 'react';
import { Alert, Box, Button, CircularProgress, Stack, Typography } from '@mui/material';
import axios from '../config/axios';
import { useAuth } from '../contexts/AuthContext';
import { useSpace } from '../contexts/SpaceContext';

const STATUS_PATH = '/api/checking/fintoc/daily-status';
const REVIEW_PATH = '/api/checking/fintoc/review';
const PAGE_SIZE = 20;
const EMPTY = { status: null, statusLoading: true, review: null, reviewLoading: false, error: null, reviewError: null, forbidden: false };
const STATES = {
  disabled: 'Sincronización diaria desactivada',
  not_initialized: 'Esperando la primera consulta completa',
  current: 'Sincronización al día',
  stale: 'Información bancaria desactualizada',
  needs_review: 'Hay movimientos pendientes de revisión',
  error: 'La última sincronización no se completó',
};
const REASONS = {
  ambiguous_match: 'Hay varias coincidencias posibles con tus registros existentes.',
  initial_unmatched: 'Movimiento de la historia inicial sin una coincidencia inequívoca.',
  before_cutover: 'Movimiento anterior o igual al corte inicial; requiere revisión.',
  provider_changed: 'El banco cambió los datos de un movimiento ya conocido.',
  provider_reversed: 'El banco informó una reversión; tu registro se conserva.',
  provider_missing: 'El banco ya no incluye un movimiento conocido; tu registro se conserva.',
  financial_record_removed: 'El registro local vinculado ya no está disponible; requiere revisión.',
  future_date: 'El banco informó una fecha futura; requiere revisión.',
  amount_out_of_range: 'El importe excede el límite permitido; requiere revisión.',
};
const BANK_STATUSES = {
  confirmed: 'Confirmado', pending: 'Pendiente bancario', processing: 'En proceso',
  reversed: 'Revertido', cancelled: 'Anulado', canceled: 'Anulado',
};
const timestamp = new Intl.DateTimeFormat('es-CL', {
  timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit',
});
const count = (value) => Number.isSafeInteger(value) && value >= 0;
const labelFor = (labels, key, fallback) => Object.prototype.hasOwnProperty.call(labels, key) ? labels[key] : fallback;
const validTime = (value) => value === null || (typeof value === 'string'
  && /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value)));
const validDay = (value) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
};
const dayLabel = (value) => value.split('-').reverse().join('/');
const timeLabel = (value) => value ? timestamp.format(new Date(value)) : 'Sin fecha disponible';
// Keep peso strings intact, including values above JavaScript's integer precision.
const pesoLabel = (value) => `$${value.replace(/^0+(?=\d)/, '').replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;

function validStatus(data) {
  return data?.provider === 'fintoc' && typeof data.enabled === 'boolean'
    && data.schedule === '07:00' && data.timezone === 'America/Santiago'
    && Object.prototype.hasOwnProperty.call(STATES, data.state)
    && typeof data.initialized === 'boolean'
    && (data.cutoverDate === null || validDay(data.cutoverDate))
    && validTime(data.lastSuccessAt) && validTime(data.bankUpdatedAt)
    && ['current', 'stale', 'unknown'].includes(data.bankFreshness)
    && typeof data.coverage?.complete === 'boolean'
    && (data.coverage.since === null || validDay(data.coverage.since))
    && (data.coverage.until === null || validDay(data.coverage.until))
    && (!data.coverage.complete || (validDay(data.coverage.since) && validDay(data.coverage.until)
      && data.coverage.since <= data.coverage.until))
    && count(data.pendingReviewCount) && count(data.importedTotal)
    && (data.lastRun === null || (['initial', 'manual', 'scheduled'].includes(data.lastRun?.trigger)
      && ['success', 'error'].includes(data.lastRun?.status) && count(data.lastRun?.inserted)
      && count(data.lastRun?.linked) && count(data.lastRun?.review)))
    && (data.lastErrorCode === null || typeof data.lastErrorCode === 'string');
}

function validReview(data, offset, previousItems) {
  if (!Array.isArray(data?.items) || data.items.length > PAGE_SIZE || !count(data.total)
    || data.limit !== PAGE_SIZE || data.offset !== offset || offset + data.items.length > data.total
    || (data.items.length === 0 && offset < data.total)) return false;
  const ids = new Set(previousItems.map((item) => item.externalId));
  return data.items.every((item) => {
    if (typeof item?.externalId !== 'string' || !item.externalId || ids.has(item.externalId)
      || !validDay(item.date) || typeof item.description !== 'string' || !item.description.trim()
      || !['cargo', 'abono'].includes(item.type) || typeof item.amount !== 'string' || !/^\d+$/.test(item.amount)
      || typeof item.status !== 'string' || !item.status || typeof item.reason !== 'string'
      || !count(item.candidateCount)) return false;
    ids.add(item.externalId);
    return true;
  });
}

function safeError(error, reviewing = false) {
  if (error?.response?.status === 401) return 'Tu sesión terminó. Inicia sesión para volver a consultar.';
  return reviewing
    ? 'No se pudo consultar la lista de pendientes. Inténtalo más tarde.'
    : 'No se pudo consultar la sincronización diaria. Inténtalo más tarde.';
}

export default function FintocDailySyncStatus({ year, month }) {
  const { user } = useAuth();
  const { activeSpace } = useSpace();
  const canReadSpace = Boolean(user?.id && activeSpace?.ownerId && (activeSpace.isOwner === false || (activeSpace.isOwner === true && String(activeSpace.ownerId) === String(user.id))));
  const scope = `${user?.id || ''}:${activeSpace?.ownerId || ''}:${canReadSpace}:${year}:${month}`;
  const currentScope = useRef(scope);
  currentScope.current = scope;
  const generation = useRef(0);
  const reviewRequest = useRef(null);
  const [state, setState] = useState({ ...EMPTY, scope });
  const visible = state.scope === scope ? state : EMPTY;

  useEffect(() => {
    const version = ++generation.current;
    const controller = new AbortController();
    reviewRequest.current?.abort();
    setState({ ...EMPTY, scope });
    if (canReadSpace) {
      axios.get(STATUS_PATH, { signal: controller.signal, headers: { 'Cache-Control': 'no-store' } })
        .then(({ data }) => {
          if (controller.signal.aborted || version !== generation.current || currentScope.current !== scope) return;
          setState({ ...EMPTY, scope, statusLoading: false, ...(validStatus(data)
            ? { status: data }
            : { error: 'No se pudo verificar el estado de la sincronización diaria.' }) });
        })
        .catch((error) => {
          if (controller.signal.aborted || version !== generation.current || currentScope.current !== scope) return;
          setState({ ...EMPTY, scope, statusLoading: false, forbidden: error?.response?.status === 403, error: safeError(error) });
        });
    }
    return () => {
      generation.current += 1;
      controller.abort();
      reviewRequest.current?.abort();
    };
  }, [scope, canReadSpace]);

  const queryReview = async (more = false) => {
    if (!canReadSpace || !visible.status || visible.reviewLoading) return;
    const previousItems = more ? visible.review?.items || [] : [];
    const offset = previousItems.length;
    const version = generation.current;
    const controller = new AbortController();
    reviewRequest.current?.abort();
    reviewRequest.current = controller;
    setState((previous) => ({ ...previous, review: more ? previous.review : null, reviewLoading: true, reviewError: null }));
    try {
      const { data } = await axios.get(REVIEW_PATH, {
        params: { limit: PAGE_SIZE, offset }, signal: controller.signal, headers: { 'Cache-Control': 'no-store' },
      });
      if (controller.signal.aborted || version !== generation.current || currentScope.current !== scope) return;
      if (!validReview(data, offset, previousItems)) {
        setState((previous) => ({ ...previous, reviewLoading: false, reviewError: 'No se pudo verificar la lista de pendientes.' }));
        return;
      }
      setState((previous) => ({ ...previous, reviewLoading: false, review: { ...data, items: [...previousItems, ...data.items] } }));
    } catch (error) {
      if (controller.signal.aborted || version !== generation.current || currentScope.current !== scope) return;
      setState((previous) => ({ ...previous, reviewLoading: false, forbidden: error?.response?.status === 403, reviewError: safeError(error, true) }));
    }
  };

  if (!canReadSpace || visible.forbidden) return null;
  const status = visible.status;
  const review = visible.review;
  return (
    <Box component="section" role="region" aria-label="Sincronización diaria Fintoc" data-testid="fintoc-daily-status"
      aria-busy={visible.statusLoading || visible.reviewLoading}
      sx={{ mt: 1.5, pt: 1.5, borderTop: 1, borderColor: 'divider', minWidth: 0, overflowWrap: 'anywhere' }}>
      <Typography component="h3" variant="body2" fontWeight={700}>Sincronización diaria</Typography>
      <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 0.5, mb: 0 }}>
        Solo cuenta corriente; las tarjetas mantienen su sincronización actual.
      </Typography>
      {visible.statusLoading && <Typography role="status" variant="body2" color="text.secondary" sx={{ mt: 1 }}>Consultando estado diario…</Typography>}
      {visible.error && <Alert severity="error" sx={{ mt: 1 }}>{visible.error}</Alert>}
      {status && <>
        <Typography variant="body2" fontWeight={600} sx={{ mt: 1 }}>{STATES[status.state]}</Typography>
        <Typography variant="body2" color="text.secondary">Todos los días a las {status.schedule} · {status.timezone}</Typography>
        <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 0.5, mb: 0 }}>
          Última consulta completa: {timeLabel(status.lastSuccessAt)}
        </Typography>
        <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 0.5, mb: 0 }}>
          Última actualización bancaria: {timeLabel(status.bankUpdatedAt)}
        </Typography>
        {status.bankFreshness === 'stale' && <Alert severity="warning" sx={{ mt: 1 }}>El banco no registra una actualización en las últimas 24 horas.</Alert>}
        {status.bankFreshness === 'unknown' && <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>No hay una fecha bancaria disponible para comprobar su vigencia.</Typography>}
        {status.state === 'error' && <Alert severity="error" sx={{ mt: 1 }}>No se anunció una nueva consulta completa. Revisa nuevamente más tarde.</Alert>}
        <Typography variant="body2" sx={{ mt: 1 }}>
          {status.pendingReviewCount} pendientes · {status.importedTotal} importados
        </Typography>
        {status.coverage.complete && <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 0.5, mb: 0 }}>
          Rango consultado: {dayLabel(status.coverage.since)} al {dayLabel(status.coverage.until)}.
        </Typography>}
        <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 0.5, mb: 0 }}>
          La cobertura de consulta no garantiza una cartola bancaria completa.
        </Typography>
        {(status.pendingReviewCount > 0 || review) && <Button variant="outlined" size="small" onClick={() => queryReview()}
          disabled={visible.reviewLoading} sx={{ mt: 1, maxWidth: '100%', whiteSpace: 'normal' }}>
          Ver movimientos pendientes
        </Button>}
      </>}
      {visible.reviewLoading && <Stack direction="row" alignItems="center" spacing={1} sx={{ mt: 1 }}>
        <CircularProgress size={16} /><Typography role="status" variant="body2">Consultando pendientes…</Typography>
      </Stack>}
      {visible.reviewError && <Alert severity="error" sx={{ mt: 1 }}>{visible.reviewError}</Alert>}
      {review && <Box sx={{ mt: 1.5, minWidth: 0 }}>
        {review.items.length === 0
          ? <Typography variant="body2">No hay movimientos pendientes de revisión.</Typography>
          : <Stack component="ul" aria-label="Movimientos pendientes de revisión" spacing={1} sx={{ m: 0, p: 0, listStyle: 'none', minWidth: 0 }}>
            {review.items.map((item) => <Box component="li" key={item.externalId}
              sx={{ p: 1.5, border: 1, borderColor: 'divider', borderRadius: 1.5, bgcolor: 'background.default', minWidth: 0 }}>
              <Typography variant="caption" color="text.secondary">{dayLabel(item.date)}</Typography>
              <Typography variant="body2" fontWeight={600}>{item.description}</Typography>
              <Typography variant="body1" fontWeight={700} sx={{ mt: 0.5, fontVariantNumeric: 'tabular-nums' }}>{pesoLabel(item.amount)}</Typography>
              <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
                <Typography variant="caption" color="text.secondary">{item.type === 'cargo' ? 'Cargo' : 'Abono'}</Typography>
                <Typography variant="caption" color="text.secondary">{labelFor(BANK_STATUSES, item.status, 'Otro estado bancario')}</Typography>
              </Stack>
              <Typography variant="body2" sx={{ mt: 0.5 }}>{labelFor(REASONS, item.reason, 'Este movimiento requiere revisión antes de incorporarse.')}</Typography>
              <Typography variant="caption" color="text.secondary">Coincidencias posibles: {item.candidateCount}</Typography>
            </Box>)}
          </Stack>}
        {review.items.length < review.total && <Button size="small" variant="outlined" disabled={visible.reviewLoading}
          onClick={() => queryReview(true)} sx={{ mt: 1, maxWidth: '100%', whiteSpace: 'normal' }}>Ver más pendientes</Button>}
      </Box>}
    </Box>
  );
}
