import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import CategoryBar from '../CategoryBar';
import userEvent from '@testing-library/user-event';

/**
 * Epic 12 — Req 12.4: fila de categoría con barra %, monto y click.
 */
describe('CategoryBar', () => {
  test('muestra nombre, monto y porcentaje', () => {
    render(<CategoryBar name="Cuentas" total={700000} pct={0.38} />);
    expect(screen.getByText('Cuentas')).toBeInTheDocument();
    expect(screen.getByText(/700\.000/)).toBeInTheDocument();
    expect(screen.getByText('38%')).toBeInTheDocument();
  });

  test('la barra refleja el porcentaje', () => {
    render(<CategoryBar name="Cuentas" total={700000} pct={0.38} />);
    const bar = screen.getByTestId('category-bar-fill');
    expect(bar).toHaveStyle({ width: '38%' });
  });

  test('invoca onClick al tocar', () => {
    const onClick = jest.fn();
    render(<CategoryBar name="Cuentas" total={700000} pct={0.38} onClick={onClick} />);
    fireEvent.click(screen.getByText('Cuentas'));
    expect(onClick).toHaveBeenCalled();
  });

  test('el detalle de categoría se puede abrir con teclado', async () => {
    const onClick = jest.fn();
    render(<CategoryBar name="Cuentas" total={700000} pct={0.38} onClick={onClick} />);
    const button = screen.getByRole('button', { name: /Cuentas/ });
    button.focus();
    await userEvent.keyboard('{Enter}');
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
