import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import useOffline from '../hooks/useOffline';
import { getStorageEstimate } from '../services/readCache';

const OfflineContext = createContext(null);

export const OfflineProvider = ({ children }) => {
  const { isOnline, isOffline } = useOffline();
  const prevOnlineRef = useRef(isOnline);
  const [reconnectCount, setReconnectCount] = useState(0);
  const [storageWarning, setStorageWarning] = useState(false);

  useEffect(() => {
    if (prevOnlineRef.current === false && isOnline) {
      setReconnectCount((count) => count + 1);
    }
    prevOnlineRef.current = isOnline;
  }, [isOnline]);

  useEffect(() => {
    let mounted = true;

    const checkStorage = async () => {
      const estimate = await getStorageEstimate();
      if (!mounted || !estimate) return;
      setStorageWarning(estimate.ratio >= 0.8);
    };

    checkStorage();
    if (isOnline) {
      checkStorage();
    }

    return () => {
      mounted = false;
    };
  }, [isOnline, reconnectCount]);

  const value = useMemo(
    () => ({
      isOnline,
      isOffline,
      reconnectCount,
      storageWarning,
    }),
    [isOnline, isOffline, reconnectCount, storageWarning]
  );

  return <OfflineContext.Provider value={value}>{children}</OfflineContext.Provider>;
};

export const useOfflineContext = () => {
  const context = useContext(OfflineContext);
  if (!context) {
    throw new Error('useOfflineContext must be used within an OfflineProvider');
  }
  return context;
};

export default OfflineContext;
