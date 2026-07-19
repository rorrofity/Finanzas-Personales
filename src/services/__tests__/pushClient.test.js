import axios from '../../config/axios';
import { urlBase64ToUint8Array, subscribe, unsubscribe, getExistingSubscription } from '../pushClient';

/**
 * Epic 13 Fase 4 — Req 13.8: cliente Web Push del navegador.
 */

jest.mock('../../config/axios', () => ({
  get: jest.fn(),
  post: jest.fn(),
}));

describe('urlBase64ToUint8Array', () => {
  test('convierte una clave VAPID base64url a Uint8Array', () => {
    // "AAA-_w" en base64url → bytes [0,0,0,254,255] (relleno con '=')
    const result = urlBase64ToUint8Array('AAA-_w');
    expect(result).toBeInstanceOf(Uint8Array);
    expect(result.length).toBeGreaterThan(0);
  });
});

describe('pushClient.subscribe', () => {
  let pushManager;
  let registration;

  beforeEach(() => {
    axios.get.mockReset();
    axios.post.mockReset();
    pushManager = {
      subscribe: jest.fn().mockResolvedValue({
        toJSON: () => ({
          endpoint: 'https://push.example/ep-1',
          keys: { p256dh: 'p256dh-val', auth: 'auth-val' },
        }),
      }),
    };
    registration = { pushManager };

    global.navigator.serviceWorker = {
      ready: Promise.resolve(registration),
    };
  });

  test('pide la VAPID pública al backend y suscribe con ella', async () => {
    axios.get.mockResolvedValue({ data: { publicKey: 'AAA-_w' } });
    axios.post.mockResolvedValue({ data: { ok: true } });

    await subscribe();

    expect(axios.get).toHaveBeenCalledWith('/api/push/vapid-public-key');
    expect(pushManager.subscribe).toHaveBeenCalledWith(
      expect.objectContaining({ userVisibleOnly: true, applicationServerKey: expect.any(Uint8Array) })
    );
  });

  test('postea la suscripción resultante al backend', async () => {
    axios.get.mockResolvedValue({ data: { publicKey: 'AAA-_w' } });
    axios.post.mockResolvedValue({ data: { ok: true } });

    await subscribe();

    expect(axios.post).toHaveBeenCalledWith('/api/push/subscribe', {
      endpoint: 'https://push.example/ep-1',
      keys: { p256dh: 'p256dh-val', auth: 'auth-val' },
    });
  });
});

describe('pushClient.unsubscribe', () => {
  test('desuscribe del navegador y avisa al backend', async () => {
    const browserSub = {
      endpoint: 'https://push.example/ep-1',
      unsubscribe: jest.fn().mockResolvedValue(true),
    };
    global.navigator.serviceWorker = {
      ready: Promise.resolve({ pushManager: { getSubscription: () => Promise.resolve(browserSub) } }),
    };
    axios.post.mockResolvedValue({ data: { ok: true } });

    await unsubscribe();

    expect(browserSub.unsubscribe).toHaveBeenCalled();
    expect(axios.post).toHaveBeenCalledWith('/api/push/unsubscribe', { endpoint: browserSub.endpoint });
  });

  test('sin suscripción previa, no falla', async () => {
    global.navigator.serviceWorker = {
      ready: Promise.resolve({ pushManager: { getSubscription: () => Promise.resolve(null) } }),
    };
    await expect(unsubscribe()).resolves.not.toThrow();
  });
});

describe('getExistingSubscription', () => {
  test('retorna la suscripción actual del navegador (o null)', async () => {
    global.navigator.serviceWorker = {
      ready: Promise.resolve({ pushManager: { getSubscription: () => Promise.resolve(null) } }),
    };
    await expect(getExistingSubscription()).resolves.toBeNull();
  });
});
