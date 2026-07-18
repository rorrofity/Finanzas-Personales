import React from 'react';
import { render, screen, act, fireEvent, waitFor } from '@testing-library/react';
import InstallPrompt, { INSTALL_DISMISSED_KEY } from '../InstallPrompt';

/**
 * Fase 4 — Req 9.2: prompt de instalación PWA contextual.
 *
 * InstallPrompt debe:
 *  - interceptar beforeinstallprompt (preventDefault) y mostrar UI propia
 *  - al pulsar "Instalar": invocar prompt() del evento nativo
 *  - al descartar: persistir la decisión y no volver a mostrar
 */
describe('InstallPrompt (Req 9.2)', () => {
  const makeBeforeInstallPromptEvent = () => {
    const event = new Event('beforeinstallprompt', { cancelable: true });
    event.prompt = jest.fn().mockResolvedValue(undefined);
    event.userChoice = Promise.resolve({ outcome: 'accepted' });
    return event;
  };

  afterEach(() => {
    localStorage.clear();
  });

  test('no muestra nada sin evento beforeinstallprompt', () => {
    render(<InstallPrompt />);
    expect(
      screen.queryByRole('button', { name: /instalar/i })
    ).not.toBeInTheDocument();
  });

  test('muestra la invitación al recibir beforeinstallprompt', () => {
    render(<InstallPrompt />);

    const event = makeBeforeInstallPromptEvent();
    act(() => {
      window.dispatchEvent(event);
    });

    expect(event.defaultPrevented).toBe(true);
    expect(screen.getByText(/instala finanzas/i)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /instalar/i })
    ).toBeInTheDocument();
  });

  test('pulsar "Instalar" dispara el prompt nativo', async () => {
    render(<InstallPrompt />);

    const event = makeBeforeInstallPromptEvent();
    act(() => {
      window.dispatchEvent(event);
    });

    fireEvent.click(screen.getByRole('button', { name: /instalar/i }));

    await waitFor(() => expect(event.prompt).toHaveBeenCalled());
  });

  test('descartar persiste la decisión y no vuelve a mostrar', async () => {
    const { unmount } = render(<InstallPrompt />);

    act(() => {
      window.dispatchEvent(makeBeforeInstallPromptEvent());
    });

    fireEvent.click(screen.getByRole('button', { name: /ahora no/i }));

    expect(localStorage.getItem(INSTALL_DISMISSED_KEY)).toBeTruthy();
    // El Snackbar se desmonta tras su transición de salida.
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: /instalar/i })
      ).not.toBeInTheDocument()
    );

    // Nuevo montaje (nueva sesión): el evento no debe volver a mostrar la UI.
    unmount();
    render(<InstallPrompt />);
    act(() => {
      window.dispatchEvent(makeBeforeInstallPromptEvent());
    });
    expect(
      screen.queryByRole('button', { name: /instalar/i })
    ).not.toBeInTheDocument();
  });
});
