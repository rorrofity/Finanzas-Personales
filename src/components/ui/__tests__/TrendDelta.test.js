import React from 'react';
import { render, screen } from '@testing-library/react';
import TrendDelta from '../TrendDelta';

/**
 * Epic 12 — Req 12.2 y borde: delta con signo, color semántico y null → "—".
 */
describe('TrendDelta', () => {
  test('valor positivo muestra flecha arriba y %', () => {
    render(<TrendDelta value={12.3} />);
    expect(screen.getByText(/12%/)).toBeInTheDocument();
    expect(screen.getByTestId('trend-up')).toBeInTheDocument();
  });

  test('valor negativo muestra flecha abajo', () => {
    render(<TrendDelta value={-5} />);
    expect(screen.getByText(/5%/)).toBeInTheDocument();
    expect(screen.getByTestId('trend-down')).toBeInTheDocument();
  });

  test('null se muestra como "—" sin flechas', () => {
    render(<TrendDelta value={null} />);
    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.queryByTestId('trend-up')).not.toBeInTheDocument();
    expect(screen.queryByTestId('trend-down')).not.toBeInTheDocument();
  });

  test('color semántico: para gasto, bajar es bueno (verde)', () => {
    const { getByTestId } = render(<TrendDelta value={-5} positiveIsGood={false} />);
    // baja de gasto → good → success.main
    const el = getByTestId('trend-delta');
    expect(el).toHaveAttribute('data-tone', 'good');
  });

  test('color semántico: para balance, subir es bueno', () => {
    const { getByTestId } = render(<TrendDelta value={10} positiveIsGood />);
    expect(getByTestId('trend-delta')).toHaveAttribute('data-tone', 'good');
  });
});
