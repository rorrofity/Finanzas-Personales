import React from 'react';
import { render, screen, act, fireEvent } from '@testing-library/react';
import UpdateBanner, { SW_UPDATED_EVENT } from '../UpdateBanner';

/**
 * Fase 4 — Req 9.6: actualización del Service Worker.
 *
 * UpdateBanner debe:
 *  - no renderizar nada mientras no haya un SW en estado waiting
 *  - mostrar el banner "Nueva versión disponible" al recibir el evento
 *    SW_UPDATED_EVENT (disparado por serviceWorkerRegistration.onUpdate)
 *  - al pulsar "Actualizar": enviar SKIP_WAITING al worker waiting y
 *    recargar la página cuando el nuevo SW tome control (controllerchange)
 */
describe('UpdateBanner (Req 9.6)', () => {
  const originalLocation = window.location;
  let reloadMock;

  beforeEach(() => {
    reloadMock = jest.fn();
    delete window.location;
    window.location = { ...originalLocation, reload: reloadMock };
  });

  afterEach(() => {
    window.location = originalLocation;
    delete navigator.serviceWorker;
  });

  const dispatchSwUpdated = (registration) => {
    act(() => {
      window.dispatchEvent(
        new CustomEvent(SW_UPDATED_EVENT, { detail: registration })
      );
    });
  };

  test('no muestra nada sin actualización pendiente', () => {
    render(<UpdateBanner />);
    expect(screen.queryByText(/nueva versión/i)).not.toBeInTheDocument();
  });

  test('muestra el banner al detectar un SW waiting', () => {
    render(<UpdateBanner />);

    dispatchSwUpdated({ waiting: { postMessage: jest.fn() } });

    expect(screen.getByText(/nueva versión disponible/i)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /actualizar/i })
    ).toBeInTheDocument();
  });

  test('pulsar "Actualizar" envía SKIP_WAITING y recarga al cambiar de controller', () => {
    const postMessage = jest.fn();
    let controllerChangeListener;
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: {
        addEventListener: (event, cb) => {
          if (event === 'controllerchange') controllerChangeListener = cb;
        },
        removeEventListener: jest.fn(),
      },
    });

    render(<UpdateBanner />);
    dispatchSwUpdated({ waiting: { postMessage } });

    fireEvent.click(screen.getByRole('button', { name: /actualizar/i }));

    expect(postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });

    // El nuevo SW toma control → la app debe recargarse.
    act(() => {
      controllerChangeListener();
    });
    expect(reloadMock).toHaveBeenCalled();
  });

  test('si el registro no tiene waiting, no muestra banner', () => {
    render(<UpdateBanner />);
    dispatchSwUpdated({ waiting: null });
    expect(screen.queryByText(/nueva versión/i)).not.toBeInTheDocument();
  });
});
