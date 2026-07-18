import { renderHook, act } from '@testing-library/react';
import useOffline from '../useOffline';

/**
 * Fase 2 — Req 9.3 / 9.12: hook de detección de conectividad.
 *
 * useOffline debe:
 *  - reflejar el estado inicial de navigator.onLine
 *  - actualizarse al disparar eventos 'offline' y 'online'
 */
describe('useOffline', () => {
  const setOnLine = (value) => {
    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      value,
    });
  };

  afterEach(() => {
    setOnLine(true);
  });

  test('refleja el estado inicial online', () => {
    setOnLine(true);
    const { result } = renderHook(() => useOffline());
    expect(result.current.isOffline).toBe(false);
    expect(result.current.isOnline).toBe(true);
  });

  test('detecta cuando inicia offline', () => {
    setOnLine(false);
    const { result } = renderHook(() => useOffline());
    expect(result.current.isOffline).toBe(true);
  });

  test('reacciona al evento offline', () => {
    setOnLine(true);
    const { result } = renderHook(() => useOffline());

    act(() => {
      setOnLine(false);
      window.dispatchEvent(new Event('offline'));
    });

    expect(result.current.isOffline).toBe(true);
  });

  test('reacciona al evento online', () => {
    setOnLine(false);
    const { result } = renderHook(() => useOffline());
    expect(result.current.isOffline).toBe(true);

    act(() => {
      setOnLine(true);
      window.dispatchEvent(new Event('online'));
    });

    expect(result.current.isOffline).toBe(false);
  });
});
