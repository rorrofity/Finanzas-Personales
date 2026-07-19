import { renderHook, act, waitFor } from '@testing-library/react';
import usePushNotifications from '../usePushNotifications';
import * as pushClient from '../../services/pushClient';

/**
 * Epic 13 Fase 4 — Reqs 13.7, 13.12: estado y acciones de notificaciones
 * push (permiso no intrusivo: nada se pide automáticamente al montar).
 */

jest.mock('../../services/pushClient');

describe('usePushNotifications', () => {
  const originalNotification = global.Notification;

  beforeEach(() => {
    jest.clearAllMocks();
    pushClient.getExistingSubscription.mockResolvedValue(null);
    global.Notification = { permission: 'default', requestPermission: jest.fn() };
    // jsdom no implementa Push API: simular un navegador que sí la soporta
    // (Chrome/Edge/Safari 16.4+ con la PWA instalada).
    if (!('serviceWorker' in navigator)) {
      Object.defineProperty(navigator, 'serviceWorker', { value: {}, configurable: true });
    }
    if (!('PushManager' in window)) {
      window.PushManager = function PushManager() {};
    }
  });

  afterEach(() => {
    global.Notification = originalNotification;
  });

  test('supported=true y permission refleja Notification.permission', async () => {
    global.Notification.permission = 'default';
    const { result } = renderHook(() => usePushNotifications());
    await waitFor(() => expect(result.current.supported).toBe(true));
    expect(result.current.permission).toBe('default');
  });

  test('subscribed refleja si ya existe suscripción en el navegador', async () => {
    pushClient.getExistingSubscription.mockResolvedValue({ endpoint: 'ep-1' });
    const { result } = renderHook(() => usePushNotifications());
    await waitFor(() => expect(result.current.subscribed).toBe(true));
  });

  test('no pide permiso automáticamente al montar (Req 13.7)', async () => {
    renderHook(() => usePushNotifications());
    await new Promise((r) => setTimeout(r, 0));
    expect(global.Notification.requestPermission).not.toHaveBeenCalled();
  });

  test('enable(): pide permiso y, si se concede, suscribe', async () => {
    global.Notification.requestPermission.mockResolvedValue('granted');
    pushClient.subscribe.mockResolvedValue({ endpoint: 'ep-1' });

    const { result } = renderHook(() => usePushNotifications());
    await waitFor(() => expect(result.current.supported).toBe(true));

    await act(async () => {
      await result.current.enable();
    });

    expect(global.Notification.requestPermission).toHaveBeenCalled();
    expect(pushClient.subscribe).toHaveBeenCalled();
    expect(result.current.subscribed).toBe(true);
    expect(result.current.permission).toBe('granted');
  });

  test('enable(): permiso denegado no suscribe', async () => {
    global.Notification.requestPermission.mockResolvedValue('denied');

    const { result } = renderHook(() => usePushNotifications());
    await waitFor(() => expect(result.current.supported).toBe(true));

    await act(async () => {
      await result.current.enable();
    });

    expect(pushClient.subscribe).not.toHaveBeenCalled();
    expect(result.current.subscribed).toBe(false);
  });

  test('disable(): desuscribe y actualiza el estado', async () => {
    pushClient.getExistingSubscription.mockResolvedValue({ endpoint: 'ep-1' });
    pushClient.unsubscribe.mockResolvedValue(undefined);

    const { result } = renderHook(() => usePushNotifications());
    await waitFor(() => expect(result.current.subscribed).toBe(true));

    await act(async () => {
      await result.current.disable();
    });

    expect(pushClient.unsubscribe).toHaveBeenCalled();
    expect(result.current.subscribed).toBe(false);
  });
});
