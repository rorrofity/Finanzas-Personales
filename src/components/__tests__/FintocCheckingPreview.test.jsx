import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import axios from '../../config/axios';
import { useAuth } from '../../contexts/AuthContext';
import { useSpace } from '../../contexts/SpaceContext';
import { createAppTheme } from '../../theme';
import FintocCheckingPreview from '../FintocCheckingPreview';

jest.mock('../../config/axios', () => ({ get: jest.fn() }));
jest.mock('../../contexts/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('../../contexts/SpaceContext', () => ({ useSpace: jest.fn() }));

const ready = { provider: 'fintoc', state: 'ready', mode: 'live', readOnly: true, writesEnabled: false };
const preview = (overrides = {}) => ({
  provider: 'fintoc', mode: 'live', readOnly: true, imported: false,
  period: { year: 2026, month: 10, since: '2026-10-01', until: '2026-10-31' },
  account: { name: 'Cuenta corriente', currency: 'CLP', numberLast4: '1234' },
  queriedAt: '2026-10-31T20:00:00.000Z', bankUpdatedAt: null,
  items: [
    { externalId: 'mov_one', date: '2026-10-03', description: 'Supermercado del barrio', type: 'cargo', amount: '12500', status: 'confirmed' },
    { externalId: 'mov_two', date: '2026-10-04', description: 'Transferencia recibida', type: 'abono', amount: '250001', status: 'confirmed' },
  ],
  total: 2, coverage: { complete: true, excludedNonConfirmed: 0 },
  ...overrides,
});
const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};

beforeEach(() => {
  jest.clearAllMocks();
  useAuth.mockReturnValue({ user: { id: 'owner-1' } });
  useSpace.mockReturnValue({ activeSpace: { ownerId: 'owner-1', isOwner: true } });
});

function mount(props = {}, mode = 'light') {
  return render(<ThemeProvider theme={createAppTheme(mode)}><FintocCheckingPreview year={2026} month={10} {...props} /></ThemeProvider>);
}

test('sin configuración muestra conexión pendiente y no consulta movimientos ni abre Fintoc', async () => {
  axios.get.mockResolvedValue({ data: { ...ready, state: 'configuration_required', mode: null } });
  mount();
  expect(await screen.findByText(/Conexión pendiente/i)).toBeInTheDocument();
  expect(axios.get).toHaveBeenCalledTimes(1);
  expect(axios.get.mock.calls[0][0]).toBe('/api/checking/fintoc/status');
  expect(screen.queryByRole('button', { name: 'Consultar movimientos con Fintoc' })).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Abrir Fintoc' })).toHaveAttribute('href', 'https://dashboard.fintoc.com/');
  expect(screen.getByRole('link', { name: 'Abrir Fintoc' })).toHaveAttribute('rel', 'noopener noreferrer');
});

test.each(['disabled', 'access_unconfirmed'])('el estado %s nunca consulta automáticamente el proveedor', async (state) => {
  axios.get.mockResolvedValue({ data: { ...ready, state } });
  mount();
  expect(await screen.findByText(/Conexión pendiente/i)).toBeInTheDocument();
  expect(axios.get).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole('button', { name: 'Consultar movimientos con Fintoc' })).not.toBeInTheDocument();
});

test.each([
  { user: null, space: { ownerId: 'owner-1', isOwner: true } },
  { user: { id: 'member-1' }, space: { ownerId: 'owner-1', isOwner: false } },
  { user: { id: 'owner-1' }, space: { ownerId: 'owner-2', isOwner: true } },
])('sin propietario propio no muestra el panel ni realiza peticiones: %j', ({ user, space }) => {
  useAuth.mockReturnValue({ user });
  useSpace.mockReturnValue({ activeSpace: space });
  const { container } = mount();
  expect(container).toBeEmptyDOMElement();
  expect(axios.get).not.toHaveBeenCalled();
});

test('el dueño sin permiso de conexión no ve el panel ni errores crudos', async () => {
  axios.get.mockRejectedValue({ response: { status: 403, data: { message: 'sk_live_PRIVATE' } } });
  const { container } = mount();
  await waitFor(() => expect(container).toBeEmptyDOMElement());
  expect(screen.queryByText(/PRIVATE/)).not.toBeInTheDocument();
});

test.each(['light', 'dark'])('consulta solo por acción explícita y muestra pesos exactos, fechas y estados en modo %s', async (mode) => {
  axios.get.mockResolvedValueOnce({ data: ready }).mockResolvedValueOnce({ data: preview() });
  mount({}, mode);
  const button = await screen.findByRole('button', { name: 'Consultar movimientos con Fintoc' });
  expect(axios.get).toHaveBeenCalledTimes(1);
  fireEvent.click(button);
  expect(await screen.findByText('Supermercado del barrio')).toBeInTheDocument();
  expect(axios.get.mock.calls[1][0]).toBe('/api/checking/fintoc/preview');
  expect(axios.get.mock.calls[1][1]).toEqual(expect.objectContaining({ params: { year: 2026, month: 10 }, signal: expect.anything() }));
  expect(screen.getByTestId('fintoc-amount-mov_one')).toHaveTextContent('$12.500');
  expect(screen.getByTestId('fintoc-amount-mov_two')).toHaveTextContent('$250.001');
  expect(screen.getByText('Cargo')).toBeInTheDocument();
  expect(screen.getByText('Abono')).toBeInTheDocument();
  expect(screen.getAllByText('Confirmado')).toHaveLength(2);
  expect(screen.getByText('03/10/2026')).toBeInTheDocument();
  expect(screen.getByText(/Consulta realizada:/)).toBeInTheDocument();
  expect(screen.getByText(/Última actualización bancaria: Sin fecha disponible/)).toBeInTheDocument();
  expect(screen.getByText(/no cambia tus gastos ni clasificaciones/)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /importar|guardar|sincronizar/i })).not.toBeInTheDocument();
});

test('identifica explícitamente los datos de prueba y la fecha bancaria antigua', async () => {
  axios.get.mockResolvedValueOnce({ data: { ...ready, mode: 'test' } }).mockResolvedValueOnce({ data: preview({ mode: 'test', bankUpdatedAt: '2026-10-01T16:00:00.000Z' }) });
  mount();
  fireEvent.click(await screen.findByRole('button', { name: 'Consultar movimientos con Fintoc' }));
  expect(await screen.findByText('Supermercado del barrio')).toBeInTheDocument();
  expect(screen.getByText('Modo de prueba · Datos ficticios')).toBeInTheDocument();
  expect(screen.getByText(/Última actualización bancaria:.*01-10-2026/)).toBeInTheDocument();
  expect(screen.getByText(/no registra una actualización en las últimas 24 horas/)).toBeInTheDocument();
});

test('muestra un período sin movimientos como consulta completa y conserva las exclusiones', async () => {
  axios.get.mockResolvedValueOnce({ data: ready }).mockResolvedValueOnce({ data: preview({ items: [], total: 0, coverage: { complete: true, excludedNonConfirmed: 3 } }) });
  mount();
  fireEvent.click(await screen.findByRole('button', { name: 'Consultar movimientos con Fintoc' }));
  expect(await screen.findByText('No hay movimientos confirmados en este mes.')).toBeInTheDocument();
  expect(screen.getByText(/3 movimientos pendientes o no confirmados/)).toBeInTheDocument();
});

test('los fallos muestran un mensaje local seguro y eliminan el preview anterior', async () => {
  axios.get.mockResolvedValueOnce({ data: ready }).mockResolvedValueOnce({ data: preview() }).mockRejectedValueOnce({ response: { status: 502, data: { code: 'FINTOC_UPSTREAM_ERROR', message: 'sk_live_PRIVATE link_token=SECRET' } }, message: 'raw network SECRET' });
  mount();
  fireEvent.click(await screen.findByRole('button', { name: 'Consultar movimientos con Fintoc' }));
  await screen.findByText('Supermercado del barrio');
  fireEvent.click(screen.getByRole('button', { name: 'Consultar movimientos con Fintoc' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo completar la consulta de Fintoc. Inténtalo más tarde.');
  expect(screen.queryByText('Supermercado del barrio')).not.toBeInTheDocument();
  expect(document.body).not.toHaveTextContent('PRIVATE');
  expect(document.body).not.toHaveTextContent('SECRET');
});

test.each([
  preview({ coverage: { complete: false, excludedNonConfirmed: 0 } }),
  preview({ period: { year: 2026, month: 9 } }),
  preview({ items: [{ ...preview().items[0], amount: '12.50' }], total: 1 }),
  preview({ items: [{ ...preview().items[0], status: 'processing' }], total: 1 }),
])('no presenta una respuesta inválida o parcial como movimientos completos', async (data) => {
  axios.get.mockResolvedValueOnce({ data: ready }).mockResolvedValueOnce({ data });
  mount();
  fireEvent.click(await screen.findByRole('button', { name: 'Consultar movimientos con Fintoc' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('La consulta no entregó un resultado completo y válido.');
  expect(screen.queryByText('Supermercado del barrio')).not.toBeInTheDocument();
});

test('cambiar período aborta la consulta y descarta respuestas tardías', async () => {
  const pending = deferred();
  axios.get.mockResolvedValueOnce({ data: ready }).mockImplementationOnce(() => pending.promise).mockResolvedValueOnce({ data: ready });
  const { rerender } = mount();
  fireEvent.click(await screen.findByRole('button', { name: 'Consultar movimientos con Fintoc' }));
  const requestSignal = axios.get.mock.calls[1][1].signal;
  rerender(<ThemeProvider theme={createAppTheme('light')}><FintocCheckingPreview year={2026} month={9} /></ThemeProvider>);
  expect(requestSignal.aborted).toBe(true);
  await act(async () => pending.resolve({ data: preview() }));
  expect(screen.queryByText('Supermercado del barrio')).not.toBeInTheDocument();
  expect(axios.get).toHaveBeenCalledTimes(3);
  expect(await screen.findByRole('button', { name: 'Consultar movimientos con Fintoc' })).toBeInTheDocument();
});

test('cambiar al espacio ajeno limpia el preview de inmediato y no vuelve a consultar', async () => {
  axios.get.mockResolvedValueOnce({ data: ready }).mockResolvedValueOnce({ data: preview() });
  const { rerender, container } = mount();
  fireEvent.click(await screen.findByRole('button', { name: 'Consultar movimientos con Fintoc' }));
  await screen.findByText('Supermercado del barrio');
  useSpace.mockReturnValue({ activeSpace: { ownerId: 'owner-2', isOwner: false } });
  rerender(<ThemeProvider theme={createAppTheme('light')}><FintocCheckingPreview year={2026} month={10} /></ThemeProvider>);
  expect(container).toBeEmptyDOMElement();
  expect(axios.get).toHaveBeenCalledTimes(2);
});

test('cambiar de usuario descarta una respuesta de configuración de la sesión anterior', async () => {
  const pending = deferred();
  axios.get.mockImplementationOnce(() => pending.promise).mockResolvedValueOnce({ data: { ...ready, state: 'disabled' } });
  const { rerender } = mount();
  const firstSignal = axios.get.mock.calls[0][1].signal;
  useAuth.mockReturnValue({ user: { id: 'owner-2' } });
  useSpace.mockReturnValue({ activeSpace: { ownerId: 'owner-2', isOwner: true } });
  rerender(<ThemeProvider theme={createAppTheme('light')}><FintocCheckingPreview year={2026} month={10} /></ThemeProvider>);
  expect(firstSignal.aborted).toBe(true);
  await act(async () => pending.resolve({ data: ready }));
  expect(await screen.findByText(/Conexión pendiente/i)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Consultar movimientos con Fintoc' })).not.toBeInTheDocument();
});

test('desmontar aborta la petición pendiente', async () => {
  const pending = deferred();
  axios.get.mockImplementationOnce(() => pending.promise);
  const { unmount } = mount();
  const signal = axios.get.mock.calls[0][1].signal;
  unmount();
  expect(signal.aborted).toBe(true);
  await act(async () => pending.resolve({ data: ready }));
});
