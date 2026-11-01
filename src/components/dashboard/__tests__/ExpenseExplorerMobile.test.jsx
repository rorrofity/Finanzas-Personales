import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { useMediaQuery } from '@mui/material';
import { ThemeProvider } from '@mui/material/styles';
import ExpenseExplorer from '../ExpenseExplorer';
import { createAppTheme } from '../../../theme';

jest.mock('@mui/material', () => ({ ...jest.requireActual('@mui/material'), useMediaQuery: jest.fn() }));
jest.mock('recharts', () => ({
  ResponsiveContainer: ({ children }) => <div>{children}</div>,
  LineChart: ({ children }) => <div>{children}</div>,
  Line: () => null, XAxis: () => null, YAxis: () => null,
  CartesianGrid: () => null, Tooltip: () => null,
}));

const months = [
  { key: '2026-09', year: 2026, month: 9, label: 'sep 2026', status: 'past', total: 0, count: 0 },
  { key: '2026-10', year: 2026, month: 10, label: 'oct 2026', status: 'current', total: 999999999.99, count: 1 },
];
const categories = Array.from({ length: 12 }, (_, i) => ({
  id: String(i + 1),
  name: i === 0 ? 'Vivienda y servicios del hogar con nombre largo' : i === 11 ? 'Sin categoría' : `Categoría ${i + 1}`,
  total: i ? 0 : 999999999.99, currentTotal: i ? 0 : 999999999.99,
  previousTotal: 0, delta: i ? 0 : 999999999.99, deltaPct: null,
  values: [{ month: '2026-09', total: 0, count: 0 }, { month: '2026-10', total: i ? 0 : 999999999.99, count: i ? 0 : 1 }],
}));
const report = {
  months, categories,
  summary: { currentTotal: 999999999.99, previousTotal: 0, delta: 999999999.99, deltaPct: null, largestIncrease: { name: categories[0].name, delta: 999999999.99 } },
  coverage: { status: 'unknown', consolidation: 'unverified', message: 'Cobertura bancaria no verificada.', warnings: ['Suma de registros de las fuentes seleccionadas; consolidación entre fuentes no verificada.'] },
  exclusions: { missingPeriodCount: 2, missingCLPCount: 1 },
};

beforeEach(() => useMediaQuery.mockReturnValue(true));

test('en móvil sustituye la tabla horizontal por todas las categorías legibles', () => {
  render(<ExpenseExplorer report={report} onOpenCell={jest.fn()} />);
  expect(screen.queryByRole('table', { name: 'Gastos por categoría y mes' })).not.toBeInTheDocument();
  const list = screen.getByTestId('expense-category-list');
  expect(within(list).getAllByRole('button', { name: /^Ver historial de/ })).toHaveLength(12);
  expect(within(list).getByText('Sin categoría')).toBeVisible();
  expect(screen.getByTestId('expense-current-total')).toHaveTextContent('$999.999.999,99');
  expect(screen.getByRole('tab', { name: 'Categorías', selected: true })).toBeVisible();
});

test('historial vertical abre el detalle del mes correcto sin perder categorías posteriores a la décima', () => {
  const onOpenCell = jest.fn();
  render(<ExpenseExplorer report={report} onOpenCell={onOpenCell} />);
  const expand = screen.getByRole('button', { name: 'Ver historial de Categoría 11' });
  expect(expand).toHaveAttribute('aria-expanded', 'false');
  fireEvent.click(expand);
  expect(expand).toHaveAttribute('aria-expanded', 'true');
  const history = screen.getByTestId('expense-category-history-11');
  fireEvent.click(within(history).getByRole('button', { name: 'Ver movimientos de Categoría 11 en sep 2026' }));
  expect(onOpenCell).toHaveBeenCalledWith(categories[10], months[0]);
});

test('la tendencia se elige sin forzar scroll lateral ni anteponer el gráfico a la lista', () => {
  render(<ExpenseExplorer report={report} onOpenCell={jest.fn()} />);
  expect(screen.queryByTestId('expense-trend')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('tab', { name: 'Tendencia' }));
  expect(screen.getByTestId('expense-trend')).toBeVisible();
  fireEvent.change(screen.getByRole('combobox', { name: 'Categoría' }), { target: { value: '12' } });
  expect(screen.getByTestId('expense-trend')).toHaveAttribute('aria-label', 'Tendencia de Sin categoría');
  fireEvent.click(screen.getByRole('tab', { name: 'Categorías' }));
  expect(screen.getByTestId('expense-category-list')).toBeVisible();
});

test('presenta las incidencias visibles y el contexto ampliable sin duplicar la advertencia', () => {
  render(<ExpenseExplorer report={report} onOpenCell={jest.fn()} />);
  expect(screen.getByText('3 movimientos fuera del análisis')).toBeVisible();
  const details = screen.getByRole('button', { name: 'Detalle de los datos' });
  fireEvent.click(details);
  expect(screen.getByText(/2 movimientos sin período/)).toBeVisible();
  expect(screen.getAllByText(/Suma de registros de las fuentes seleccionadas/)).toHaveLength(1);
});

test('el escritorio conserva la matriz completa y sus encabezados fijos', () => {
  useMediaQuery.mockReturnValue(false);
  render(<ExpenseExplorer report={report} onOpenCell={jest.fn()} />);
  expect(screen.getByRole('table', { name: 'Gastos por categoría y mes' })).toBeVisible();
  expect(screen.queryByTestId('expense-category-list')).not.toBeInTheDocument();
  expect(screen.getByRole('columnheader', { name: /^sep 2026/ })).toHaveStyle({ position: 'sticky', top: '0px' });
});

function rgba(color) {
  if (color.startsWith('#')) return [...color.slice(1).match(/../g).map((value) => parseInt(value, 16)), 1];
  const values = color.match(/[\d.]+/g).map(Number);
  return [...values.slice(0, 3), values[3] ?? 1];
}

function contrast(foreground, background) {
  const luminance = (channels) => channels.slice(0, 3).map((channel) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  }).reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
  const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

test.each(['light', 'dark'])('los textos secundarios del resumen mantienen contraste AA sobre su superficie real (%s)', (mode) => {
  const theme = createAppTheme(mode);
  render(<ThemeProvider theme={theme}><ExpenseExplorer report={report} onOpenCell={jest.fn()} /></ThemeProvider>);
  const summary = screen.getByTestId('expense-summary');
  const tint = rgba(getComputedStyle(summary).backgroundColor);
  const base = rgba(theme.palette.background.default);
  const background = tint.slice(0, 3).map((channel, index) => channel * tint[3] + base[index] * (1 - tint[3]));
  for (const caption of [within(summary).getByText(/^vs\./), within(summary).getByText(/^Mayor aumento:/)]) {
    expect(contrast(rgba(getComputedStyle(caption).color), background)).toBeGreaterThanOrEqual(4.5);
  }
});
