import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import FinancialHealth from '../FinancialHealth';
import theme from '../../theme';
import axios from '../../config/axios';

jest.mock('../../config/axios', () => ({ get: jest.fn() }));
jest.mock('../../components/MonthPicker', () => () => <div>Período octubre 2026</div>);
jest.mock('../../contexts/PeriodContext', () => ({
  usePeriod: () => ({ year: 2026, month: 10 }),
}));
jest.mock('recharts', () => ({
  ResponsiveContainer: ({ children }) => <div>{children}</div>,
  PieChart: ({ children }) => <div>{children}</div>,
  Pie: () => <div data-testid="commitment-chart" />,
  Cell: () => null,
  Tooltip: () => null,
}));

const fixture = (income = 200) => ({
  checking: { currentBalance: 1000 },
  creditCards: { visa: { total: 120 }, mastercard: { total: 80 }, combined: 200 },
  projected: {
    income, expenses: 200,
    details: {
      income: [{ name: 'Ingreso', amount: income }],
      expenses: Array.from({ length: 8 }, (_, i) => ({ name: `Compromiso ${i + 1}`, amount: 25 })),
    },
  },
  summary: { totalCommitments: 400, projectedBalance: 800, healthScore: 80, healthStatus: 'excellent' },
  alerts: [],
});

const renderPage = () => render(<ThemeProvider theme={theme}><FinancialHealth /></ThemeProvider>);

beforeEach(() => {
  axios.get.mockReset();
  axios.get.mockImplementation(async (url) => ({ data: url.includes('/financial-health/') ? fixture() : [] }));
});

test('muestra el porcentaje real aunque los compromisos superen los ingresos', async () => {
  renderPage();
  expect(await screen.findByText('200% comprometido')).toBeVisible();
});

test('la composición deriva del mismo resumen y no consulta otra distribución de categorías', async () => {
  renderPage();
  expect(await screen.findByText('Composición de compromisos')).toBeVisible();
  expect(screen.getByText('Otros compromisos')).toBeVisible();
  expect(screen.getByText('30%')).toBeVisible();
  expect(screen.getByText('20%')).toBeVisible();
  expect(screen.getByText('25%')).toBeVisible();
  expect(axios.get).toHaveBeenCalledTimes(1);
  expect(axios.get).toHaveBeenCalledWith('/api/financial-health/summary', { params: { year: 2026, month: 10 } });
});

test('sin ingresos no presenta cero por ciento como una comparación válida', async () => {
  axios.get.mockImplementation(async (url) => ({ data: url.includes('/financial-health/') ? fixture(0) : [] }));
  renderPage();
  expect(await screen.findByText('Sin ingresos de referencia')).toBeVisible();
  expect(screen.queryByText('0% comprometido')).not.toBeInTheDocument();
});

test('un error del resumen se informa sin inventar datos de compromisos', async () => {
  const warning = jest.spyOn(console, 'error').mockImplementation(() => {});
  axios.get.mockRejectedValue(new Error('network unavailable'));
  renderPage();
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Error al cargar datos'));
  expect(screen.queryByTestId('commitment-chart')).not.toBeInTheDocument();
  warning.mockRestore();
});

test('con USD pendientes la evaluación y proyección se presentan como parciales',async()=>{
  const data=fixture();data.summary={...data.summary,conversionPendingCount:1,amountsPartial:true};axios.get.mockResolvedValue({data});renderPage();expect(await screen.findByText(/1 movimiento USD sin conversión/)).toBeInTheDocument();expect(screen.getByText('Proyección parcial fin de mes')).toBeInTheDocument();expect(screen.getByText('Evaluación parcial')).toBeInTheDocument();expect(screen.queryByText('Excelente')).not.toBeInTheDocument();expect(screen.getByText(/200% comprometido · parcial/)).toBeInTheDocument();expect(axios.get).toHaveBeenCalledTimes(1);
});
