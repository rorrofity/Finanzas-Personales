import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { AppearanceProvider } from '../../contexts/AppearanceContext';
import AppearanceModeControl from '../AppearanceModeControl';

beforeEach(() => { localStorage.clear(); });

test('el control permite elegir oscuro, claro y automático con estado accesible', () => {
  render(<AppearanceProvider><AppearanceModeControl /></AppearanceProvider>);
  fireEvent.click(screen.getByRole('button', { name: 'Apariencia', exact: true }));
  const dark = screen.getByRole('menuitemradio', { name: 'Oscuro', exact: true });
  expect(dark).toHaveAttribute('aria-checked', 'false');
  fireEvent.click(dark);
  expect(localStorage.getItem('finanzas-appearance')).toBe('dark');
  fireEvent.click(screen.getByRole('button', { name: 'Apariencia', exact: true }));
  expect(screen.getByRole('menuitemradio', { name: 'Oscuro', exact: true })).toHaveAttribute('aria-checked', 'true');
  fireEvent.click(screen.getByRole('menuitemradio', { name: 'Claro', exact: true }));
  expect(localStorage.getItem('finanzas-appearance')).toBe('light');
  fireEvent.click(screen.getByRole('button', { name: 'Apariencia', exact: true }));
  fireEvent.click(screen.getByRole('menuitemradio', { name: 'Automático', exact: true }));
  expect(localStorage.getItem('finanzas-appearance')).toBe('system');
});

test('la variante compacta conserva un nombre accesible en móvil', () => {
  render(<AppearanceProvider><AppearanceModeControl compact /></AppearanceProvider>);
  expect(screen.getByRole('button', { name: 'Apariencia', exact: true })).toHaveAttribute('aria-haspopup', 'menu');
});
