import React from 'react';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import axios from '../../config/axios';
import { useAuth } from '../../contexts/AuthContext';
import { useSpace } from '../../contexts/SpaceContext';
import { createAppTheme } from '../../theme';
import FintocBankBalance from '../FintocBankBalance';

jest.mock('../../config/axios', () => ({ get: jest.fn() }));
jest.mock('../../contexts/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('../../contexts/SpaceContext', () => ({ useSpace: jest.fn() }));
const PATH = '/api/checking/fintoc/bank-balance';
const bank = (patch = {}) => ({ provider: 'fintoc', currency: 'CLP', state: 'available', available: '1234567', current: '1200000',
  bankUpdatedAt: '2026-11-01T02:00:00.000Z', queriedAt: '2026-11-01T03:00:00.000Z', freshness: 'current', ...patch });
const element = (props = {}, mode = 'light') => <ThemeProvider theme={createAppTheme(mode)}><FintocBankBalance year={2026} month={11} calculatedBalance={1000000} {...props} /></ThemeProvider>;
const mount = (props = {}, mode = 'light') => render(element(props, mode));
const deferred = () => { let resolve; let reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
beforeEach(() => { jest.clearAllMocks(); useAuth.mockReturnValue({ user: { id: 'owner-fixture' } }); useSpace.mockReturnValue({ activeSpace: { ownerId: 'owner-fixture', isOwner: true } }); });

test.each(['light', 'dark'])('saldo disponible exacto, contable y diferencia sin línea de crédito en tema %s', async mode => {
  axios.get.mockResolvedValue({ data: bank({ limit: '9000000', accountId: 'acc_PRIVATE' }) });
  mount({}, mode);
  const panel = await screen.findByRole('region', { name: 'Saldo bancario Fintoc' });
  expect(await within(panel).findByText('$1.234.567')).toBeInTheDocument();
  expect(within(panel).getByText(/Saldo contable:.*\$1.200.000/)).toBeInTheDocument();
  expect(within(panel).getByText(/Diferencia con el historial:.*\$234.567/)).toBeInTheDocument();
  expect(within(panel).getByText(/Actualización bancaria:.*31-10-2026/)).toBeInTheDocument();
  expect(within(panel).getByText(/Consulta del saldo:.*01-11-2026/)).toBeInTheDocument();
  expect(within(panel).getByText(/no incluye línea de crédito/i)).toBeInTheDocument();
  expect(panel).not.toHaveTextContent('$9.000.000'); expect(panel).not.toHaveTextContent('PRIVATE');
  expect(panel).not.toHaveTextContent('$1.235K');
});

test('solo consulta la base local con no-store, sin parámetros ni storage', async () => {
  axios.get.mockResolvedValue({ data: bank() }); const write = jest.spyOn(Storage.prototype, 'setItem'); mount();
  await screen.findByText('$1.234.567');
  expect(axios.get).toHaveBeenCalledTimes(1); expect(axios.get).toHaveBeenCalledWith(PATH, expect.objectContaining({ signal: expect.anything(), headers: { 'Cache-Control': 'no-store' } }));
  expect(axios.get.mock.calls[0][1].params).toBeUndefined(); expect(write).not.toHaveBeenCalled(); write.mockRestore();
});
test('cero bancario real no se confunde con saldo ausente', async () => {
  axios.get.mockResolvedValue({ data: bank({ available: '0', current: '0' }) }); mount({ calculatedBalance: 0 });
  expect(await screen.findByTestId('bank-available-value')).toHaveTextContent('$0'); expect(screen.getByText(/El saldo bancario y el cálculo del historial coinciden/)).toBeInTheDocument();
});
test('conserva importes negativos y diferencia negativa', async () => {
  axios.get.mockResolvedValue({ data: bank({ available: '-1234567', current: '-1200000' }) }); mount({ calculatedBalance: 1000000 });
  expect(await screen.findByText('-$1.234.567')).toBeInTheDocument(); expect(screen.getByText(/Diferencia con el historial:.*-\$2.234.567/)).toBeInTheDocument();
});
test('montos y diferencia por encima de precisión Number permanecen exactos', async () => {
  axios.get.mockResolvedValue({ data: bank({ available: '9007199254740993', current: '9007199254740992' }) }); mount({ calculatedBalance: '9007199254740992' });
  expect(await screen.findByText('$9.007.199.254.740.993')).toBeInTheDocument(); expect(screen.getByText(/Diferencia con el historial:.*\$1$/)).toBeInTheDocument();
});
test('saldo antiguo conserva cifra y advierte que no confirma el saldo actual del portal', async () => {
  axios.get.mockResolvedValue({ data: bank({ freshness: 'stale' }) }); mount();
  expect(await screen.findByRole('alert')).toHaveTextContent(/más de 24 horas/i); expect(screen.getByText('$1.234.567')).toBeInTheDocument();
});
test('saldo sin fecha bancaria muestra vigencia desconocida', async () => {
  axios.get.mockResolvedValue({ data: bank({ bankUpdatedAt: null, freshness: 'unknown' }) }); mount();
  expect(await screen.findByRole('alert')).toHaveTextContent(/no hay una fecha bancaria/i); expect(screen.getByText('$1.234.567')).toBeInTheDocument();
});
test('snapshot ausente no inventa saldo cero', async () => {
  axios.get.mockResolvedValue({ data: bank({ state: 'unavailable', available: null, current: null, bankUpdatedAt: null, queriedAt: null, freshness: 'unknown' }) }); mount();
  expect(await screen.findByText('Saldo bancario no disponible')).toBeInTheDocument(); expect(screen.queryByTestId('bank-available-value')).not.toBeInTheDocument();
  expect(screen.getByText(/El saldo calculado proviene del historial/)).toBeInTheDocument();
});
test.each([
  { user: null, space: { ownerId: 'owner-fixture', isOwner: true } },
  { user: { id: 'owner-fixture' }, space: { ownerId: 'other-fixture', isOwner: true } },
])('no muestra ni consulta saldos de otro espacio: %j', ({ user, space }) => {
  useAuth.mockReturnValue({ user }); useSpace.mockReturnValue({ activeSpace: space }); const { container } = mount(); expect(container).toBeEmptyDOMElement(); expect(axios.get).not.toHaveBeenCalled();
});
test('403 oculta el panel', async () => {
  axios.get.mockRejectedValue({ response: { status: 403, data: { error: 'PRIVATE' } } }); const { container } = mount(); await waitFor(() => expect(container).toBeEmptyDOMElement());
});
test.each([401, 502])('un error %s es seguro y no presenta cero como saldo', async status => {
  axios.get.mockRejectedValue({ response: { status, data: { error: 'sk_live_PRIVATE' } } }); mount();
  expect(await screen.findByRole('alert')).not.toHaveTextContent('PRIVATE'); expect(screen.queryByTestId('bank-available-value')).not.toBeInTheDocument();
});
test.each([
  bank({ available: 1234567 }), bank({ current: '12.50' }), bank({ currency: 'USD' }), bank({ provider: 'other' }),
  bank({ bankUpdatedAt: 'invalid' }), bank({ freshness: 'ready' }), bank({ available: '1e6' }), bank({ state: 'unavailable' }),
])('respuesta inválida no se publica como saldo %j', async data => {
  axios.get.mockResolvedValue({ data }); mount(); expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo verificar el saldo bancario.'); expect(screen.queryByTestId('bank-available-value')).not.toBeInTheDocument();
});
test('cambiar sesión borra inmediatamente saldo anterior y descarta respuesta tardía', async () => {
  const old = deferred(); axios.get.mockReturnValueOnce(old.promise).mockResolvedValueOnce({ data: bank({ available: '7777' }) });
  const view = mount(); const signal = axios.get.mock.calls[0][1].signal;
  useAuth.mockReturnValue({ user: { id: 'new-owner' } }); useSpace.mockReturnValue({ activeSpace: { ownerId: 'new-owner', isOwner: true } }); view.rerender(element());
  expect(signal.aborted).toBe(true); expect(await screen.findByText('$7.777')).toBeInTheDocument();
  await act(async () => old.resolve({ data: bank() })); expect(screen.queryByText('$1.234.567')).not.toBeInTheDocument();
});
test('cambiar período aborta respuesta antigua; actualizar cálculo no repite consulta bancaria', async () => {
  axios.get.mockResolvedValue({ data: bank() }); const view = mount(); await screen.findByText('$1.234.567');
  view.rerender(element({ calculatedBalance: 1200000 })); expect(screen.getByText(/Diferencia con el historial:.*\$34.567/)).toBeInTheDocument(); expect(axios.get).toHaveBeenCalledTimes(1);
  view.rerender(element({ year: 2027 })); await waitFor(() => expect(axios.get).toHaveBeenCalledTimes(2));
});
test('desmontar aborta el request pendiente', () => { const pending = deferred(); axios.get.mockReturnValue(pending.promise); const view = mount(); const signal = axios.get.mock.calls[0][1].signal; view.unmount(); expect(signal.aborted).toBe(true); });
test('un cálculo inválido o ausente no produce una diferencia falsa', async () => {
  axios.get.mockResolvedValue({ data: bank() }); mount({ calculatedBalance: null }); await screen.findByText('$1.234.567'); expect(screen.queryByText(/Diferencia con el historial/)).not.toBeInTheDocument();
});

test('HRO: miembro consulta saldo guardado del hogar sin acciones de proveedor',async()=>{useAuth.mockReturnValue({user:{id:'member-fixture'}});useSpace.mockReturnValue({activeSpace:{ownerId:'owner-fixture',isOwner:false,canEdit:false,canDelete:false}});axios.get.mockResolvedValue({data:bank()});mount();expect(await screen.findByText('$1.234.567')).toBeInTheDocument();expect(axios.get.mock.calls.map(call=>call[0])).toEqual([PATH]);expect(screen.queryByRole('button')).not.toBeInTheDocument();});
