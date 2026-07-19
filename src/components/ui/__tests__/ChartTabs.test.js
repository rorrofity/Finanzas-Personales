import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import ChartTabs from '../ChartTabs';

/**
 * Epic 12 — Req 12.5: un solo gráfico visible, alternado por tabs.
 */
describe('ChartTabs', () => {
  const tabs = [
    { label: 'Evolución', content: <div>GRAFICO_EVOLUCION</div> },
    { label: 'Por categoría', content: <div>GRAFICO_CATEGORIA</div> },
  ];

  test('muestra el primer tab por defecto y oculta el resto', () => {
    render(<ChartTabs tabs={tabs} />);
    expect(screen.getByText('GRAFICO_EVOLUCION')).toBeInTheDocument();
    expect(screen.queryByText('GRAFICO_CATEGORIA')).not.toBeInTheDocument();
  });

  test('al cambiar de tab muestra el otro gráfico', () => {
    render(<ChartTabs tabs={tabs} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Por categoría' }));
    expect(screen.getByText('GRAFICO_CATEGORIA')).toBeInTheDocument();
    expect(screen.queryByText('GRAFICO_EVOLUCION')).not.toBeInTheDocument();
  });
});
