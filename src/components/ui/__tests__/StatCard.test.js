import React from 'react';
import { render, screen } from '@testing-library/react';
import StatCard from '../StatCard';

/**
 * Epic 12 — Req 12.2/12.6/12.7: stat-card compacta.
 */
describe('StatCard', () => {
  test('muestra label y valor formateado', () => {
    render(<StatCard label="Balance" value={520000} />);
    expect(screen.getByText('Balance')).toBeInTheDocument();
    expect(screen.getByText(/520\.000/)).toBeInTheDocument();
  });

  test('estado vacío discreto cuando value es null', () => {
    render(<StatCard label="Ingresos" value={null} />);
    expect(screen.getByText(/Sin datos del período/i)).toBeInTheDocument();
  });

  test('skeleton cuando loading', () => {
    const { container } = render(<StatCard label="Gastos" value={100} loading />);
    expect(container.querySelector('.MuiSkeleton-root')).toBeInTheDocument();
    // No muestra el valor mientras carga
    expect(screen.queryByText(/^\$100$/)).not.toBeInTheDocument();
  });

  test('renderiza el delta cuando se provee', () => {
    render(<StatCard label="Gastos" value={1800000} deltaPct={-5} positiveIsGood={false} />);
    expect(screen.getByText(/5%/)).toBeInTheDocument();
  });

  test('usa formato abreviado con resolución de mil (short)', () => {
    render(<StatCard label="Gastos" value={1800000} short />);
    expect(screen.getByText('$1.800K')).toBeInTheDocument();
  });
});
