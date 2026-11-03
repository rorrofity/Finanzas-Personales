import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import { useMediaQuery } from '@mui/material';
import axios from 'axios';
import { usePeriod } from '../../contexts/PeriodContext';
import { createAppTheme } from '../../theme';
import Checking from '../Checking';

jest.mock('axios', () => ({ get: jest.fn(), put: jest.fn(), post: jest.fn(), delete: jest.fn() }));
jest.mock('@mui/material', () => ({ ...jest.requireActual('@mui/material'), useMediaQuery: jest.fn() }));
jest.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'owner-fixture' } }) }));
jest.mock('../../contexts/SpaceContext', () => ({ useSpace: () => ({ activeSpace: { ownerId: 'owner-fixture', isOwner: true } }) }));
jest.mock('../../contexts/PeriodContext', () => ({ usePeriod: jest.fn() }));
jest.mock('../../components/MonthPicker', () => () => null);
jest.mock('../../components/FintocCheckingPreview', () => () => null);
jest.mock('../../components/FintocBankBalance', () => () => <div data-testid="bank-reference">100000</div>);

const rows = [
  { id: 'null', fecha: '2030-05-10', descripcion: 'Cargo nulo ficticio', tipo: 'cargo', amount: '100', category_id: null, categoria: 'Texto heredado' },
  { id: 'absent', fecha: '2030-05-11', descripcion: 'Abono sin campo ficticio', tipo: 'abono', amount: '200' },
  { id: 'empty', fecha: '2030-05-12', descripcion: 'Cargo vacío ficticio', tipo: 'cargo', amount: '300', category_id: '' },
  { id: 'categorized', fecha: '2030-05-13', descripcion: 'Cargo asignado ficticio', tipo: 'cargo', amount: '400', category_id: 1 },
  { id: 'string-category', fecha: '2030-05-14', descripcion: 'Abono asignado ficticio', tipo: 'abono', amount: '500', category_id: '1' },
];
const toggle = () => screen.getByRole('button', { name: /^Sin categoría/ });
const element = () => <ThemeProvider theme={createAppTheme('light')}><Checking /></ThemeProvider>;
function mount({ items = rows, mobile = false } = {}) {
  useMediaQuery.mockReturnValue(mobile);
  axios.get.mockImplementation(path => Promise.resolve({ data: path === '/api/categories' ? [{ id: 1, name: 'Comida ficticia' }] : { items, total: items.length } }));
  return render(element());
}
function select(name, option) {
  fireEvent.mouseDown(screen.getByRole('combobox', { name }));
  fireEvent.click(within(screen.getByRole('listbox')).getByRole('option', { name: option }));
}
beforeEach(() => { jest.clearAllMocks(); usePeriod.mockReturnValue({ year: 2030, month: 5 }); axios.put.mockResolvedValue({ data: {} }); });

test.each([false, true])('acceso rápido filtra null/ausente/vacío sin escrituras ni peticiones extras (%s)', async mobile => {
  mount({ mobile }); await screen.findByText(rows[0].descripcion); const gets = axios.get.mock.calls.length;
  expect(toggle()).toHaveAccessibleName('Sin categoría (3)'); expect(toggle()).toHaveAttribute('aria-pressed', 'false');
  fireEvent.click(toggle()); expect(toggle()).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByText(rows[0].descripcion)).toBeInTheDocument(); expect(screen.getByText(rows[1].descripcion)).toBeInTheDocument(); expect(screen.getByText(rows[2].descripcion)).toBeInTheDocument();
  expect(screen.queryByText(rows[3].descripcion)).not.toBeInTheDocument(); expect(screen.queryByText(rows[4].descripcion)).not.toBeInTheDocument();
  expect(screen.getByText('Mostrando 3 de 5 movimientos')).toBeInTheDocument();
  fireEvent.click(toggle()); expect(screen.getByText(rows[3].descripcion)).toBeInTheDocument(); expect(screen.getByText(rows[4].descripcion)).toBeInTheDocument();
  expect(axios.get).toHaveBeenCalledTimes(gets); expect(axios.put).not.toHaveBeenCalled(); expect(axios.post).not.toHaveBeenCalled(); expect(axios.delete).not.toHaveBeenCalled();
});
test('combina tipo y categoría; el acceso sustituye una categoría específica y al salir vuelve a todas', async () => {
  mount(); await screen.findByText(rows[0].descripcion); select('Tipo', 'Cargo'); expect(toggle()).toHaveAccessibleName('Sin categoría (2)');
  select('Categoría', 'Comida ficticia'); expect(screen.queryByText(rows[0].descripcion)).not.toBeInTheDocument(); expect(screen.getByText(rows[3].descripcion)).toBeInTheDocument();
  fireEvent.click(toggle()); expect(screen.getByText(rows[0].descripcion)).toBeInTheDocument(); expect(screen.getByText(rows[2].descripcion)).toBeInTheDocument(); expect(screen.queryByText(rows[3].descripcion)).not.toBeInTheDocument();
  expect(screen.getByRole('combobox', { name: 'Categoría' })).toHaveTextContent('Sin categoría'); fireEvent.click(toggle());
  expect(screen.getByRole('combobox', { name: 'Categoría' })).toHaveTextContent('Todas'); expect(screen.getByText(rows[3].descripcion)).toBeInTheDocument(); expect(screen.queryByText(rows[1].descripcion)).not.toBeInTheDocument();
});
test('opción Sin categoría del selector y acceso rápido comparten estado; ID numérico y string se comparan igual', async () => {
  mount(); await screen.findByText(rows[0].descripcion); select('Categoría', 'Sin categoría'); expect(toggle()).toHaveAttribute('aria-pressed', 'true'); expect(screen.queryByText(rows[3].descripcion)).not.toBeInTheDocument();
  select('Categoría', 'Comida ficticia'); expect(toggle()).toHaveAttribute('aria-pressed', 'false'); expect(screen.getByText(rows[3].descripcion)).toBeInTheDocument(); expect(screen.getByText(rows[4].descripcion)).toBeInTheDocument();
});
test('filtrar conserva saldo de referencia y totales mensuales', async () => {
  mount(); await screen.findByText(rows[0].descripcion); const totals = screen.getByTestId('totals-row').textContent; const balance = screen.getByTestId('bank-reference').textContent;
  fireEvent.click(toggle()); select('Tipo', 'Cargo'); expect(screen.getByTestId('totals-row')).toHaveTextContent(totals); expect(screen.getByTestId('bank-reference')).toHaveTextContent(balance);
});
test('sin coincidencias mantiene el filtro reversible y muestra estado vacío específico', async () => {
  mount({ items: [rows[3]] }); await screen.findByText(rows[3].descripcion); expect(toggle()).toHaveAccessibleName('Sin categoría (0)'); fireEvent.click(toggle());
  expect(toggle()).not.toBeDisabled(); expect(screen.getByText('No hay movimientos sin categoría con estos filtros.')).toBeInTheDocument(); expect(screen.queryByText('No hay movimientos este mes.')).not.toBeInTheDocument();
  fireEvent.click(toggle()); expect(screen.getByText(rows[3].descripcion)).toBeInTheDocument();
});
test('categorizar explícitamente retira la fila del filtro y actualiza contador sin tocar otros movimientos', async () => {
  mount(); await screen.findByText(rows[0].descripcion); fireEvent.click(toggle()); const row = screen.getByText(rows[0].descripcion).closest('tr');
  expect(axios.get.mock.calls.map(([path]) => path).sort()).toEqual(['/api/categories', '/api/checking']);
  const readsBeforeEdit = axios.get.mock.calls.length;
  fireEvent.mouseDown(within(row).getByRole('combobox')); fireEvent.click(within(screen.getByRole('listbox')).getByRole('option', { name: 'Comida ficticia' }));
  await waitFor(() => expect(screen.queryByText(rows[0].descripcion)).not.toBeInTheDocument()); expect(toggle()).toHaveAccessibleName('Sin categoría (2)');
  expect(axios.put).toHaveBeenCalledTimes(1); expect(axios.put).toHaveBeenCalledWith('/api/checking/null', { category_id: 1 }); expect(axios.get).toHaveBeenCalledTimes(readsBeforeEdit); expect(screen.getByText(rows[2].descripcion)).toBeInTheDocument();
});

test('mantiene el filtro al cambiar de mes y calcula el contador con los nuevos movimientos', async () => {
  const view = mount(); await screen.findByText(rows[0].descripcion); fireEvent.click(toggle()); select('Tipo', 'Cargo');
  const nextRows = [{ ...rows[0], id: 'next-pending', descripcion: 'Pendiente del nuevo mes' }, { ...rows[3], id: 'next-assigned', descripcion: 'Asignado del nuevo mes' }];
  axios.get.mockImplementation(path => Promise.resolve({ data: path === '/api/categories' ? [{ id: 1, name: 'Comida ficticia' }] : { items: nextRows, total: 2 } }));
  usePeriod.mockReturnValue({ year: 2030, month: 6 }); view.rerender(element());
  await screen.findByText('Pendiente del nuevo mes'); expect(screen.queryByText('Asignado del nuevo mes')).not.toBeInTheDocument(); expect(screen.queryByText(rows[0].descripcion)).not.toBeInTheDocument();
  expect(toggle()).toHaveAccessibleName('Sin categoría (1)'); expect(toggle()).toHaveAttribute('aria-pressed', 'true'); expect(screen.getByText('Mostrando 1 de 2 movimientos')).toBeInTheDocument();
  expect(axios.put).not.toHaveBeenCalled(); expect(axios.post).not.toHaveBeenCalled(); expect(axios.delete).not.toHaveBeenCalled();
});
