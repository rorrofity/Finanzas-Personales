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
jest.mock('../../components/FintocBankBalance', () => ({ calculatedBalance }) => <div data-testid="bank-comparison-input">{calculatedBalance === null ? 'unavailable' : String(calculatedBalance)}</div>);
const deferred = () => { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { promise, resolve }; };
const element = () => <ThemeProvider theme={createAppTheme('light')}><Checking /></ThemeProvider>;
beforeEach(() => {
  window.matchMedia = jest.fn().mockImplementation(query => ({ matches: query.includes('max-width'), media: query, onchange: null, addListener: jest.fn(), removeListener: jest.fn(), addEventListener: jest.fn(), removeEventListener: jest.fn(), dispatchEvent: jest.fn() }));
  jest.clearAllMocks(); useAuth.mockReturnValue({ user: { id: 'owner-a' } });
  useSpace.mockReturnValue({ activeSpace: { ownerId: 'owner-a', isOwner: true } }); usePeriod.mockReturnValue({ year: 2026, month: 11 });
});
function fixtures(balanceResponses) {
  let balanceCall = 0;
  axios.get.mockImplementation(path => {
    if (path === '/api/checking/global-balance') return balanceResponses[balanceCall++];
    return Promise.resolve({ data: path === '/api/categories' ? [] : { items: [], total: 0 } });
  });
}
test('el cálculo se muestra completo y se identifica como cálculo del historial', async () => {
  fixtures([Promise.resolve({ data: { saldo_actual: 1234567 } })]); render(element());
  const totals = screen.getByTestId('totals-row'); expect(await within(totals).findByText('$1.234.567')).toBeInTheDocument();
  expect(within(totals).getByText('Saldo calculado')).toBeInTheDocument(); expect(totals).not.toHaveTextContent('$1.235K');
});
test('un cálculo ausente no se convierte en cero para compararlo con el banco', async () => {
  fixtures([Promise.resolve({ data: {} })]); render(element()); await waitFor(() => expect(axios.get).toHaveBeenCalledTimes(3));
  expect(screen.getByTestId('bank-comparison-input')).toHaveTextContent('unavailable'); expect(await screen.findByText('Saldo no disponible')).toBeInTheDocument();
});
test('cambiar espacio retira de inmediato el cálculo anterior y descarta respuestas tardías', async () => {
  const previous = deferred(); fixtures([previous.promise, Promise.resolve({ data: { saldo_actual: 2222222 } })]);
  const view = render(element()); const oldSignal = axios.get.mock.calls[0][1].signal;
  useSpace.mockReturnValue({ activeSpace: { ownerId: 'shared-b', isOwner: false } }); view.rerender(element());
  expect(oldSignal.aborted).toBe(true); expect(screen.getByTestId('bank-comparison-input')).toHaveTextContent('unavailable');
  await screen.findByText('$2.222.222'); await act(async () => previous.resolve({ data: { saldo_actual: 1111111 } }));
  expect(screen.getByTestId('bank-comparison-input')).toHaveTextContent('2222222'); expect(screen.queryByText('$1.111.111')).not.toBeInTheDocument();
});
test('un saldo ya cargado no se usa en la comparación tras cambiar sesión', async () => {
  const next = deferred(); fixtures([Promise.resolve({ data: { saldo_actual: 1234567 } }), next.promise]);
  const view = render(element()); await screen.findByText('$1.234.567');
  useAuth.mockReturnValue({ user: { id: 'owner-b' } }); useSpace.mockReturnValue({ activeSpace: { ownerId: 'owner-b', isOwner: true } }); view.rerender(element());
  expect(screen.getByTestId('bank-comparison-input')).toHaveTextContent('unavailable'); expect(screen.queryByText('$1.234.567')).not.toBeInTheDocument();
  await act(async () => next.resolve({ data: { saldo_actual: 7654321 } })); expect(screen.getByTestId('bank-comparison-input')).toHaveTextContent('7654321');
});
