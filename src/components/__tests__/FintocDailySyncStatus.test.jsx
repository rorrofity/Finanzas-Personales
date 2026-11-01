import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import axios from '../../config/axios';
import { useAuth } from '../../contexts/AuthContext';
import { useSpace } from '../../contexts/SpaceContext';
import { createAppTheme } from '../../theme';
import FintocDailySyncStatus from '../FintocDailySyncStatus';
import FintocCheckingPreview from '../FintocCheckingPreview';

jest.mock('../../config/axios', () => ({ get: jest.fn() }));
jest.mock('../../contexts/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('../../contexts/SpaceContext', () => ({ useSpace: jest.fn() }));

const STATUS_PATH = '/api/checking/fintoc/daily-status';
const REVIEW_PATH = '/api/checking/fintoc/review';
const daily = (overrides = {}) => ({
  provider: 'fintoc', enabled: true, schedule: '07:00', timezone: 'America/Santiago',
  state: 'needs_review', initialized: true, cutoverDate: '2026-10-31',
  lastSuccessAt: '2026-10-31T20:00:00.000Z', bankUpdatedAt: '2026-10-31T19:00:00.000Z',
  bankFreshness: 'current', coverage: { since: '2026-08-01', until: '2026-10-31', complete: true },
  pendingReviewCount: 2, importedTotal: 3,
  lastRun: { trigger: 'initial', status: 'success', inserted: 0, linked: 1, review: 2 },
  lastErrorCode: null, ...overrides,
});
const movement = (overrides = {}) => ({
  externalId: 'mov_PRIVATE_identifier', date: '2026-10-03', description: 'Supermercado pendiente',
  type: 'cargo', amount: '12500', status: 'confirmed', reason: 'ambiguous_match', candidateCount: 2,
  ...overrides,
});
const review = (overrides = {}) => ({ items: [movement()], total: 1, limit: 20, offset: 0, ...overrides });
const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const element = (props = {}, mode = 'light') => <ThemeProvider theme={createAppTheme(mode)}><FintocDailySyncStatus year={2026} month={10} {...props} /></ThemeProvider>;
const mount = (props = {}, mode = 'light') => render(element(props, mode));

beforeEach(() => {
  jest.clearAllMocks();
  useAuth.mockReturnValue({ user: { id: 'owner-1' } });
  useSpace.mockReturnValue({ activeSpace: { ownerId: 'owner-1', isOwner: true } });
});

test('consulta solo el estado local sin parámetros, presenta horario, fechas, rango y contadores', async () => {
  axios.get.mockResolvedValue({ data: daily({ configuredAccountId: 'acc_SECRET', lastErrorCode: null }) });
  const storage = jest.spyOn(Storage.prototype, 'setItem');
  mount();
  const region = await screen.findByRole('region', { name: 'Sincronización diaria Fintoc' });
  expect(region).toHaveAttribute('data-testid', 'fintoc-daily-status');
  expect(await within(region).findByText(/07:00.*America\/Santiago/)).toBeInTheDocument();
  expect(within(region).getByText(/Última consulta completa:.*31-10-2026/)).toBeInTheDocument();
  expect(within(region).getByText(/Última actualización bancaria:.*31-10-2026/)).toBeInTheDocument();
  expect(within(region).getByText(/01\/08\/2026.*31\/10\/2026/)).toBeInTheDocument();
  expect(within(region).getByText(/2 pendientes.*3 importados/)).toBeInTheDocument();
  expect(within(region).getByText('Solo cuenta corriente; las tarjetas mantienen su sincronización actual.')).toBeInTheDocument();
  expect(within(region).getByText(/cobertura.*no garantiza.*cartola/i)).toBeInTheDocument();
  expect(axios.get).toHaveBeenCalledTimes(1);
  expect(axios.get).toHaveBeenCalledWith(STATUS_PATH, expect.objectContaining({ signal: expect.anything(), headers: { 'Cache-Control': 'no-store' } }));
  expect(axios.get.mock.calls[0][1].params).toBeUndefined();
  expect(document.body).not.toHaveTextContent('acc_SECRET');
  expect(storage).not.toHaveBeenCalled();
  storage.mockRestore();
});

test.each([
  { user: null, space: { ownerId: 'owner-1', isOwner: true } },
  { user: { id: 'member-1' }, space: { ownerId: 'owner-1', isOwner: false } },
  { user: { id: 'owner-1' }, space: { ownerId: 'owner-2', isOwner: true } },
])('solo el propietario de su espacio ve el estado: %j', ({ user, space }) => {
  useAuth.mockReturnValue({ user });
  useSpace.mockReturnValue({ activeSpace: space });
  const { container } = mount();
  expect(container).toBeEmptyDOMElement();
  expect(axios.get).not.toHaveBeenCalled();
});

test.each([
  ['disabled', { enabled: false }, 'Sincronización diaria desactivada'],
  ['not_initialized', { initialized: false, cutoverDate: null, lastSuccessAt: null, bankUpdatedAt: null, bankFreshness: 'unknown', coverage: { since: null, until: null, complete: false }, pendingReviewCount: 0, importedTotal: 0, lastRun: null }, 'Esperando la primera consulta completa'],
  ['current', {}, 'Sincronización al día'],
  ['stale', { bankFreshness: 'stale' }, 'Información bancaria desactualizada'],
  ['error', { lastErrorCode: 'sk_live_PRIVATE link_token=SECRET' }, 'La última sincronización no se completó'],
])('presenta el estado %s sin exponer códigos internos', async (state, overrides, label) => {
  axios.get.mockResolvedValue({ data: daily({ state, ...overrides }) });
  mount();
  expect(await screen.findByText(label)).toBeInTheDocument();
  expect(document.body).not.toHaveTextContent('PRIVATE');
  expect(document.body).not.toHaveTextContent('SECRET');
  expect(screen.queryByRole('button', { name: /sincronizar|importar|aplicar/i })).not.toBeInTheDocument();
});

test.each([
  ['stale', '2026-10-01T20:00:00.000Z', /banco no registra una actualización en las últimas 24 horas/],
  ['unknown', null, /No hay una fecha bancaria disponible/],
])('distingue la frescura bancaria %s aunque la consulta sea reciente', async (bankFreshness, bankUpdatedAt, label) => {
  axios.get.mockResolvedValue({ data: daily({ bankFreshness, bankUpdatedAt }) });
  mount();
  expect(await screen.findByText(label)).toBeInTheDocument();
});

test('un error de estado presenta mensaje seguro y un 403 oculta el panel', async () => {
  axios.get.mockRejectedValueOnce({ response: { status: 502, data: { message: 'sk_live_PRIVATE' } } });
  const first = mount();
  expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo consultar la sincronización diaria. Inténtalo más tarde.');
  expect(document.body).not.toHaveTextContent('PRIVATE');
  first.unmount();
  axios.get.mockRejectedValueOnce({ response: { status: 403, data: { message: 'sk_live_PRIVATE' } } });
  const second = mount();
  await waitFor(() => expect(second.container).toBeEmptyDOMElement());
});

test.each([
  daily({ provider: 'other' }),
  daily({ coverage: { since: '2026-08-01', until: '2026-02-30', complete: true } }),
  daily({ pendingReviewCount: -1 }),
])('rechaza estado inválido sin anunciar éxito', async (data) => {
  axios.get.mockResolvedValue({ data });
  mount();
  expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo verificar el estado de la sincronización diaria.');
  expect(screen.queryByText(/pendientes ·/)).not.toBeInTheDocument();
});

test.each(['light', 'dark'])('lista pendientes solo al solicitarlos, con CLP exactos, razón, estado y candidatos en tema %s', async (mode) => {
  axios.get.mockResolvedValueOnce({ data: daily() }).mockResolvedValueOnce({ data: review({ items: [movement({ amount: '9007199254740993' })] }) });
  mount({}, mode);
  fireEvent.click(await screen.findByRole('button', { name: 'Ver movimientos pendientes' }));
  const list = await screen.findByRole('list', { name: 'Movimientos pendientes de revisión' });
  expect(within(list).getByText('Supermercado pendiente')).toBeInTheDocument();
  expect(within(list).getByText('$9.007.199.254.740.993')).toBeInTheDocument();
  expect(within(list).getByText('03/10/2026')).toBeInTheDocument();
  expect(within(list).getByText('Confirmado')).toBeInTheDocument();
  expect(within(list).getByText(/varias coincidencias posibles/i)).toBeInTheDocument();
  expect(within(list).getByText('Coincidencias posibles: 2')).toBeInTheDocument();
  expect(document.body).not.toHaveTextContent('mov_PRIVATE_identifier');
  expect(document.body).not.toHaveTextContent('ambiguous_match');
  expect(axios.get).toHaveBeenCalledTimes(2);
  expect(axios.get).toHaveBeenLastCalledWith(REVIEW_PATH, expect.objectContaining({ params: { limit: 20, offset: 0 }, signal: expect.anything(), headers: { 'Cache-Control': 'no-store' } }));
});

test('pagina verticalmente con offset sin ocultar los pendientes anteriores', async () => {
  const firstPage = Array.from({ length: 20 }, (_, i) => movement({ externalId: `mov_${i}`, description: `Pendiente ${i}` }));
  axios.get.mockResolvedValueOnce({ data: daily({ pendingReviewCount: 21 }) })
    .mockResolvedValueOnce({ data: review({ items: firstPage, total: 21 }) })
    .mockResolvedValueOnce({ data: review({ items: [movement({ externalId: 'mov_20', description: 'Pendiente final', status: 'pending', reason: 'initial_unmatched', candidateCount: 0 })], total: 21, offset: 20 }) });
  mount();
  fireEvent.click(await screen.findByRole('button', { name: 'Ver movimientos pendientes' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Ver más pendientes' }));
  expect(await screen.findByText('Pendiente final')).toBeInTheDocument();
  expect(screen.getByText('Pendiente 0')).toBeInTheDocument();
  expect(screen.getByText('Pendiente bancario')).toBeInTheDocument();
  expect(axios.get).toHaveBeenLastCalledWith(REVIEW_PATH, expect.objectContaining({ params: { limit: 20, offset: 20 } }));
  expect(screen.queryByRole('button', { name: 'Ver más pendientes' })).not.toBeInTheDocument();
});

test('muestra revisión vacía y evita aplicar automáticamente movimientos históricos', async () => {
  axios.get.mockResolvedValueOnce({ data: daily() }).mockResolvedValueOnce({ data: review({ items: [], total: 0 }) });
  mount();
  fireEvent.click(await screen.findByRole('button', { name: 'Ver movimientos pendientes' }));
  expect(await screen.findByText('No hay movimientos pendientes de revisión.')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /importar|guardar|aplicar|sincronizar/i })).not.toBeInTheDocument();
});

test.each([
  review({ items: [movement({ amount: '12.50' })] }),
  review({ offset: 20 }),
  review({ items: [movement(), movement()] , total: 2 }),
])('un lote de revisión inválido no muestra movimientos', async (data) => {
  axios.get.mockResolvedValueOnce({ data: daily() }).mockResolvedValueOnce({ data });
  mount();
  fireEvent.click(await screen.findByRole('button', { name: 'Ver movimientos pendientes' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo verificar la lista de pendientes.');
  expect(screen.queryByText('Supermercado pendiente')).not.toBeInTheDocument();
});

test('el fallo de revisión y las razones desconocidas mantienen mensajes seguros', async () => {
  axios.get.mockResolvedValueOnce({ data: daily() })
    .mockRejectedValueOnce({ response: { status: 502, data: { message: 'SECRET' } } })
    .mockResolvedValueOnce({ data: review({ items: [movement({ reason: 'sk_live_PRIVATE', status: 'unknown_status' })] }) });
  mount();
  fireEvent.click(await screen.findByRole('button', { name: 'Ver movimientos pendientes' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo consultar la lista de pendientes. Inténtalo más tarde.');
  fireEvent.click(screen.getByRole('button', { name: 'Ver movimientos pendientes' }));
  expect(await screen.findByText('Este movimiento requiere revisión antes de incorporarse.')).toBeInTheDocument();
  expect(screen.getByText('Otro estado bancario')).toBeInTheDocument();
  expect(document.body).not.toHaveTextContent('PRIVATE');
  expect(document.body).not.toHaveTextContent('SECRET');
});

test.each([
  ['initial_unmatched', /historia inicial/],
  ['before_cutover', /anterior o igual al corte inicial/],
  ['provider_changed', /banco cambió los datos/],
  ['provider_reversed', /banco informó una reversión/],
  ['provider_missing', /banco ya no incluye/],
  ['financial_record_removed', /registro local vinculado ya no está disponible/],
  ['future_date', /fecha futura/],
  ['amount_out_of_range', /importe excede/],
  ['__proto__', /requiere revisión antes de incorporarse/],
])('la razón %s se explica sin revelar identificadores técnicos', async (reason, explanation) => {
  axios.get.mockResolvedValueOnce({ data: daily() }).mockResolvedValueOnce({ data: review({ items: [movement({ reason, status: 'constructor' })] }) });
  mount();
  fireEvent.click(await screen.findByRole('button', { name: 'Ver movimientos pendientes' }));
  expect(await screen.findByText(explanation)).toBeInTheDocument();
  expect(screen.getByText(/Otro estado bancario/)).toBeInTheDocument();
});

test('cambiar período aborta el estado anterior y descarta una respuesta tardía', async () => {
  const pending = deferred();
  axios.get.mockImplementationOnce(() => pending.promise).mockResolvedValueOnce({ data: daily({ pendingReviewCount: 0, importedTotal: 0 }) });
  const { rerender } = mount();
  const signal = axios.get.mock.calls[0][1].signal;
  rerender(element({ month: 9 }));
  expect(signal.aborted).toBe(true);
  await act(async () => pending.resolve({ data: daily({ importedTotal: 777 }) }));
  expect(await screen.findByText(/0 pendientes.*0 importados/)).toBeInTheDocument();
  expect(document.body).not.toHaveTextContent('777 importados');
});

test.each(['period', 'user', 'space'])('cambiar %s borra y aborta revisión pendiente de la identidad anterior', async (change) => {
  const pending = deferred();
  axios.get.mockResolvedValueOnce({ data: daily() }).mockImplementationOnce(() => pending.promise).mockResolvedValueOnce({ data: daily({ pendingReviewCount: 0 }) });
  const { rerender, container } = mount();
  fireEvent.click(await screen.findByRole('button', { name: 'Ver movimientos pendientes' }));
  const signal = axios.get.mock.calls[1][1].signal;
  if (change === 'user') {
    useAuth.mockReturnValue({ user: { id: 'owner-2' } });
    useSpace.mockReturnValue({ activeSpace: { ownerId: 'owner-2', isOwner: true } });
  }
  if (change === 'space') useSpace.mockReturnValue({ activeSpace: { ownerId: 'owner-2', isOwner: false } });
  rerender(element({ month: change === 'period' ? 9 : 10 }));
  expect(signal.aborted).toBe(true);
  await act(async () => pending.resolve({ data: review() }));
  expect(screen.queryByText('Supermercado pendiente')).not.toBeInTheDocument();
  if (change === 'space') {
    expect(container).toBeEmptyDOMElement();
    expect(axios.get).toHaveBeenCalledTimes(2);
  } else expect(await screen.findByText(/0 pendientes/)).toBeInTheDocument();
});

test('desmontar aborta estado y revisión pendientes', async () => {
  const pending = deferred();
  axios.get.mockResolvedValueOnce({ data: daily() }).mockImplementationOnce(() => pending.promise);
  const { unmount } = mount();
  fireEvent.click(await screen.findByRole('button', { name: 'Ver movimientos pendientes' }));
  const reviewSignal = axios.get.mock.calls[1][1].signal;
  const statusSignal = axios.get.mock.calls[0][1].signal;
  unmount();
  expect(reviewSignal.aborted).toBe(true);
  expect(statusSignal.aborted).toBe(true);
  await act(async () => pending.resolve({ data: review() }));
});

test('el preview opta al estado diario dentro del panel conservando su consulta de conexión', async () => {
  axios.get.mockImplementation((path) => Promise.resolve({ data: path === STATUS_PATH ? daily() : { provider: 'fintoc', state: 'ready', mode: 'live', readOnly: true, writesEnabled: false } }));
  render(<ThemeProvider theme={createAppTheme('light')}><FintocCheckingPreview year={2026} month={10} showDailyStatus /></ThemeProvider>);
  const preview = await screen.findByRole('region', { name: 'Conexión Fintoc' });
  expect(await within(preview).findByRole('region', { name: 'Sincronización diaria Fintoc' })).toBeInTheDocument();
  expect(await within(preview).findByRole('button', { name: 'Consultar movimientos con Fintoc' })).toBeInTheDocument();
  expect(axios.get.mock.calls.map(([path]) => path).sort()).toEqual([STATUS_PATH, '/api/checking/fintoc/status'].sort());
});
