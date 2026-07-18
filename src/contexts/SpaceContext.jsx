import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { Alert, Snackbar } from '@mui/material';
import axios from '../config/axios';
import { useAuth } from './AuthContext';
import {
  setActiveSpaceOwner,
  SPACE_CHANGED_EVENT,
  SPACE_FORBIDDEN_EVENT,
} from '../services/activeSpace';

export { SPACE_FORBIDDEN_EVENT } from '../services/activeSpace';

/**
 * Contexto del espacio activo (Epic 11, Req 11.13).
 *
 * - Carga los espacios accesibles (propio + compartidos con membresía activa)
 * - Persiste la selección por usuario en localStorage
 * - Ante revocación en vivo (403 SPACE_FORBIDDEN) vuelve al espacio propio
 */

const SpaceContext = createContext(null);

const storageKey = (userId) => `activeSpaceOwner::${userId}`;

const DEFAULT_SPACE = { ownerId: null, ownerName: '', isOwner: true, canEdit: true, canDelete: true };

export const useSpace = () => {
  const ctx = useContext(SpaceContext);
  if (!ctx) {
    // Fuera del provider (tests aislados): comportamiento de espacio propio
    return {
      spaces: [],
      activeSpace: DEFAULT_SPACE,
      switchSpace: () => {},
      hasMembers: false,
      refreshMemberships: () => {},
    };
  }
  return ctx;
};

export const SpaceProvider = ({ children }) => {
  const { user } = useAuth();
  const [spaces, setSpaces] = useState([]);
  const [activeSpace, setActiveSpace] = useState(null);
  const [hasMembers, setHasMembers] = useState(false);
  const [forbiddenNotice, setForbiddenNotice] = useState(false);

  const ownSpaceOf = useCallback(
    (u) => ({
      ownerId: u.id,
      ownerName: u.nombre || 'Mi espacio',
      isOwner: true,
      canEdit: true,
      canDelete: true,
    }),
    []
  );

  const applyActive = useCallback((space) => {
    setActiveSpace(space);
    setActiveSpaceOwner(space.isOwner ? null : space.ownerId);
    window.dispatchEvent(
      new CustomEvent(SPACE_CHANGED_EVENT, { detail: { ownerId: space.ownerId } })
    );
  }, []);

  const refreshMemberships = useCallback(async () => {
    if (!user?.id) return;

    let loaded = [ownSpaceOf(user)];
    try {
      const { data } = await axios.get('/api/space/memberships');
      if (Array.isArray(data?.spaces) && data.spaces.length > 0) {
        loaded = data.spaces;
      }
    } catch (e) {
      // Sin backend de espacios disponible: operar solo con el propio
    }
    setSpaces(loaded);

    try {
      const { data } = await axios.get('/api/space/members');
      setHasMembers((data?.members || []).some((m) => m.status === 'linked' && m.isActive));
    } catch (e) {
      setHasMembers(false);
    }

    // Restaurar selección persistida si sigue siendo válida
    const persisted = localStorage.getItem(storageKey(user.id));
    const target =
      loaded.find((s) => s.ownerId === persisted) ||
      loaded.find((s) => s.isOwner) ||
      loaded[0];
    return target;
  }, [user, ownSpaceOf]);

  // Carga inicial al autenticar
  useEffect(() => {
    if (!user?.id) {
      setSpaces([]);
      setActiveSpace(null);
      setActiveSpaceOwner(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const target = await refreshMemberships();
      if (!cancelled && target) applyActive(target);
    })();
    return () => {
      cancelled = true;
    };
  }, [user, refreshMemberships, applyActive]);

  const switchSpace = useCallback(
    (ownerId) => {
      const target = spaces.find((s) => s.ownerId === ownerId);
      if (!target || !user?.id) return;
      localStorage.setItem(storageKey(user.id), ownerId);
      applyActive(target);
    },
    [spaces, user, applyActive]
  );

  // Revocación en vivo (Req borde): volver al espacio propio con aviso
  useEffect(() => {
    if (!user?.id) return undefined;
    const onForbidden = () => {
      const own = ownSpaceOf(user);
      localStorage.setItem(storageKey(user.id), own.ownerId);
      applyActive(own);
      setForbiddenNotice(true);
      refreshMemberships();
    };
    window.addEventListener(SPACE_FORBIDDEN_EVENT, onForbidden);
    return () => window.removeEventListener(SPACE_FORBIDDEN_EVENT, onForbidden);
  }, [user, ownSpaceOf, applyActive, refreshMemberships]);

  const value = useMemo(
    () => ({
      spaces,
      activeSpace: activeSpace || (user ? ownSpaceOf(user) : DEFAULT_SPACE),
      switchSpace,
      hasMembers,
      refreshMemberships,
    }),
    [spaces, activeSpace, user, ownSpaceOf, switchSpace, hasMembers, refreshMemberships]
  );

  return (
    <SpaceContext.Provider value={value}>
      {children}
      <Snackbar
        open={forbiddenNotice}
        autoHideDuration={6000}
        onClose={() => setForbiddenNotice(false)}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      >
        <Alert severity="warning" onClose={() => setForbiddenNotice(false)}>
          Perdiste acceso al espacio compartido. Volviste a tu espacio.
        </Alert>
      </Snackbar>
    </SpaceContext.Provider>
  );
};

export default SpaceContext;
