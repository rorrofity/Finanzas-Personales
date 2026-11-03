import { useEffect, useRef } from 'react';
import { subscribeFinancialDataChanges } from '../services/financialDataEvents';

/** Refresh already saved data; never schedules imports, requests bank access or writes. */
export default function useFinancialAutoRefresh(refresh, { enabled = true, intervalMs = 300000 } = {}) {
  const callback = useRef(refresh); callback.current = refresh;
  useEffect(() => {
    if (!enabled) return undefined;
    let pending;
    const canRefresh = () => document.visibilityState !== 'hidden' && navigator.onLine !== false;
    const request = () => {
      if (!canRefresh()) return;
      window.clearTimeout(pending);
      pending = window.setTimeout(() => { if (canRefresh()) callback.current(); }, 250);
    };
    const poll = window.setInterval(() => { if (canRefresh()) callback.current(); }, intervalMs);
    window.addEventListener('focus', request);
    window.addEventListener('online', request);
    document.addEventListener('visibilitychange', request);
    const unsubscribe = subscribeFinancialDataChanges(request);
    return () => {
      window.clearTimeout(pending); window.clearInterval(poll);
      window.removeEventListener('focus', request); window.removeEventListener('online', request);
      document.removeEventListener('visibilitychange', request); unsubscribe();
    };
  }, [enabled, intervalMs]);
}
