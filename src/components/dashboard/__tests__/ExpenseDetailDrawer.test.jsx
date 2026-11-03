import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ExpenseDetailDrawer from '../ExpenseDetailDrawer';
import { readExpenseTransactions } from '../../../services/expenseEvolution';

jest.mock('../../../services/expenseEvolution', () => ({ readExpenseTransactions: jest.fn() }));

const selection = { category: { id: '12', name: 'Servicios' }, month: { year: 2026, month: 8, label: 'ago 2026' } };
const scope = { userId: 'reader', ownerId: 'owner', sources: ['tc_nacional'] };
const response = { data: { category: selection.category, total: 20000, count: 101, limit: 100, offset: 0, hasMore: true, transactions: [{ id:'same-id', source:'tc_nacional', fecha:'2026-07-12', descripcion:'Movimiento guardado', amount:20000 }] }, origin: 'network', stale: false };

test('detalle muestra fecha real, total completo y permite cargar la siguiente página', async () => {
  readExpenseTransactions.mockResolvedValueOnce(response).mockResolvedValueOnce({ ...response, data: { ...response.data, offset:100, hasMore:false, transactions:[{id:'last',source:'tc_nacional',fecha:'2026-07-20',descripcion:'Movimiento final',amount:1000}] } });
  render(<ExpenseDetailDrawer selection={selection} scope={scope} onClose={jest.fn()} />);
  expect(await screen.findByRole('dialog',{name:'Servicios'})).toBeInTheDocument();
  expect(screen.getByRole('dialog',{name:'Servicios'}).closest('.MuiDrawer-root')).toHaveStyle({ zIndex: '1202' });
  expect(await screen.findByText('Movimiento guardado')).toBeInTheDocument();
  expect(screen.getByText(/12[-/]0?7[-/]2026/)).toBeInTheDocument();
  expect(screen.getByRole('button',{name:'Cerrar detalle'})).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Siguientes'}));
  await waitFor(()=>expect(readExpenseTransactions).toHaveBeenLastCalledWith(expect.objectContaining({year:2026,month:8,categoryId:'12',offset:100,limit:100}),expect.any(Object)));
  expect(await screen.findByText('Movimiento final')).toBeInTheDocument();
  expect(screen.queryByText('Movimiento guardado')).not.toBeInTheDocument();
});

test('detalle conserva centavos del total y del movimiento', async () => {
  readExpenseTransactions.mockResolvedValueOnce({ ...response, data: { ...response.data, total:176.2, count:1, hasMore:false, transactions:[{id:'decimal',source:'tc_nacional',fecha:'2026-07-12',descripcion:'Importe con centavos',amount:176.2}] } });
  render(<ExpenseDetailDrawer selection={selection} scope={scope} onClose={jest.fn()} />);
  expect(await screen.findAllByText('$176,2')).toHaveLength(2);
});

test('detalle de reparto distingue monto atribuido y total de la compra original', async () => {
  readExpenseTransactions.mockResolvedValueOnce({ ...response, data: { ...response.data, total:100000.01, count:1, hasMore:false, transactions:[{id:'split-parent',source:'tc_nacional',fecha:'2026-07-12',descripcion:'Compra repartida ficticia',amount:100000.01,originalAmount:180000.02,isSplit:true}] } });
  render(<ExpenseDetailDrawer selection={selection} scope={scope} onClose={jest.fn()} />);
  expect(await screen.findByText('Compra repartida ficticia')).toBeInTheDocument();
  expect(screen.getByText(/Total original: \$180\.000,02/)).toBeInTheDocument();
  expect(screen.getAllByText('$100.000,01')).toHaveLength(2);
});
