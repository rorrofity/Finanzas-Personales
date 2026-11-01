import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import ExpenseExplorer from '../ExpenseExplorer';

jest.mock('recharts', () => ({
  ResponsiveContainer: ({ children }) => <div>{children}</div>,
  LineChart: ({ children }) => <div>{children}</div>,
  Line: () => null, XAxis: () => null, YAxis: () => null,
  CartesianGrid: () => null, Tooltip: () => null,
}));

export const REPORT = {
  generatedAt: '2026-10-31T12:00:00Z',
  months: [
    { key: '2026-09', year: 2026, month: 9, label: 'sep 2026', status: 'past', total: 0, count: 0 },
    { key: '2026-10', year: 2026, month: 10, label: 'oct 2026', status: 'current', total: 999999999, count: 1 },
  ],
  categories: Array.from({ length: 12 }, (_, i) => ({
    id: String(i + 1), name: i === 11 ? 'Sin categoría' : i === 0 ? 'Vivienda y servicios del hogar con nombre largo' : `Categoría ${i + 1}`,
    total: i === 0 ? 999999999 : 0, currentTotal: i === 0 ? 999999999 : 0, previousTotal: 0, delta: i === 0 ? 999999999 : 0, deltaPct: null,
    values: [{ month: '2026-09', total: 0, count: 0 }, { month: '2026-10', total: i === 0 ? 999999999 : 0, count: i === 0 ? 1 : 0 }],
  })),
  summary: { currentTotal: 999999999, previousTotal: 0, delta: 999999999, deltaPct: null, total: 999999999 },
  coverage: { status: 'unknown', consolidation: 'single-source', message: 'Cobertura bancaria no verificada.', warnings: [] },
  exclusions: { missingPeriodCount: 2, missingCLPCount: 1 },
};

describe('ExpenseExplorer — matriz y tendencia de registros existentes', () => {
  test('incluye todas las categorías, totales e importes completos y explica la cobertura', () => {
    render(<ExpenseExplorer report={REPORT} onOpenCell={jest.fn()} />);
    const table = screen.getByRole('table', { name: 'Gastos por categoría y mes' });
    expect(within(table).getByRole('columnheader', { name: /^sep 2026/ })).toHaveStyle({ position: 'sticky', top: '0px' });
    expect(within(table).getAllByRole('row')).toHaveLength(14);
    expect(within(table).getByText('Sin categoría')).toBeInTheDocument();
    expect(screen.getByTestId('expense-current-total')).toHaveTextContent('$999.999.999');
    expect(screen.getByTestId('expense-coverage')).toHaveTextContent('Cobertura bancaria no verificada');
    expect(screen.getByText(/2 movimientos sin período/)).toBeInTheDocument();
    expect(screen.getByText(/1 movimiento internacional sin conversión/)).toBeInTheDocument();
    expect(screen.getAllByText(/Sin base previa/).length).toBeGreaterThan(0);
  });

  test('una celda abre la categoría por ID y el mes de esa celda', () => {
    const onOpenCell = jest.fn();
    render(<ExpenseExplorer report={REPORT} onOpenCell={onOpenCell} />);
    fireEvent.click(screen.getByRole('button', { name: 'Ver movimientos de Categoría 11 en sep 2026' }));
    expect(onOpenCell).toHaveBeenCalledWith(REPORT.categories[10], REPORT.months[0]);
  });

  test('permite seleccionar categorías posteriores a la décima para ver su tendencia', () => {
    render(<ExpenseExplorer report={REPORT} onOpenCell={jest.fn()} />);
    fireEvent.change(screen.getByRole('combobox', { name: 'Categoría' }), { target: { value: '12' } });
    expect(screen.getByTestId('expense-trend')).toHaveAttribute('aria-label', 'Tendencia de Sin categoría');
  });

  test('un período futuro y sin movimientos no se presenta como mes completo', () => {
    const report = { ...REPORT, months: REPORT.months.map((m) => ({ ...m, status: 'future', total: 0, count: 0 })), summary: { currentTotal: 0, previousTotal: 0, delta: 0, deltaPct: null } };
    render(<ExpenseExplorer report={report} onOpenCell={jest.fn()} />);
    expect(screen.getAllByText('Futuro').length).toBeGreaterThan(0);
    expect(screen.getByText(/Sin movimientos registrados en el mes seleccionado/)).toBeInTheDocument();
  });

  test('conserva los centavos registrados en los importes y variaciones (DCE-21)', () => {
    const report = { ...REPORT, summary: { ...REPORT.summary, currentTotal: 176.2, delta: 176.2 } };
    render(<ExpenseExplorer report={report} onOpenCell={jest.fn()} />);
    expect(screen.getByTestId('expense-current-total')).toHaveTextContent('$176,2');
    expect(screen.getAllByText('+$176,2').length).toBeGreaterThan(0);
  });
});
