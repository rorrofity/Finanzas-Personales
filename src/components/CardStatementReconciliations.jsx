import React, { useEffect, useRef, useState } from 'react';
import {
  Alert, Box, Button, Chip, Dialog, DialogContent, DialogTitle, Divider,
  IconButton, LinearProgress, Paper, Stack, ToggleButton, ToggleButtonGroup,
  Typography, useMediaQuery, useTheme,
} from '@mui/material';
import { Close } from '@mui/icons-material';
import axios from '../config/axios';
import { useAuth } from '../contexts/AuthContext';
import { useSpace } from '../contexts/SpaceContext';

const PATH = '/api/card-statements';
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const STATUSES = ['matched', 'missing', 'review', 'informational'];
const EMPTY = { loading: true, items: [], error: null };
const isoDay = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
const dayLabel = value => isoDay(value) ? `${value.slice(8, 10)}/${value.slice(5, 7)}/${value.slice(0, 4)}` : 'Sin fecha identificada';
const money = (value, currency) => typeof value === 'string' && (currency === 'CLP' ? /^-?(0|[1-9]\d{0,29})$/ : /^-?(0|[1-9]\d{0,27})\.\d{2}$/).test(value);
function amountLabel(value, currency) {
  if (!money(value, currency)) return 'No informado';
  const negative = value.startsWith('-'), [integer, cents] = value.replace(/^-/, '').split('.');
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${negative ? '-' : ''}${currency === 'USD' ? 'US$ ' : '$'}${grouped}${currency === 'USD' ? `,${cents}` : ''}`;
}
const validValidation = data => typeof data?.valid === 'boolean' && Array.isArray(data.issues)
  && data.issues.every(code => typeof code === 'string' && code.length <= 200);
const validCounts = data => data && ['matched', 'missing', 'review', 'informational'].every(key => Number.isSafeInteger(data[key]) && data[key] >= 0 && data[key] <= 10000);
function validSection(section, detailed) {
  if (!['national', 'international'].includes(section?.scope) || section.currency !== (section.scope === 'national' ? 'CLP' : 'USD')
    || !validValidation(section.validation) || !validCounts(section.counts) || !section.totals || typeof section.totals !== 'object' || Array.isArray(section.totals)
    || !Object.values(section.totals).every(value => value === null || money(value, section.currency))) return false;
  return !detailed || (Array.isArray(section.items) && section.items.length <= 10000 && section.items.every(item => (
    typeof item?.rowKey === 'string' && item.rowKey.length <= 250 && isoDay(item.date)
    && typeof item.description === 'string' && item.description.length <= 2000 && item.currency === section.currency
    && money(item.amount, item.currency) && (item.operationAmount === null || money(item.operationAmount, item.currency))
    && (item.cardLastFour === null || /^\d{4}$/.test(item.cardLastFour))
    && typeof item.kind === 'string' && (item.reference === null || typeof item.reference === 'string')
    && STATUSES.includes(item.finding?.status) && typeof item.finding.reason === 'string'
    && Number.isSafeInteger(item.finding.candidateCount) && item.finding.candidateCount >= 0
    && typeof item.finding.periodMismatch === 'boolean'
    && (item.installmentNumber === null || (Number.isSafeInteger(item.installmentNumber) && item.installmentNumber > 0))
    && (item.installmentTotal === null || (Number.isSafeInteger(item.installmentTotal) && item.installmentTotal > 0))
  )));
}
function validStatement(data, detailed = false) {
  if (!UUID.test(data?.id || '') || !['visa', 'mastercard', null].includes(data.network)
    || !['ready', 'review', 'invalid'].includes(data.status) || !validValidation(data.validation)
    || typeof data.revisionConflict !== 'boolean' || !Array.isArray(data.sections) || data.sections.length > 10
    || !data.sections.every(section => validSection(section, detailed))) return false;
  if (data.status === 'invalid') return [data.statementDate, data.dueDate].every(value => value === null || isoDay(value))
    && (data.period === null || (data.period && [data.period.since, data.period.until].every(value => value === null || isoDay(value))));
  return data.network !== null && isoDay(data.statementDate) && isoDay(data.dueDate)
    && isoDay(data.period?.since) && isoDay(data.period?.until) && data.period.since <= data.period.until && data.sections.length > 0;
}
const networkLabel = network => network === 'mastercard' ? 'Mastercard' : network === 'visa' ? 'Visa' : 'Tarjeta sin identificar';
const sectionLabel = section => section.scope === 'national' ? 'Nacional · CLP' : 'Internacional · USD';
const COUNT_LABELS = { matched: 'Coincidentes', missing: 'Faltantes', review: 'Dudosos', informational: 'Informativos' };
const STATUS_LABELS = { matched: 'Coincidente', missing: 'Faltante por revisar', review: 'Requiere revisión', informational: 'Informativo' };
const TOTAL_LABELS = {
  previousBilled: 'Facturado anterior', payments: 'Pagos', automaticPayments: 'Pagos automáticos', purchases: 'Compras en una cuota',
  installments: 'Cuotas del período', voluntaryServices: 'Servicios contratados', charges: 'Cargos, comisiones y abonos',
  credited: 'Abonos realizados', transferToNational: 'Traspaso a deuda nacional',
  A: 'Facturado anterior', B: 'Pagos', C: 'Pagos automáticos', D: 'Compras en una cuota', E: 'Cuotas del período', F: 'Servicios contratados', G: 'Cargos, comisiones y abonos',
};
function reasonLabel(finding) {
  if (finding.periodMismatch) return '';
  const labels = {
    unique_identity_match: 'Coincide con un cargo registrado.', exact_match: 'Coincide con un cargo registrado.', exact: 'Coincide con un cargo registrado.', compatible_match: 'Coincide con un cargo registrado.',
    not_found: 'No se encontró un cargo coincidente en el historial.', no_candidate: 'No se encontró un cargo coincidente en el historial.', missing: 'No se encontró un cargo coincidente en el historial.',
    ambiguous_multiplicity: 'Hay movimientos iguales que requieren una revisión individual.', multiple_candidates: 'Hay varias coincidencias posibles en el historial.', description_difference: 'La descripción del cargo registrado difiere de la del estado.', bank_identity_missing: 'No se pudo confirmar el banco del cargo registrado.', network_unknown: 'No se pudo confirmar si el cargo es Visa o Mastercard.', card_identity_missing: 'No se pudo confirmar la tarjeta de este movimiento.', posting_date_difference: 'La fecha del cargo registrado difiere de la del estado.', billing_period_difference: 'El período del cargo registrado difiere del estado.', manually_excluded: 'El cargo está desestimado en tu historial y se conserva así.', invalid_item: 'No se pudo validar toda la información del movimiento.', ambiguous_candidates: 'Hay varias coincidencias posibles en el historial.', ambiguous: 'Hay varias coincidencias posibles en el historial.',
    card_unknown: 'No se pudo confirmar la tarjeta de este movimiento.', unknown_card: 'No se pudo confirmar la tarjeta de este movimiento.',
    payment: 'Pago incluido como contexto del estado.', debt_transfer: 'Traspaso de deuda incluido como contexto del estado.',
    other_credit: 'Abono incluido como contexto del estado.', informational: 'Este concepto se conserva como información del estado.',
  };
  return labels[finding.reason] || (finding.status === 'matched' ? 'Coincide con un cargo registrado.'
    : finding.status === 'informational' ? 'Este concepto se conserva como información del estado.' : 'Revisa este movimiento con el estado de cuenta.');
}
function effectiveStatus(run) {
  if (!run.validation.valid || run.sections.some(section => !section.validation.valid) || run.status === 'invalid') return 'invalid';
  return run.revisionConflict || run.status === 'review' || run.sections.some(section => section.counts.missing || section.counts.review) ? 'review' : 'ready';
}
function Counts({ counts }) {
  return <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', sm: 'repeat(4, minmax(0, 1fr))' }, gap: 1, mt: 1.5 }}>
    {Object.entries(COUNT_LABELS).map(([key, label]) => <Box key={key} sx={{ p: 1, minWidth: 0, bgcolor: 'background.default', borderRadius: 1 }}>
      <Typography variant="caption" color="text.secondary">{label}</Typography><Typography variant="body1" fontWeight={700}>{counts[key]}</Typography>
    </Box>)}
  </Box>;
}
function Totals({ section }) {
  const primary = section.currency === 'CLP' ? section.totals.billedTotal ?? section.totals.totalBilled : section.totals.debtTotal;
  const label = section.currency === 'CLP' ? 'Total facturado' : 'Deuda internacional';
  return <>
    <Typography variant="h6" component="p" sx={{ mt: 1, fontWeight: 700, overflowWrap: 'anywhere', fontVariantNumeric: 'tabular-nums' }}>
      {primary === null || primary === undefined ? `${label}: no informado` : amountLabel(primary, section.currency)}
    </Typography>
    {primary !== null && primary !== undefined && <Typography variant="caption" color="text.secondary">{label} del documento</Typography>}
    <Box sx={{ mt: 1, display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, columnGap: 2, rowGap: 0.5 }}>
      {Object.entries(section.totals).filter(([key]) => TOTAL_LABELS[key]).map(([key, value]) => <Box key={key} sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, minWidth: 0 }}>
        <Typography variant="caption" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>{key === 'purchases' && section.currency === 'USD' ? 'Compras' : TOTAL_LABELS[key]}</Typography>
        <Typography variant="caption" sx={{ flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>{amountLabel(value, section.currency)}</Typography>
      </Box>)}
    </Box>
  </>;
}
function Movement({ item }) {
  const finding = item.finding, reason = reasonLabel(finding);
  return <Paper variant="outlined" component="article" sx={{ p: 1.5, minWidth: 0, overflowWrap: 'anywhere', bgcolor: 'background.default' }}>
    <Stack direction="row" justifyContent="space-between" spacing={1} sx={{ alignItems: 'flex-start', minWidth: 0 }}>
      <Typography variant="caption" color="text.secondary">{dayLabel(item.date)}</Typography>
      <Chip size="small" label={STATUS_LABELS[finding.status]} color={finding.status === 'matched' ? 'success' : finding.status === 'informational' ? 'default' : 'warning'} sx={{ maxWidth: '75%', '& .MuiChip-label': { whiteSpace: 'normal' }, height: 'auto', minHeight: 24 }} />
    </Stack>
    <Typography variant="body2" fontWeight={650} sx={{ mt: 1 }}>{item.description}</Typography>
    <Typography variant="h6" component="p" sx={{ mt: 0.5, fontVariantNumeric: 'tabular-nums' }}>{amountLabel(item.amount, item.currency)}</Typography>
    {item.kind === 'installment' && <>
      <Typography variant="caption" component="p">Cuota {item.installmentNumber || '—'} de {item.installmentTotal || '—'}</Typography>
      <Typography variant="caption" color="text.secondary" component="p">Monto de la operación: {amountLabel(item.operationAmount, item.currency)}</Typography>
    </>}
    <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 0.5 }}>{item.cardLastFour ? `Tarjeta •••• ${item.cardLastFour}` : 'Tarjeta no identificada en esta fila'}</Typography>
    {reason && <Typography variant="body2" sx={{ mt: 1 }}>{reason}</Typography>}
    {finding.periodMismatch && <Alert severity="warning" sx={{ mt: 1 }}>El período del cargo registrado difiere del estado.</Alert>}
    {finding.candidateCount > 1 && <Typography variant="caption" color="text.secondary">Coincidencias posibles: {finding.candidateCount}</Typography>}
  </Paper>;
}

export default function CardStatementReconciliations({ year, month }) {
  const theme = useTheme(), isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const { user } = useAuth(), { activeSpace } = useSpace();
  const ownSpace = Boolean(user?.id && activeSpace?.isOwner && String(activeSpace.ownerId) === String(user.id));
  const scope = `${user?.id || ''}:${activeSpace?.ownerId || ''}:${ownSpace}:${year}:${month}`;
  const currentScope = useRef(scope); currentScope.current = scope;
  const generation = useRef(0), detailGeneration = useRef(0), detailController = useRef(null);
  const [list, setList] = useState({ ...EMPTY, scope });
  const [selection, setSelection] = useState(null), [detail, setDetail] = useState(null), [filter, setFilter] = useState('review');
  const visible = list.scope === scope ? list : EMPTY;
  const selected = selection?.scope === scope ? selection : null;
  const shownDetail = detail?.scope === scope && detail?.id === selected?.id ? detail : null;
  useEffect(() => {
    const version = ++generation.current, controller = new AbortController();
    detailController.current?.abort(); detailGeneration.current += 1; setSelection(null); setDetail(null); setList({ ...EMPTY, scope });
    if (ownSpace) axios.get(PATH, { params: { year, month }, signal: controller.signal, headers: { 'Cache-Control': 'no-store' } })
      .then(({ data }) => { if (controller.signal.aborted || generation.current !== version || currentScope.current !== scope) return;
        if (!Array.isArray(data?.items) || data.items.length > 1000 || !data.items.every(item => validStatement(item))) throw new Error('Invalid statement response');
        setList({ scope, loading: false, items: data.items, error: null });
      }).catch(error => { if (controller.signal.aborted || generation.current !== version || currentScope.current !== scope) return;
        setList({ scope, loading: false, items: [], error: error?.response?.status === 403 ? 'Solo el titular puede consultar estos estados de tarjetas.'
          : error?.response?.status === 401 ? 'Tu sesión terminó. Inicia sesión para consultar los estados.' : 'No se pudieron verificar los estados recibidos.' });
      });
    return () => { generation.current += 1; controller.abort(); detailController.current?.abort(); detailGeneration.current += 1; };
  }, [scope, ownSpace, year, month]);
  async function openDetail(item) {
    detailController.current?.abort();
    const controller = new AbortController(), version = ++detailGeneration.current;
    detailController.current = controller; setSelection({ id: item.id, scope, network: item.network }); setDetail({ scope, id: item.id, loading: true }); setFilter('review');
    try {
      const { data } = await axios.get(`${PATH}/${encodeURIComponent(item.id)}`, { signal: controller.signal, headers: { 'Cache-Control': 'no-store' } });
      if (controller.signal.aborted || detailGeneration.current !== version || currentScope.current !== scope) return;
      if (!validStatement(data, true) || data.id !== item.id) throw new Error('Invalid statement detail');
      setDetail({ scope, id: item.id, loading: false, run: data });
    } catch (_) {
      if (controller.signal.aborted || detailGeneration.current !== version || currentScope.current !== scope) return;
      setDetail({ scope, id: item.id, loading: false, error: 'No se pudo consultar el detalle de este estado.' });
    }
  }
  function closeDetail() { detailController.current?.abort(); detailGeneration.current += 1; setSelection(null); setDetail(null); }
  if (!ownSpace) return <Alert severity="info">Solo el titular puede consultar estos estados de tarjetas.</Alert>;
  return <Box sx={{ minWidth: 0 }} data-testid="card-statements-results">
    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>Los cargos de cada estado se comparan con tu historial actual. Tus gastos y categorías se conservan.</Typography>
    {visible.loading && <Box role="status"><LinearProgress /><Typography variant="body2" sx={{ mt: 1 }}>Consultando estados recibidos…</Typography></Box>}
    {visible.error && <Alert severity="error">{visible.error}</Alert>}
    {!visible.loading && !visible.error && !visible.items.length && <Paper variant="outlined" sx={{ p: 3 }}><Typography fontWeight={600}>No hay estados recibidos para este vencimiento.</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>Cuando llegue un estado de cuenta, su comparación aparecerá aquí.</Typography></Paper>}
    <Stack spacing={2}>
      {visible.items.map(run => { const status = effectiveStatus(run); return <Paper key={run.id} component="section" role="region" aria-label={`Estado ${networkLabel(run.network)} del ${dayLabel(run.statementDate)}`} variant="outlined" sx={{ p: { xs: 2, sm: 2.5 }, minWidth: 0, overflowWrap: 'anywhere', borderTop: '3px solid', borderTopColor: status === 'ready' ? 'success.main' : 'warning.main' }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ justifyContent: 'space-between', alignItems: { xs: 'flex-start', sm: 'center' } }}>
          <Box><Typography variant="h6" component="h2" fontWeight={700}>{networkLabel(run.network)}</Typography><Typography variant="caption" color="text.secondary">Estado del {dayLabel(run.statementDate)}</Typography></Box>
          <Chip label={status === 'invalid' ? 'Documento con observaciones' : status === 'review' ? 'Por revisar' : 'Sin diferencias en cargos'} color={status === 'ready' ? 'success' : 'warning'} size="small" sx={{ maxWidth: '100%', height: 'auto', minHeight: 24, '& .MuiChip-label': { whiteSpace: 'normal' } }} />
        </Stack>
        <Typography variant="body2" sx={{ mt: 1.5 }}>Período: {run.period ? `${dayLabel(run.period.since)} al ${dayLabel(run.period.until)}` : 'Sin período identificado'}</Typography>
        <Typography variant="body2" fontWeight={600}>Vencimiento: {dayLabel(run.dueDate)}</Typography>
        <Typography variant="caption" color={run.validation.valid ? 'success.main' : 'warning.main'} component="p" sx={{ mt: 1 }}>{run.validation.valid ? 'Totales del documento validados' : 'Los totales o la lectura del documento requieren revisión.'}</Typography>
        {run.revisionConflict && <Alert severity="warning" sx={{ mt: 1 }}>Se recibió otra versión del mismo estado. Revisa sus diferencias antes de considerar el cierre.</Alert>}
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: run.sections.length > 1 ? 'repeat(2, minmax(0, 1fr))' : 'minmax(0, 1fr)' }, gap: 1.5, mt: 2 }}>
          {run.sections.map((section, index) => <Paper key={`${section.scope}-${index}`} variant="outlined" sx={{ p: 1.5, minWidth: 0 }}>
            <Typography variant="subtitle2" component="h3">{sectionLabel(section)}</Typography><Totals section={section} /><Counts counts={section.counts} />
            {!section.validation.valid && <Typography variant="caption" color="warning.main" component="p" sx={{ mt: 1 }}>Esta sección tiene observaciones de lectura o totales.</Typography>}
          </Paper>)}
        </Box>
        {!run.sections.length && <Typography variant="body2" sx={{ mt: 2 }}>No se identificaron secciones válidas en el archivo.</Typography>}
        <Button variant="outlined" sx={{ mt: 2 }} onClick={() => openDetail(run)} aria-label={`Ver detalle ${networkLabel(run.network)}`}>Ver movimientos y diferencias</Button>
      </Paper>; })}
    </Stack>
    {selected && <Dialog open onClose={closeDetail} fullScreen={isMobile} fullWidth maxWidth="md" aria-labelledby="statement-detail-title">
      <DialogTitle component="div" sx={{ pr: 1, pb: 1 }}><Stack direction="row" alignItems="flex-start" justifyContent="space-between" spacing={1}><Box sx={{ minWidth: 0 }}><Typography component="h2" variant="h6">Detalle {networkLabel(selected?.network)}</Typography><Typography variant="caption" color="text.secondary">Comparación con los cargos registrados</Typography></Box><IconButton onClick={closeDetail} aria-label="Cerrar detalle"><Close /></IconButton></Stack></DialogTitle>
      <DialogContent dividers sx={{ p: { xs: 2, sm: 3 }, minWidth: 0 }}>
        {shownDetail?.loading && <Box role="status"><LinearProgress /><Typography sx={{ mt: 1 }}>Consultando detalle…</Typography></Box>}
        {shownDetail?.error && <Alert severity="error">{shownDetail.error}</Alert>}
        {shownDetail?.run && <>
          {!shownDetail.run.validation.valid && <Alert severity="warning" sx={{ mb: 2 }}>El archivo requiere revisión. No se pudo validar toda su información.</Alert>}
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>Los pagos, saldos anteriores y traspasos se distinguen de las compras. Esta comparación conserva los registros existentes.</Typography>
          <ToggleButtonGroup exclusive value={filter} onChange={(_, value) => value && setFilter(value)} size="small" sx={{ display: 'flex', flexWrap: 'wrap', mb: 2 }} aria-label="Movimientos del estado">
            <ToggleButton value="review" sx={{ flex: { xs: 1, sm: 'initial' } }}>Por revisar</ToggleButton><ToggleButton value="all" sx={{ flex: { xs: 1, sm: 'initial' } }}>Todos los movimientos</ToggleButton>
          </ToggleButtonGroup>
          <Stack spacing={3}>{shownDetail.run.sections.map((section, sectionIndex) => { const items = section.items.filter(item => filter === 'all' || ['missing', 'review'].includes(item.finding.status)); return <Box key={`${section.scope}-${sectionIndex}`} sx={{ minWidth: 0 }}>
            <Typography variant="subtitle1" component="h3" fontWeight={700}>{sectionLabel(section)}</Typography><Divider sx={{ my: 1 }} />
            <Stack spacing={1.25}>{items.map((item, index) => <Movement key={`${item.rowKey}-${index}`} item={item} />)}</Stack>
            {!items.length && <Typography variant="body2" color="text.secondary">{filter === 'all' ? 'Esta sección no tiene movimientos detallados.' : 'No hay cargos pendientes de revisión en esta sección.'}</Typography>}
          </Box>; })}</Stack>
        </>}
      </DialogContent>
    </Dialog>}
  </Box>;
}
