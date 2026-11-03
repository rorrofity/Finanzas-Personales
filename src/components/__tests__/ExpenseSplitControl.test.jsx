import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import axios from 'axios';
import { createAppTheme } from '../../theme';
import ExpenseSplitControl from '../ExpenseSplitControl';
import { clearReadCache } from '../../services/readCache';

jest.mock('axios', () => ({ get: jest.fn(), put: jest.fn(), delete: jest.fn() }));
jest.mock('../../services/readCache', () => ({ clearReadCache: jest.fn() }));
const row = { id: 'fixture-purchase', descripcion: 'Salomon ficticio', tipo: 'gasto', monto: '180000.00', category_id: 1 };
const categories = [{ id: 1, name: 'Calzado ficticio' }, { id: 2, name: 'Ropa ficticia' }];
const envelope = { source: 'tc_nacional', id: row.id, total_clp: '180000.00', currency: 'CLP', split: null };
const saved = { version: 'fixture-version', total_clp: '180000.00', parts: [{ amount_clp: '100000.00', category_id: 1, category_name: categories[0].name }, { amount_clp: '80000.00', category_id: null, category_name: null }] };
function mount(props = {}) {
  const onChange = jest.fn();
  const element = <ThemeProvider theme={createAppTheme('light')}><ExpenseSplitControl row={row} source="tc_nacional" categories={categories} canEdit onChange={onChange} {...props} /></ThemeProvider>;
  return { ...render(element), onChange };
}
async function open() { fireEvent.click(screen.getByRole('button', { name: 'Dividir gasto' })); return screen.findByRole('dialog', { name: 'Dividir gasto' }); }
beforeEach(() => {
  jest.clearAllMocks();
  axios.get.mockResolvedValue({ data: envelope });
  axios.put.mockResolvedValue({ data: { ...envelope, split: saved } });
  axios.delete.mockResolvedValue({ data: envelope });
  clearReadCache.mockResolvedValue();
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
});
test('solo categoría y monto, barra cambia ambos montos en vivo, cancelar nunca escribe', async () => {
  mount(); const dialog = await open();
  expect(await within(dialog).findByLabelText('Monto CLP, parte 1')).toHaveValue(90000);
  expect(within(dialog).getByLabelText('Monto CLP, parte 2')).toHaveValue(90000);
  const thumb = within(dialog).getByRole('slider').closest('.MuiSlider-thumb');
  expect(thumb).toHaveStyle({ position: 'absolute' });
  expect(getComputedStyle(thumb).transform).toContain('translate');
  expect(within(dialog).queryByText('Para quién')).not.toBeInTheDocument();
  fireEvent.change(within(dialog).getByRole('slider', { name: /Mover división entre partes 1 y 2/ }), { target: { value: 10000000 } });
  expect(within(dialog).getByLabelText('Monto CLP, parte 1')).toHaveValue(100000);
  expect(within(dialog).getByLabelText('Monto CLP, parte 2')).toHaveValue(80000);
  fireEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
  expect(axios.put).not.toHaveBeenCalled(); expect(axios.delete).not.toHaveBeenCalled();
});
test('escribir cualquiera de los montos, agregar, igualar y quitar conservan suma exacta', async () => {
  mount(); const dialog = await open(); await within(dialog).findByLabelText('Monto CLP, parte 1');
  fireEvent.change(within(dialog).getByLabelText('Monto CLP, parte 2'), { target: { value: '70000' } });
  expect(within(dialog).getByLabelText('Monto CLP, parte 1')).toHaveValue(110000);
  fireEvent.click(within(dialog).getByRole('button', { name: 'Agregar parte' }));
  fireEvent.click(within(dialog).getByRole('button', { name: 'Agregar parte' }));
  expect(within(dialog).getAllByRole('spinbutton')).toHaveLength(4);
  fireEvent.click(within(dialog).getByRole('button', { name: 'Partes iguales' }));
  expect(within(dialog).getAllByRole('spinbutton').map(n => n.value)).toEqual(['45000', '45000', '45000', '45000']);
  fireEvent.click(within(dialog).getByRole('button', { name: 'Quitar parte 3' }));
  expect(within(dialog).getAllByRole('spinbutton').map(n => n.value)).toEqual(['45000', '90000', '45000']);
  expect(within(dialog).getByText('Diferencia $0')).toBeInTheDocument();
});
test('confirma con decimales exactos, categorías enteras/nulas y versión; limpia caché', async () => {
  const { onChange } = mount(); const dialog = await open(); await within(dialog).findByLabelText('Monto CLP, parte 1');
  fireEvent.change(within(dialog).getByLabelText('Monto CLP, parte 1'), { target: { value: '100000' } });
  fireEvent.mouseDown(within(dialog).getByRole('combobox', { name: 'Categoría, parte 2' }));
  fireEvent.click(within(await screen.findByRole('listbox')).getByRole('option', { name: 'Sin categoría' }));
  fireEvent.click(within(dialog).getByRole('button', { name: 'Confirmar división' }));
  await waitFor(() => expect(axios.put).toHaveBeenCalledWith('/api/expense-splits/tc_nacional/fixture-purchase', { expectedVersion: 0, parts: [{ amount_clp: '100000.00', category_id: 1 }, { amount_clp: '80000.00', category_id: null }] }));
  await waitFor(() => expect(onChange).toHaveBeenCalledWith(saved)); expect(clearReadCache).toHaveBeenCalled();
});
test('rechaza montos inválidos y mantiene borrador al fallar el guardado', async () => {
  mount(); const dialog = await open(); await within(dialog).findByLabelText('Monto CLP, parte 1');
  fireEvent.change(within(dialog).getByLabelText('Monto CLP, parte 1'), { target: { value: '180001' } });
  expect(within(dialog).getByRole('button', { name: 'Confirmar división' })).toBeDisabled();
  fireEvent.change(within(dialog).getByLabelText('Monto CLP, parte 1'), { target: { value: '100000.01' } });
  axios.put.mockRejectedValue({ response: { status: 500, data: { error: 'Fallo de prueba' } } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Confirmar división' }));
  expect(await within(dialog).findByText('Fallo de prueba')).toBeInTheDocument();
  expect(within(dialog).getByLabelText('Monto CLP, parte 1')).toHaveValue(100000.01);
});
test('conflicto bloquea confirmación hasta recargar sin perder silenciosamente el borrador', async () => {
  mount(); const dialog = await open(); await within(dialog).findByLabelText('Monto CLP, parte 1');
  axios.put.mockRejectedValue({ response: { status: 409, data: { error: 'Cambió el movimiento' } } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Confirmar división' }));
  expect(await within(dialog).findByText(/Recarga la división/)).toBeInTheDocument();
  expect(within(dialog).getByRole('button', { name: 'Confirmar división' })).toBeDisabled();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Recargar división' }));
  await waitFor(() => expect(axios.get).toHaveBeenCalledTimes(2));
});
test('deshacer pide confirmación explícita, conserva categoría padre y exige versión', async () => {
  axios.get.mockResolvedValue({ data: { ...envelope, split: saved } });
  const { onChange } = mount({ row: { ...row, split: saved } });
  expect(screen.getByText(/Sin categoría/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Editar división' }));
  const dialog = await screen.findByRole('dialog', { name: 'Editar división' });
  await within(dialog).findByLabelText('Monto CLP, parte 1');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Deshacer división' }));
  expect(axios.delete).not.toHaveBeenCalled();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Confirmar deshacer' }));
  await waitFor(() => expect(axios.delete).toHaveBeenCalledWith('/api/expense-splits/tc_nacional/fixture-purchase', { data: { expectedVersion: saved.version } }));
  await waitFor(() => expect(onChange).toHaveBeenCalledWith(null)); expect(row.category_id).toBe(1);
});
test.each([{ canEdit: false }, { disabled: true }])('lectura/offline no abre escrituras (%j)', props => {
  mount(props); expect(screen.getByRole('button', { name: 'Dividir gasto' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Dividir gasto' })); expect(axios.get).not.toHaveBeenCalled();
});
test('offline real impide abrir aunque canEdit sea true', () => {
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
  mount(); expect(screen.getByRole('button', { name: 'Dividir gasto' })).toBeDisabled();
});
