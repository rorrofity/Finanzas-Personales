import React from 'react';
import { render, screen, act, waitFor } from '@testing-library/react';
import axios from '../../config/axios';
import { SpaceProvider, useSpace, SPACE_FORBIDDEN_EVENT } from '../SpaceContext';

/**
 * Fase 3 — Req 11.13 (selector de espacio persistente) y caso de borde
 * de revocación en vivo (403 → volver al espacio propio).
 */

jest.mock('../../config/axios', () => ({
  get: jest.fn(),
  post: jest.fn(),
  put: jest.fn(),
  delete: jest.fn(),
}));

jest.mock('../AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'u-owner-1', nombre: 'Rodrigo', email: 'r@test.local' },
    isAuthenticated: true,
  }),
}));

const MEMBERSHIPS = {
  spaces: [
    { ownerId: 'u-owner-1', ownerName: 'Rodrigo', isOwner: true, canEdit: true, canDelete: true },
    { ownerId: 'u-owner-2', ownerName: 'Pareja', isOwner: false, canEdit: true, canDelete: false },
  ],
};

const Probe = () => {
  const { spaces, activeSpace, switchSpace } = useSpace();
  return (
    <div>
      <div data-testid="count">{spaces.length}</div>
      <div data-testid="active">{activeSpace?.ownerId}</div>
      <div data-testid="canDelete">{String(activeSpace?.canDelete)}</div>
      <button onClick={() => switchSpace('u-owner-2')}>go-shared</button>
    </div>
  );
};

const renderProbe = () =>
  render(
    <SpaceProvider>
      <Probe />
    </SpaceProvider>
  );

describe('SpaceContext (Req 11.13)', () => {
  beforeEach(() => {
    localStorage.clear();
    axios.get.mockReset();
    axios.get.mockImplementation((url) => {
      if (url.includes('/api/space/memberships')) {
        return Promise.resolve({ data: MEMBERSHIPS });
      }
      if (url.includes('/api/space/members')) {
        return Promise.resolve({ data: { members: [] } });
      }
      return Promise.resolve({ data: {} });
    });
  });

  test('carga memberships y parte en el espacio propio', async () => {
    renderProbe();
    await waitFor(() => expect(screen.getByTestId('count')).toHaveTextContent('2'));
    expect(screen.getByTestId('active')).toHaveTextContent('u-owner-1');
    expect(screen.getByTestId('canDelete')).toHaveTextContent('true');
  });

  test('switchSpace cambia el espacio activo, sus permisos y persiste la selección', async () => {
    renderProbe();
    await waitFor(() => expect(screen.getByTestId('count')).toHaveTextContent('2'));

    act(() => {
      screen.getByText('go-shared').click();
    });

    await waitFor(() =>
      expect(screen.getByTestId('active')).toHaveTextContent('u-owner-2')
    );
    expect(screen.getByTestId('canDelete')).toHaveTextContent('false');
    expect(localStorage.getItem('activeSpaceOwner::u-owner-1')).toBe('u-owner-2');
  });

  test('restaura la selección persistida al montar', async () => {
    localStorage.setItem('activeSpaceOwner::u-owner-1', 'u-owner-2');
    renderProbe();
    await waitFor(() =>
      expect(screen.getByTestId('active')).toHaveTextContent('u-owner-2')
    );
  });

  test('evento de 403 de espacio vuelve al espacio propio', async () => {
    localStorage.setItem('activeSpaceOwner::u-owner-1', 'u-owner-2');
    renderProbe();
    await waitFor(() =>
      expect(screen.getByTestId('active')).toHaveTextContent('u-owner-2')
    );

    act(() => {
      window.dispatchEvent(new CustomEvent(SPACE_FORBIDDEN_EVENT));
    });

    await waitFor(() =>
      expect(screen.getByTestId('active')).toHaveTextContent('u-owner-1')
    );
    expect(localStorage.getItem('activeSpaceOwner::u-owner-1')).toBe('u-owner-1');
  });

  test('si memberships falla, opera solo con el espacio propio', async () => {
    axios.get.mockRejectedValue(new Error('network'));
    renderProbe();
    await waitFor(() => expect(screen.getByTestId('count')).toHaveTextContent('1'));
    expect(screen.getByTestId('active')).toHaveTextContent('u-owner-1');
  });
});
