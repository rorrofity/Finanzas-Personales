import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { useTheme } from '@mui/material/styles';
import { AppearanceProvider, useAppearance } from '../AppearanceContext';

let media;
let listeners;
const Probe = () => {
  const { preference, resolvedMode, setPreference } = useAppearance();
  const theme = useTheme();
  return <div>
    <output data-testid="appearance-state">{preference}:{resolvedMode}:{theme.palette.mode}</output>
    <button onClick={() => setPreference('light')}>Claro</button>
    <button onClick={() => setPreference('dark')}>Oscuro</button>
    <button onClick={() => setPreference('system')}>Automático</button>
  </div>;
};

beforeEach(() => {
  localStorage.clear();
  listeners = new Set();
  media = { matches: false, addEventListener: (type, fn) => listeners.add(fn), removeEventListener: (type, fn) => listeners.delete(fn) };
  window.matchMedia = jest.fn(() => media);
});

test('sin preferencia sigue el modo oscuro del dispositivo desde el primer render', () => {
  media.matches = true;
  render(<AppearanceProvider><Probe /></AppearanceProvider>);
  expect(screen.getByTestId('appearance-state')).toHaveTextContent('system:dark:dark');
  expect(localStorage.getItem('finanzas-appearance')).toBeNull();
});

test('la selección explícita se conserva y no cambia al cambiar el sistema', () => {
  render(<AppearanceProvider><Probe /></AppearanceProvider>);
  fireEvent.click(screen.getByRole('button', { name: 'Oscuro', exact: true }));
  expect(screen.getByTestId('appearance-state')).toHaveTextContent('dark:dark:dark');
  expect(localStorage.getItem('finanzas-appearance')).toBe('dark');
  act(() => listeners.forEach(listener => listener({ matches: false })));
  expect(screen.getByTestId('appearance-state')).toHaveTextContent('dark:dark:dark');
});

test('restaura claro guardado aunque el dispositivo use oscuro', () => {
  localStorage.setItem('finanzas-appearance', 'light');
  media.matches = true;
  render(<AppearanceProvider><Probe /></AppearanceProvider>);
  expect(screen.getByTestId('appearance-state')).toHaveTextContent('light:light:light');
});

test('automático sigue cambios del sistema y limpia su listener al desmontar', () => {
  const { unmount } = render(<AppearanceProvider><Probe /></AppearanceProvider>);
  expect(listeners.size).toBe(1);
  act(() => listeners.forEach(listener => listener({ matches: true })));
  expect(screen.getByTestId('appearance-state')).toHaveTextContent('system:dark:dark');
  fireEvent.click(screen.getByRole('button', { name: 'Claro', exact: true }));
  fireEvent.click(screen.getByRole('button', { name: 'Automático', exact: true }));
  expect(screen.getByTestId('appearance-state')).toHaveTextContent('system:dark:dark');
  unmount();
  expect(listeners.size).toBe(0);
});

test('un valor guardado inválido vuelve a automático y sincroniza cambios de otra pestaña', () => {
  localStorage.setItem('finanzas-appearance', 'unexpected');
  render(<AppearanceProvider><Probe /></AppearanceProvider>);
  expect(screen.getByTestId('appearance-state')).toHaveTextContent('system:light:light');
  act(() => window.dispatchEvent(new StorageEvent('storage', { key: 'finanzas-appearance', newValue: 'dark' })));
  expect(screen.getByTestId('appearance-state')).toHaveTextContent('dark:dark:dark');
  act(() => window.dispatchEvent(new StorageEvent('storage', { key: 'finanzas-appearance', newValue: null })));
  expect(screen.getByTestId('appearance-state')).toHaveTextContent('system:light:light');
});

test('aplica color-scheme y el color de navegador/PWA según el tema efectivo', () => {
  render(<AppearanceProvider><Probe /></AppearanceProvider>);
  fireEvent.click(screen.getByRole('button', { name: 'Oscuro', exact: true }));
  expect(document.documentElement.style.colorScheme).toBe('dark');
  expect(document.documentElement.dataset.appearance).toBe('dark');
  expect(document.querySelector('meta[name="theme-color"]').content).toBe('#0B1220');
});

test('un navegador que bloquea almacenamiento conserva la selección en memoria', () => {
  const get = jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
  const set = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
  try {
    render(<AppearanceProvider><Probe /></AppearanceProvider>);
    fireEvent.click(screen.getByRole('button', { name: 'Oscuro', exact: true }));
    expect(screen.getByTestId('appearance-state')).toHaveTextContent('dark:dark:dark');
  } finally { get.mockRestore(); set.mockRestore(); }
});

test('no confunde un evento de sessionStorage con una preferencia local del dispositivo', () => {
  render(<AppearanceProvider><Probe /></AppearanceProvider>);
  act(() => window.dispatchEvent(new StorageEvent('storage', { key: 'finanzas-appearance', newValue: 'dark', storageArea: sessionStorage })));
  expect(screen.getByTestId('appearance-state')).toHaveTextContent('system:light:light');
});

test('sin matchMedia disponible permite una elección explícita y parte en claro', () => {
  window.matchMedia = undefined;
  render(<AppearanceProvider><Probe /></AppearanceProvider>);
  expect(screen.getByTestId('appearance-state')).toHaveTextContent('system:light:light');
  fireEvent.click(screen.getByRole('button', { name: 'Oscuro', exact: true }));
  expect(screen.getByTestId('appearance-state')).toHaveTextContent('dark:dark:dark');
});
