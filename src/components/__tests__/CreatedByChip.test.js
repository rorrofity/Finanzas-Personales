import React from 'react';
import { render, screen } from '@testing-library/react';
import CreatedByChip from '../CreatedByChip';

/**
 * Fase 3 — Req 11.12: indicador de quién registró la transacción.
 * El chip solo se muestra con nombre presente; la condición de
 * ">1 participante" la decide el padre (contexto de espacio compartido).
 */
describe('CreatedByChip (Req 11.12)', () => {
  test('muestra el nombre de quien registró', () => {
    render(<CreatedByChip name="Pareja" />);
    expect(screen.getByText(/Pareja/)).toBeInTheDocument();
  });

  test('no renderiza nada sin nombre', () => {
    const { container } = render(<CreatedByChip name={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});
