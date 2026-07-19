import React from 'react';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Login from '../Login';

/**
 * Fix producción: Google One Tap muestra en móvil un prompt con scrim
 * oscuro sobre toda la pantalla al entrar a /login ("pantalla
 * ensombrecida" que requiere dos toques para descartar).
 *
 * El login con Google debe funcionar SOLO con el botón explícito,
 * sin One Tap (useOneTap).
 */

let capturedProps = null;
jest.mock('@react-oauth/google', () => ({
  GoogleLogin: (props) => {
    capturedProps = props;
    return <div data-testid="google-login-btn" />;
  },
  GoogleOAuthProvider: ({ children }) => children,
}));

jest.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({
    login: jest.fn(),
    loginWithGoogle: jest.fn(),
    error: null,
    clearError: jest.fn(),
    isAuthenticated: false,
  }),
}));

describe('Login sin Google One Tap (fix scrim móvil)', () => {
  test('GoogleLogin NO recibe useOneTap', () => {
    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>
    );
    expect(capturedProps).not.toBeNull();
    expect(capturedProps.useOneTap).toBeFalsy();
  });
});
