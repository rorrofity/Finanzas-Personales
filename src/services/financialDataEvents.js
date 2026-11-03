export const FINANCIAL_DATA_CHANGED_EVENT = 'financialDataChanged';
export const FINANCIAL_DATA_STORAGE_KEY = 'finanzas-financial-data-change';
export const FINANCIAL_DATA_MESSAGE_TYPE = 'FINANCIAL_DATA_CHANGED';
let sequence = 0;

/** An invalidation signal only: never put account, transaction or token data here. */
export function notifyFinancialDataChanged() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(FINANCIAL_DATA_CHANGED_EVENT));
  try { window.localStorage.setItem(FINANCIAL_DATA_STORAGE_KEY, `${Date.now()}:${++sequence}`); }
  catch (_) { /* Current-window refresh remains available if storage is blocked. */ }
}

export function subscribeFinancialDataChanges(callback) {
  const storage = event => { if (event.key === FINANCIAL_DATA_STORAGE_KEY) callback(); };
  const message = event => { if (event.data?.type === FINANCIAL_DATA_MESSAGE_TYPE) callback(); };
  window.addEventListener(FINANCIAL_DATA_CHANGED_EVENT, callback);
  window.addEventListener('storage', storage);
  navigator.serviceWorker?.addEventListener?.('message', message);
  return () => {
    window.removeEventListener(FINANCIAL_DATA_CHANGED_EVENT, callback);
    window.removeEventListener('storage', storage);
    navigator.serviceWorker?.removeEventListener?.('message', message);
  };
}
