import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { ThemeProvider } from '@mui/material/styles';
import { createAppTheme } from '../theme';

export const APPEARANCE_STORAGE_KEY = 'finanzas-appearance';
const SYSTEM_QUERY = '(prefers-color-scheme: dark)';
const choices = ['light', 'dark', 'system'];
const normalize = (value) => choices.includes(value) ? value : 'system';
const readPreference = () => {
  try { return normalize(window.localStorage.getItem(APPEARANCE_STORAGE_KEY)); }
  catch { return 'system'; }
};
const AppearanceContext = createContext({ preference: 'system', resolvedMode: 'light', setPreference: () => {} });

export function AppearanceProvider({ children }) {
  const [preference, setPreferenceState] = useState(readPreference);
  const media = useMemo(() => {
    try { return typeof window.matchMedia === 'function' ? window.matchMedia(SYSTEM_QUERY) : null; }
    catch { return null; }
  }, []);
  const [systemDark, setSystemDark] = useState(() => Boolean(media?.matches));
  const resolvedMode = preference === 'system' ? (systemDark ? 'dark' : 'light') : preference;
  const theme = useMemo(() => createAppTheme(resolvedMode), [resolvedMode]);

  useEffect(() => {
    if (!media) return undefined;
    const update = (event) => setSystemDark(Boolean(event.matches));
    setSystemDark(Boolean(media.matches));
    if (typeof media.addEventListener === 'function') media.addEventListener('change', update);
    else media.addListener?.(update);
    return () => {
      if (typeof media.removeEventListener === 'function') media.removeEventListener('change', update);
      else media.removeListener?.(update);
    };
  }, [media]);

  useEffect(() => {
    const update = (event) => {
      if (event.storageArea) {
        try { if (event.storageArea !== window.localStorage) return; }
        catch { return; }
      }
      if (event.key === APPEARANCE_STORAGE_KEY) setPreferenceState(normalize(event.newValue));
      else if (event.key === null) setPreferenceState(readPreference());
    };
    window.addEventListener('storage', update);
    return () => window.removeEventListener('storage', update);
  }, []);

  const setPreference = useCallback((value) => {
    const next = normalize(value);
    setPreferenceState(next);
    try { window.localStorage.setItem(APPEARANCE_STORAGE_KEY, next); }
    catch { /* Preference still works in memory when storage is unavailable. */ }
  }, []);

  useEffect(() => {
    document.documentElement.style.colorScheme = resolvedMode;
    document.documentElement.dataset.appearance = resolvedMode;
    document.documentElement.dataset.appearancePreference = preference;
    let meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'theme-color';
      document.head.appendChild(meta);
    }
    meta.content = theme.palette.background.default;
  }, [preference, resolvedMode, theme]);

  const value = useMemo(() => ({ preference, resolvedMode, setPreference }), [preference, resolvedMode, setPreference]);
  return <AppearanceContext.Provider value={value}><ThemeProvider theme={theme}>{children}</ThemeProvider></AppearanceContext.Provider>;
}

export const useAppearance = () => useContext(AppearanceContext);
