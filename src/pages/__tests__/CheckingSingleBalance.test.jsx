import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import axios from 'axios';
import Checking from '../Checking';
import { createAppTheme } from '../../theme';
jest.mock('axios', () => ({ get: jest.fn() }));
jest.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'owner' } }) }));
jest.mock('../../contexts/SpaceContext', () => ({ useSpace: () => ({ activeSpace: { ownerId: 'owner', isOwner: true } }) }));
jest.mock('../../contexts/PeriodContext', () => ({ usePeriod: () => ({ year: 2026, month: 11 }) }));
jest.mock('../../components/MonthPicker', () => () => null);
jest.mock('../../components/FintocCheckingPreview', () => () => null);
jest.mock('../../components/FintocBankBalance', () => () => <section aria-label="Saldo bancario único">Saldo oficial $1.234.567</section>);
beforeEach(() => {
  jest.clearAllMocks();
  window.matchMedia = jest.fn(query => ({ matches: false, media: query, addListener: jest.fn(), removeListener: jest.fn(), addEventListener: jest.fn(), removeEventListener: jest.fn() }));
  axios.get.mockImplementation(path => Promise.resolve({ data: path === '/api/categories' ? [] : path === '/api/checking/global-balance' ? { saldo_actual: 999999 } : { items: [], total: 0 } }));
});
test('checking has exactly one official bank balance and no independent historical balance request', async () => {
  render(<ThemeProvider theme={createAppTheme('light')}><Checking /></ThemeProvider>);
  expect(await screen.findByRole('region', { name: 'Saldo bancario único' })).toBeInTheDocument();
  await waitFor(() => expect(axios.get).toHaveBeenCalledWith('/api/checking', expect.any(Object)));
  expect(axios.get.mock.calls.map(([url]) => url)).not.toContain('/api/checking/global-balance');
  expect(screen.queryByText(/Saldo calculado/)).not.toBeInTheDocument();
  expect(screen.queryByText('$999.999')).not.toBeInTheDocument();
  expect(screen.getByText('Total Abonos')).toBeInTheDocument();
  expect(screen.getByText('Total Cargos')).toBeInTheDocument();
});
