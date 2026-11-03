import React from 'react';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import { useMediaQuery } from '@mui/material';
import axios from 'axios';
import Transactions from '../Transactions';
import TransactionsIntl from '../TransactionsIntl';
import Checking from '../Checking';
import { createAppTheme } from '../../theme';
jest.mock('axios', () => ({ get: jest.fn(), put: jest.fn(), delete: jest.fn(), post: jest.fn() }));
jest.mock('../../config/axios', () => require('axios'));
jest.mock('@mui/material', () => ({ ...jest.requireActual('@mui/material'), useMediaQuery: jest.fn() }));
jest.mock('../../contexts/PeriodContext', () => ({ usePeriod: () => ({ year: 2030, month: 5 }) }));
jest.mock('../../contexts/OfflineContext', () => ({ useOfflineContext: () => ({ isOffline: false, reconnectCount: 0 }) }));
jest.mock('../../contexts/SpaceContext', () => ({ useSpace: () => ({ activeSpace: { isOwner: true, ownerId: 'owner', canEdit: true, canDelete: true }, hasMembers: false }) }));
jest.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'owner' } }) }));
jest.mock('../../services/readCache', () => ({ fetchWithCache: (_, read) => read(), clearReadCache: jest.fn() }));
jest.mock('../../components/MonthPicker', () => () => null);
jest.mock('../../components/SyncButton', () => () => null);
jest.mock('../../components/BillingPeriodConfig', () => () => null);
jest.mock('../../components/FintocCheckingPreview', () => () => null);
jest.mock('../../components/FintocBankBalance', () => () => null);
const split = { version: 'saved-version', total_clp: '1800.00', parts: [{ amount_clp: '1000.00', category_id: 1, category_name: 'Calzado ficticio' }, { amount_clp: '800.00', category_id: 2, category_name: 'Ropa ficticia' }] };
const categories = [{ id: 1, name: 'Calzado ficticio' }, { id: 2, name: 'Ropa ficticia' }];
const cases = [['tc_nacional', Transactions], ['tc_internacional', TransactionsIntl], ['cuenta_corriente', Checking]];
const fixture = source => ({ id: 'split-fixture', fecha: '2030-05-10', descripcion: 'Compra ficticia repartible', category_id: null, monto: '1800.00', amount: '1800.00', amount_usd: '2.00', amount_clp: '1800.00', exchange_rate: '900', tipo: source === 'cuenta_corriente' ? 'cargo' : 'gasto', brand: 'visa', network: 'visa' });
function mount(Component, source, rows, mobile = false) {
  useMediaQuery.mockReturnValue(mobile);
  axios.get.mockImplementation(path => Promise.resolve({ data: path === '/api/categories' ? categories : path === '/api/checking/global-balance' ? { saldo_actual: 10000 } : path.startsWith('/api/expense-splits/') ? { source, id: rows[0].id, total_clp: '1800.00', currency: 'CLP', split: rows[0].split || null } : path === '/api/checking' ? { items: rows } : rows }));
  return render(<ThemeProvider theme={createAppTheme('light')}><Component /></ThemeProvider>);
}
beforeEach(() => { jest.clearAllMocks(); sessionStorage.clear(); localStorage.clear(); });
test.each(cases)('fuente %s ofrece dividir y confirma sin cambiar el padre', async (source, Component) => {
  const row = Object.freeze(fixture(source)); mount(Component, source, [row]);
  await screen.findByText(row.descripcion); fireEvent.click(screen.getByRole('button', { name: 'Dividir gasto' }));
  const dialog = await screen.findByRole('dialog', { name: 'Dividir gasto' }); await within(dialog).findByLabelText('Monto CLP, parte 1');
  fireEvent.change(within(dialog).getByLabelText('Monto CLP, parte 1'), { target: { value: '1000' } });
  axios.put.mockResolvedValue({ data: { source, id: row.id, total_clp: '1800.00', currency: 'CLP', split: { ...split, parts: split.parts.map(part => ({ ...part, category_id: null, category_name: null })) } } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Confirmar división' }));
  await waitFor(() => expect(axios.put).toHaveBeenCalledWith(`/api/expense-splits/${source}/${row.id}`, expect.objectContaining({ expectedVersion: 0 })));
  expect(await screen.findByRole('button', { name: 'Editar división' })).toBeInTheDocument();
  expect(row.category_id).toBeNull(); expect(row.monto).toBe('1800.00');
});
test.each(cases.flatMap(([source, Component]) => [[source, Component, false], [source, Component, true]]))('fuente %s split categorizado sale de pendientes y bloquea categoría/edición legacy', async (source, Component, mobile) => {
  const row = { ...fixture(source), split }; mount(Component, source, [row], mobile);
  const text = await screen.findByText(row.descripcion); const container = text.closest(mobile ? '.MuiCard-root' : 'tr');
  if (mobile && source !== 'cuenta_corriente') expect(container).toHaveStyle({ borderLeft: '4px solid #4caf50' });
  expect(screen.getByRole('button', { name: 'Sin categoría (0)' })).toBeInTheDocument();
  expect(within(container).getByText('Calzado ficticio: $1.000')).toBeInTheDocument();
  expect(within(container).getByRole('button', { name: 'Editar división' })).toBeInTheDocument();
  for (const control of within(container).queryAllByRole('combobox')) expect(control).toHaveAttribute('aria-disabled', 'true');
  for (const button of within(container).queryAllByRole('button', { name: 'Editar', exact: true })) expect(button).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Sin categoría (0)' })); expect(screen.queryByText(row.descripcion)).not.toBeInTheDocument();
});
test('cuenta corriente filtra categorías de partes y no la categoría original', async () => {
  mount(Checking, 'cuenta_corriente', [{ ...fixture('cuenta_corriente'), category_id: 9, split }]); await screen.findByText('Compra ficticia repartible');
  fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Categoría' })); fireEvent.click(within(screen.getByRole('listbox')).getByRole('option', { name: 'Ropa ficticia' }));
  expect(screen.getByText('Compra ficticia repartible')).toBeInTheDocument();
});
