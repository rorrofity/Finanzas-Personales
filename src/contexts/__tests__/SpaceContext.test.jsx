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

jest.mock('../AuthContext', () => {
  const user = { id: 'u-owner-1', nombre: 'Rodrigo', email: 'r@test.local' };
  return { useAuth: () => ({ user, isAuthenticated: true }) };
});

const MEMBERSHIPS = {
  spaces: [
    { ownerId: 'u-owner-1', ownerName: 'Rodrigo', isOwner: true, canEdit: true, canDelete: true },
    { ownerId: 'u-owner-2', ownerName: 'Pareja', isOwner: false, canEdit: true, canDelete: false },
  ],
};

const Probe = () => {
  const { spaces, activeSpace, switchSpace, refreshMemberships } = useSpace();
  return (
    <div>
      <div data-testid="count">{spaces.length}</div>
      <div data-testid="active">{activeSpace?.ownerId}</div>
      <div data-testid="canDelete">{String(activeSpace?.canDelete)}</div>
      <button onClick={() => switchSpace('u-owner-2')}>go-shared</button>
      <button onClick={() => refreshMemberships('u-new-shared')}>accept-new-shared</button>
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

test('aceptación carga y activa un hogar que no estaba en el cierre anterior',async()=>{axios.get.mockImplementation(path=>Promise.resolve({data:path.includes('memberships')?{spaces:[MEMBERSHIPS.spaces[0]]}:{members:[]}}));renderProbe();await waitFor(()=>expect(screen.getByTestId('count')).toHaveTextContent('1'));axios.get.mockImplementation(path=>Promise.resolve({data:path.includes('memberships')?{spaces:[MEMBERSHIPS.spaces[0],{ownerId:'u-new-shared',ownerName:'Nuevo hogar',isOwner:false,canEdit:false,canDelete:false}]}:{members:[]}}));act(()=>screen.getByText('accept-new-shared').click());await waitFor(()=>expect(screen.getByTestId('active')).toHaveTextContent('u-new-shared'));expect(screen.getByTestId('canDelete')).toHaveTextContent('false');expect(localStorage.getItem('activeSpaceOwner::u-owner-1')).toBe('u-new-shared');});

test('una carga inicial tardía no deshace la selección de una invitación recién aceptada',async()=>{localStorage.clear();let finishInitial;const initial=new Promise(resolve=>{finishInitial=resolve});const newSpaces={spaces:[MEMBERSHIPS.spaces[0],{ownerId:'u-new-shared',ownerName:'Nuevo hogar',isOwner:false,canEdit:false,canDelete:false}]};axios.get.mockReset();axios.get.mockReturnValueOnce(initial).mockImplementation(path=>Promise.resolve({data:path.includes('memberships')?newSpaces:{members:[]}}));renderProbe();act(()=>screen.getByText('accept-new-shared').click());await waitFor(()=>expect(screen.getByTestId('active')).toHaveTextContent('u-new-shared'));await act(async()=>finishInitial({data:{spaces:[MEMBERSHIPS.spaces[0]]}}));expect(screen.getByTestId('active')).toHaveTextContent('u-new-shared');expect(screen.getByTestId('count')).toHaveTextContent('2');});
