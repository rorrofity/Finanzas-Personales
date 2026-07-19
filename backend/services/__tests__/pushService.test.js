/**
 * Epic 13 Fase 3 — Reqs 13.9, 13.11: envío de Web Push y poda de
 * suscripciones expiradas (404/410).
 */

jest.mock('web-push', () => ({
  setVapidDetails: jest.fn(),
  sendNotification: jest.fn(),
}));
jest.mock('../../models/PushSubscription', () => ({
  listByUser: jest.fn(),
  deleteByEndpoint: jest.fn(),
}));

const webpush = require('web-push');
const PushSubscription = require('../../models/PushSubscription');
const { sendToUser, notifySync } = require('../pushService');

const SUB = (endpoint) => ({
  endpoint,
  p256dh: 'p256dh-key',
  auth: 'auth-secret',
});

describe('pushService.sendToUser', () => {
  beforeEach(() => {
    webpush.sendNotification.mockReset();
    PushSubscription.listByUser.mockReset();
    PushSubscription.deleteByEndpoint.mockReset();
  });

  test('envía la notificación a TODAS las suscripciones del usuario', async () => {
    PushSubscription.listByUser.mockResolvedValue([SUB('ep-1'), SUB('ep-2')]);
    webpush.sendNotification.mockResolvedValue({});

    await sendToUser('user-1', { title: 'Hola', body: 'Mundo' });

    expect(webpush.sendNotification).toHaveBeenCalledTimes(2);
  });

  test('sin suscripciones, no falla y no llama a sendNotification', async () => {
    PushSubscription.listByUser.mockResolvedValue([]);

    await expect(sendToUser('user-1', { title: 'x' })).resolves.not.toThrow();
    expect(webpush.sendNotification).not.toHaveBeenCalled();
  });

  test('ante 404/410 (expirada) elimina la suscripción; otras siguen enviándose', async () => {
    PushSubscription.listByUser.mockResolvedValue([SUB('ep-expired'), SUB('ep-ok')]);
    webpush.sendNotification
      .mockRejectedValueOnce({ statusCode: 410 })
      .mockResolvedValueOnce({});

    await sendToUser('user-1', { title: 'x' });

    expect(PushSubscription.deleteByEndpoint).toHaveBeenCalledWith('ep-expired');
    expect(PushSubscription.deleteByEndpoint).not.toHaveBeenCalledWith('ep-ok');
  });

  test('un error no-410/404 en una suscripción no elimina la suscripción ni rompe el envío', async () => {
    PushSubscription.listByUser.mockResolvedValue([SUB('ep-1')]);
    webpush.sendNotification.mockRejectedValue({ statusCode: 500 });

    await expect(sendToUser('user-1', { title: 'x' })).resolves.not.toThrow();
    expect(PushSubscription.deleteByEndpoint).not.toHaveBeenCalled();
  });
});

describe('pushService.notifySync', () => {
  beforeEach(() => {
    webpush.sendNotification.mockReset();
    PushSubscription.listByUser.mockReset();
  });

  test('arma un mensaje con el conteo de transacciones importadas', async () => {
    PushSubscription.listByUser.mockResolvedValue([SUB('ep-1')]);
    webpush.sendNotification.mockResolvedValue({});

    await notifySync('user-1', 7);

    expect(webpush.sendNotification).toHaveBeenCalledTimes(1);
    const [, payload] = webpush.sendNotification.mock.calls[0];
    const body = JSON.parse(payload);
    expect(body.body).toMatch(/7/);
    expect(body.url).toMatch(/transactions/);
  });
});
