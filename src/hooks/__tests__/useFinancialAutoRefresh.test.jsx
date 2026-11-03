import { renderHook, act } from '@testing-library/react';
import useFinancialAutoRefresh from '../useFinancialAutoRefresh';
import { notifyFinancialDataChanged, FINANCIAL_DATA_STORAGE_KEY, FINANCIAL_DATA_MESSAGE_TYPE } from '../../services/financialDataEvents';
const visible = value => Object.defineProperty(document, 'visibilityState', { configurable: true, value });
const online = value => Object.defineProperty(navigator, 'onLine', { configurable: true, value });
beforeEach(() => { jest.useFakeTimers(); visible('visible'); online(true); Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: new EventTarget() }); });
afterEach(() => { jest.useRealTimers(); });
test('polling cada cinco minutos solo visible y online, sin carga inicial duplicada', () => {
  const refresh = jest.fn(); const { unmount } = renderHook(() => useFinancialAutoRefresh(refresh)); expect(refresh).not.toHaveBeenCalled();
  act(() => jest.advanceTimersByTime(300000)); expect(refresh).toHaveBeenCalledTimes(1);
  visible('hidden'); act(() => jest.advanceTimersByTime(300000)); expect(refresh).toHaveBeenCalledTimes(1);
  visible('visible'); online(false); act(() => jest.advanceTimersByTime(300000)); expect(refresh).toHaveBeenCalledTimes(1); unmount();
});
test('foco, visibilidad y reconexión simultáneos se agrupan en una lectura', () => {
  const refresh = jest.fn(); renderHook(() => useFinancialAutoRefresh(refresh));
  act(() => { window.dispatchEvent(new Event('focus')); document.dispatchEvent(new Event('visibilitychange')); window.dispatchEvent(new Event('online')); });
  expect(refresh).not.toHaveBeenCalled(); act(() => jest.advanceTimersByTime(250)); expect(refresh).toHaveBeenCalledTimes(1);
});
test('edición local, señal de otra ventana y push sin datos recargan', () => {
  const refresh = jest.fn(); renderHook(() => useFinancialAutoRefresh(refresh));
  act(() => { notifyFinancialDataChanged(); jest.advanceTimersByTime(250); }); expect(refresh).toHaveBeenCalledTimes(1);
  act(() => { window.dispatchEvent(new StorageEvent('storage', { key: FINANCIAL_DATA_STORAGE_KEY })); jest.advanceTimersByTime(250); }); expect(refresh).toHaveBeenCalledTimes(2);
  act(() => { navigator.serviceWorker.dispatchEvent(new MessageEvent('message', { data: { type: FINANCIAL_DATA_MESSAGE_TYPE } })); jest.advanceTimersByTime(250); }); expect(refresh).toHaveBeenCalledTimes(3);
});
test('sin conexión o pestaña oculta no hay lectura de eventos', () => {
  const refresh = jest.fn(); renderHook(() => useFinancialAutoRefresh(refresh));
  online(false); act(() => { window.dispatchEvent(new Event('focus')); jest.advanceTimersByTime(250); });
  online(true); visible('hidden'); act(() => { notifyFinancialDataChanged(); jest.advanceTimersByTime(250); }); expect(refresh).not.toHaveBeenCalled();
  visible('visible'); act(() => { document.dispatchEvent(new Event('visibilitychange')); jest.advanceTimersByTime(250); }); expect(refresh).toHaveBeenCalledTimes(1);
});
test('usa callback reciente y retira timers/listeners al salir', () => {
  const first = jest.fn(), next = jest.fn(); const { rerender, unmount } = renderHook(({ fn }) => useFinancialAutoRefresh(fn), { initialProps: { fn: first } }); rerender({ fn: next });
  act(() => { window.dispatchEvent(new Event('focus')); jest.advanceTimersByTime(250); }); expect(next).toHaveBeenCalledTimes(1); expect(first).not.toHaveBeenCalled();
  unmount(); act(() => { window.dispatchEvent(new Event('focus')); jest.advanceTimersByTime(600000); }); expect(next).toHaveBeenCalledTimes(1);
});
test('deshabilitado no registra refrescos', () => {
  const refresh = jest.fn(); renderHook(() => useFinancialAutoRefresh(refresh, { enabled: false }));
  act(() => { window.dispatchEvent(new Event('focus')); jest.advanceTimersByTime(600000); }); expect(refresh).not.toHaveBeenCalled();
});
