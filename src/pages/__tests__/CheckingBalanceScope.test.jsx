import React from 'react';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import axios from 'axios';
import { useAuth } from '../../contexts/AuthContext';
import { useSpace } from '../../contexts/SpaceContext';
import { usePeriod } from '../../contexts/PeriodContext';
import { createAppTheme } from '../../theme';
import Checking from '../Checking';

jest.mock('axios', () => ({ get: jest.fn() }));
jest.mock('../../contexts/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('../../contexts/SpaceContext', () => ({ useSpace: jest.fn() }));
jest.mock('../../contexts/PeriodContext', () => ({ usePeriod: jest.fn() }));
jest.mock('../../components/MonthPicker', () => () => null);
jest.mock('../../components/FintocCheckingPreview', () => () => null);
// Bank precision/identity races are covered by the bank component's own suite.
// This page covers the single source presentation and late ledger requests.
jest.mock('../../components/FintocBankBalance', () => () => <div data-testid="official-bank-panel">Saldo bancario no disponible</div>);
const deferred = () => { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { promise, resolve }; };
const element = () => <ThemeProvider theme={createAppTheme('light')}><Checking /></ThemeProvider>;
beforeEach(() => {
  window.matchMedia = jest.fn().mockImplementation(query => ({ matches: query.includes('max-width'), media: query, onchange: null, addListener: jest.fn(), removeListener: jest.fn(), addEventListener: jest.fn(), removeEventListener: jest.fn(), dispatchEvent: jest.fn() }));
  jest.clearAllMocks(); useAuth.mockReturnValue({ user: { id: 'owner-a' } });
  useSpace.mockReturnValue({ activeSpace: { ownerId: 'owner-a', isOwner: true } }); usePeriod.mockReturnValue({ year: 2026, month: 11 });
});
const movement = name => ({ id: name, descripcion: name, fecha: '2026-11-01', amount: '1234567', tipo: 'abono' });
function fixtures(rowResponses) {
  let count = 0;
  axios.get.mockImplementation(path => {
    if (path === '/api/checking') return rowResponses[count++];
    if (path === '/api/categories') return Promise.resolve({ data: [] });
    throw new Error('Unexpected alternate balance request');
  });
}
test('la referencia bancaria es única y los totales del mes son únicamente flujos', async () => {
  fixtures([Promise.resolve({ data: { items: [movement('Movimiento actual')], total: 1 } })]); render(element());
  await screen.findByText('Movimiento actual'); const totals = screen.getByTestId('totals-row');
  expect(totals).not.toHaveTextContent(/Saldo calculado/); expect(within(totals).getByText('Total Abonos')).toBeInTheDocument();
  expect(screen.getAllByTestId('official-bank-panel')).toHaveLength(1);
  expect(axios.get.mock.calls.map(([url]) => url)).not.toContain('/api/checking/global-balance');
});
test('un saldo oficial ausente no se sustituye por un cálculo del historial', async () => {
  fixtures([Promise.resolve({ data: { items: [], total: 0 } })]); render(element()); await waitFor(() => expect(axios.get).toHaveBeenCalledTimes(2));
  expect(screen.getByTestId('official-bank-panel')).toHaveTextContent('Saldo bancario no disponible'); expect(screen.queryByText(/Saldo calculado/)).not.toBeInTheDocument();
});
test('cambiar espacio retira de inmediato el historial anterior y descarta respuestas tardías', async () => {
  const previous = deferred(); fixtures([previous.promise, Promise.resolve({ data: { items: [movement('Hogar B')], total: 1 } })]);
  const view = render(element()); const oldSignal = axios.get.mock.calls[0][1].signal;
  useSpace.mockReturnValue({ activeSpace: { ownerId: 'shared-b', isOwner: false } }); view.rerender(element());
  expect(oldSignal.aborted).toBe(true);
  await screen.findByText('Hogar B'); await act(async () => previous.resolve({ data: { items: [movement('Hogar A')], total: 1 } }));
  expect(screen.queryByText('Hogar A')).not.toBeInTheDocument(); expect(screen.getByText('Hogar B')).toBeInTheDocument();
});
test('un historial ya cargado no se conserva al cambiar sesión', async () => {
  const next = deferred(); fixtures([Promise.resolve({ data: { items: [movement('Sesión A')], total: 1 } }), next.promise]);
  const view = render(element()); await screen.findByText('Sesión A');
  useAuth.mockReturnValue({ user: { id: 'owner-b' } }); useSpace.mockReturnValue({ activeSpace: { ownerId: 'owner-b', isOwner: true } }); view.rerender(element());
  expect(screen.queryByText('Sesión A')).not.toBeInTheDocument();
  await act(async () => next.resolve({ data: { items: [movement('Sesión B')], total: 1 } })); expect(screen.getByText('Sesión B')).toBeInTheDocument();
});
