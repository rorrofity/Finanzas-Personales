import React from 'react';
import { render, screen, waitFor, fireEvent, act, within } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import FinancialHealth from '../FinancialHealth';
import theme from '../../theme';
import axios from '../../config/axios';
import { getCachedEntry, cacheRead } from '../../services/readCache';
let mockUser = { id: 'reader' }, mockOwner = 'owner', mockPeriod = { year: 2026, month: 11 };
jest.mock('../../config/axios', () => ({ get: jest.fn() }));
jest.mock('../../services/readCache', () => ({ getCachedEntry: jest.fn(), cacheRead: jest.fn() }));
jest.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ user: mockUser }) }));
jest.mock('../../contexts/SpaceContext', () => ({ useSpace: () => ({ activeSpace: { ownerId: mockOwner } }) }));
jest.mock('../../contexts/PeriodContext', () => ({ usePeriod: () => mockPeriod }));
jest.mock('../../components/MonthPicker', () => () => <span>Mes seleccionado</span>);
jest.mock('recharts', () => ({ ResponsiveContainer: ({ children }) => <div>{children}</div>, PieChart: ({ children }) => <div>{children}</div>, Pie: () => null, Cell: () => null, Tooltip: () => null }));
const fixture = (extra = {}) => ({
  generatedAt: '2026-11-02T22:01:00Z', currentDate: '2026-11-02',
  checking: { currentBalance: 123456, state: 'available', source: 'fintoc', freshness: 'current', bankUpdatedAt: '2026-11-02T10:00:00Z', queriedAt: '2026-11-02T10:01:00Z' },
  creditCards: { visa: { total: 100, unbilled: 100, international: 0, installments: 0, payments: 0 }, mastercard: { total: 200, unbilled: 200, international: 0, installments: 0, payments: 0 }, combined: 300 },
  projected: { income: 1000, expenses: 500, details: { income: [{ name: 'Ingreso ficticio', amount: 1000, fecha: '2026-11-20' }], expenses: [{ name: 'Compromiso ficticio futuro', amount: 500, fecha: '2026-11-10' }] } },
  summary: { totalCommitments: 800, projectedBalance: 123656, healthScore: 90, healthStatus: 'excellent', amountsPartial: false, partialReasons: [] },
  sources: Object.fromEntries(['checking', 'national', 'international', 'installments', 'projected'].map(source => [source, { state: 'available', freshness: 'current', asOf: '2026-11-02T22:00:00Z', errorCode: null }])), alerts: [], ...extra,
});
const mount = () => render(<ThemeProvider theme={theme}><FinancialHealth /></ThemeProvider>);
beforeEach(() => {
  jest.clearAllMocks(); mockUser = { id: 'reader' }; mockOwner = 'owner'; mockPeriod = { year: 2026, month: 11 };
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: true }); Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  getCachedEntry.mockResolvedValue(null); cacheRead.mockResolvedValue(); axios.get.mockResolvedValue({ data: fixture() });
});
test('saldo bancario, compromisos y resultado llevan período y fechas verdaderas de fuente', async () => {
  mount(); expect(await screen.findByText('Saldo disponible bancario')).toBeVisible();
  expect(screen.getByText(/Compromisos a pagar en noviembre de 2026/i)).toBeVisible();
  expect(screen.getByText(/Actualización bancaria:/)).toHaveTextContent(/0?7:00/);
  expect(screen.getByText(/Resumen consultado:/)).toBeVisible(); expect(screen.getByText(/Tarjetas nacionales:/)).toBeVisible();
  expect(within(screen.getByRole('region', { name: 'Próximos compromisos' })).getByText('Compromiso ficticio futuro')).toBeVisible();
  expect(axios.get.mock.calls.every(([url]) => url === '/api/financial-health/summary')).toBe(true);
});
test('saldo ausente no aparece como cero ni produce evaluación saludable', async () => {
  const data = fixture(); data.checking = { ...data.checking, currentBalance: null, state: 'unavailable', freshness: 'unknown', bankUpdatedAt: null };
  data.summary = { ...data.summary, projectedBalance: null, healthScore: null, healthStatus: 'unknown', amountsPartial: true, partialReasons: ['CHECKING_UNAVAILABLE'] };
  axios.get.mockResolvedValue({ data }); mount();
  expect(await screen.findByText('Saldo bancario no disponible')).toBeVisible(); expect(screen.getAllByText('No disponible').length).toBeGreaterThan(0);
  expect(screen.queryByText('Excelente')).not.toBeInTheDocument();
});
test('saldo atrasado y fuente fallida explican la evaluación parcial', async () => {
  const data = fixture(); data.checking.freshness = 'stale'; data.sources.national = { state: 'error', freshness: 'unknown', asOf: null, errorCode: 'PRIVATE_DB_DETAIL' };
  data.summary.amountsPartial = true; data.summary.partialReasons = ['CHECKING_STALE', 'NATIONAL_ERROR']; axios.get.mockResolvedValue({ data }); mount();
  expect(await screen.findByText('Evaluación parcial')).toBeVisible(); expect(screen.getByText(/El saldo bancario tiene más de 24 horas/)).toBeVisible();
  expect(screen.getByText(/Tarjetas nacionales:/)).toHaveTextContent('No disponible'); expect(screen.queryByText('PRIVATE_DB_DETAIL')).not.toBeInTheDocument();
});
test('regresar al foco vuelve a consultar conservando datos útiles durante la lectura', async () => {
  const { unmount } = mount(); await screen.findByText('Saldo disponible bancario');
  let resolve; const pending = new Promise(done => { resolve = done; }); axios.get.mockReturnValueOnce(pending);
  fireEvent(window, new Event('focus')); await waitFor(() => expect(axios.get).toHaveBeenCalledTimes(2));
  expect(screen.getByText('Saldo disponible bancario')).toBeVisible(); expect(screen.getByLabelText('Actualizando salud financiera')).toBeVisible();
  await act(async () => { resolve({ data: fixture() }); await pending; }); unmount();
});
test('copia offline declara su fecha y no presenta evaluación definitiva', async () => {
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: false }); getCachedEntry.mockResolvedValue({ data: fixture(), cachedAt: Date.parse('2026-11-01T20:00:00Z') }); mount();
  expect(await screen.findByText(/Datos guardados del/)).toBeVisible(); expect(screen.queryByText('Excelente')).not.toBeInTheDocument(); expect(axios.get).not.toHaveBeenCalled();
});
test('respuesta de período anterior no pisa el período recién elegido', async () => {
  let resolve; const pending = new Promise(done => { resolve = done; }); axios.get.mockReturnValueOnce(pending);
  const december = fixture(); december.checking.currentBalance = 765432; axios.get.mockResolvedValueOnce({ data: december });
  const { rerender } = mount(); mockPeriod = { year: 2026, month: 12 }; rerender(<ThemeProvider theme={theme}><FinancialHealth /></ThemeProvider>);
  await screen.findByText(/Compromisos a pagar en diciembre de 2026/i);
  await act(async () => { resolve({ data: fixture() }); await pending; });
  expect(screen.queryByText(/Compromisos a pagar en noviembre de 2026/i)).not.toBeInTheDocument();
  expect(cacheRead.mock.calls.every(([, data]) => data.checking.currentBalance === 765432)).toBe(true);
});
test('fallo de refresco mantiene copia visible claramente marcada y ofrece reintento', async () => {
  mount(); await screen.findByText('Saldo disponible bancario'); axios.get.mockRejectedValueOnce(new Error('Network unavailable'));
  fireEvent.click(screen.getByRole('button', { name: 'Actualizar salud financiera' }));
  expect(await screen.findByText(/No pudimos actualizar/)).toBeVisible(); expect(screen.getByText('Saldo disponible bancario')).toBeVisible();
});
test('los centavos de compromisos y proyección no se redondean a cero', async () => {
  const data = fixture(); data.summary.totalCommitments = 0.3; data.summary.projectedBalance = 123455.7;
  axios.get.mockResolvedValue({ data }); mount(); await screen.findByText('Saldo disponible bancario');
  expect(within(screen.getByRole('region', { name: 'Compromisos del período' })).getByText('$0,3')).toBeVisible();
  expect(within(screen.getByRole('region', { name: 'Resultado previsto' })).getByText('+$123.455,7')).toBeVisible();
});
test('rechazo de permiso durante actualización retira los datos ya visibles', async () => {
  mount(); await screen.findByText('Saldo disponible bancario'); axios.get.mockRejectedValueOnce({ response: { status: 403 } });
  fireEvent.click(screen.getByRole('button', { name: 'Actualizar salud financiera' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Ya no tienes acceso a este hogar.');
  expect(screen.queryByText('Saldo disponible bancario')).not.toBeInTheDocument();
});
test('la parcialidad explica cargos sin identificar y sincronización de correos atrasada', async () => {
  const data = fixture(); data.summary.amountsPartial = true; data.summary.partialReasons = ['UNKNOWN_CARD_NETWORK', 'EMAIL_SYNC_STALE']; axios.get.mockResolvedValue({ data });
  mount(); expect(await screen.findByText(/Hay cargos cuya tarjeta no pudo identificarse/)).toBeVisible();
  expect(screen.getByText(/La última sincronización de correos tiene más de 24 horas/)).toBeVisible();
});
test('un total de compromisos desconocido no inventa porcentajes cero de sus partes', async () => {
  const data = fixture(); data.summary.totalCommitments = null; data.summary.projectedBalance = null; data.summary.amountsPartial = true;
  data.projected.expenses = null; data.projected.details.expenses = []; data.sources.projected.state = 'error'; axios.get.mockResolvedValue({ data });
  mount(); await screen.findByText('Saldo disponible bancario'); expect(screen.queryAllByText('0%')).toHaveLength(0);
});
test('un resultado desconocido conserva fondo neutral y no sugiere saldo favorable', async () => {
  const data = fixture(); data.summary.projectedBalance = null; data.summary.healthScore = null; data.summary.amountsPartial = true;
  axios.get.mockResolvedValue({ data }); mount(); await screen.findByText('Saldo disponible bancario');
  const resultBox = screen.getByText('RESULTADO PROYECTADO PARCIAL').parentElement;
  expect(resultBox).toHaveStyle({ backgroundColor: theme.palette.background.default });
});
test('un subtotal desconocido no antepone signo monetario a No disponible', async () => {
  const data = fixture(); data.summary.totalCommitments = null; data.summary.projectedBalance = null; data.summary.amountsPartial = true;
  axios.get.mockResolvedValue({ data }); mount(); await screen.findByText('Saldo disponible bancario');
  expect(screen.queryByText('-No disponible')).not.toBeInTheDocument();
});
