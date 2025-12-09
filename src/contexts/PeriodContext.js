import React, { createContext, useContext, useMemo, useState, useEffect } from 'react';

// America/Santiago helper: compute start/end ISO with -03:00 or -04:00 depending on DST
function getTZOffsetString(date, timeZone = 'America/Santiago') {
  try {
    const dtf = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
    const parts = dtf.formatToParts(date).reduce((acc, p) => { acc[p.type] = p.value; return acc; }, {});
    // Build a date in local tz string then compare to UTC to get offset
    const localISO = `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`;
    const localTime = new Date(localISO);
    const offsetMin = Math.round((localTime.getTime() - date.getTime()) / 60000);
    const sign = offsetMin <= 0 ? '-' : '+'; // note: Date math sign quirks; adjust to get conventional offset
    const abs = Math.abs(offsetMin);
    const hh = String(Math.floor(abs / 60)).padStart(2, '0');
    const mm = String(abs % 60).padStart(2, '0');
    return `${sign}${hh}:${mm}`;
  } catch (e) {
    // Fallback to -03:00 (most common)
    return '-03:00';
  }
}

function computePeriodFromString(periodStr) {
  // Expects YYYY-MM
  const [y, m] = (periodStr || '').split('-').map(Number);
  if (!y || !m) return null;
  return { year: y, month: m };
}

function formatPeriodLabel(year, month, locale = 'es-CL') {
  // Usar fecha local para evitar que el desfase horario muestre el mes anterior
  const d = new Date(year, month - 1, 1);
  return d.toLocaleDateString(locale, { month: 'long', year: 'numeric' });
}

function getMonthStartEndISO(year, month) {
  // Month start (local TZ): first day 00:00:00.000
  // Month end (local TZ): last day 23:59:59.999
  const firstLocal = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
  const nextMonthLocal = new Date(Date.UTC(year, month, 1, 0, 0, 0));
  const lastLocal = new Date(nextMonthLocal.getTime() - 1); // 23:59:59.999 of last day
  const offsetStart = getTZOffsetString(firstLocal);
  const offsetEnd = getTZOffsetString(lastLocal);
  const startISO = `${year}-${String(month).padStart(2, '0')}-01T00:00:00.000${offsetStart}`;
  // Compute last day number
  const lastDay = new Date(year, month, 0).getDate();
  const endISO = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}T23:59:59.999${offsetEnd}`;
  return { startISO, endISO };
}

const PeriodContext = createContext(null);

export function PeriodProvider({ children }) {
  // Resolve initial from URL (?period=YYYY-MM) then sessionStorage, else current month in America/Santiago
  const urlParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
  const urlPeriod = urlParams?.get('period');
  const sessionPeriod = typeof window !== 'undefined' ? sessionStorage.getItem('period') : null;

  const initial = useMemo(() => {
    const fromUrl = computePeriodFromString(urlPeriod);
    if (fromUrl) return fromUrl;
    const fromSession = computePeriodFromString(sessionPeriod);
    if (fromSession) return fromSession;
    // Default to NEXT month in America/Santiago (billing cycle)
    const now = new Date();
    // Derive Santiago date parts using locale/timeZone
    const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago', year: 'numeric', month: '2-digit' });
    const parts = fmt.formatToParts(now).reduce((acc, p) => { acc[p.type] = p.value; return acc; }, {});
    const currentYear = Number(parts.year);
    const currentMonth = Number(parts.month);
    // Calculate next month (handle December -> January of next year)
    const nextMonth = currentMonth === 12 ? 1 : currentMonth + 1;
    const nextYear = currentMonth === 12 ? currentYear + 1 : currentYear;
    return { year: nextYear, month: nextMonth };
  }, [urlPeriod, sessionPeriod]);

  const [year, setYear] = useState(initial.year);
  const [month, setMonth] = useState(initial.month);

  useEffect(() => {
    // Persist in sessionStorage
    const periodStr = `${year}-${String(month).padStart(2, '0')}`;
    sessionStorage.setItem('period', periodStr);
  }, [year, month]);

  const value = useMemo(() => {
    const { startISO, endISO } = getMonthStartEndISO(year, month);
    const label = formatPeriodLabel(year, month);
    return {
      year,
      month,
      label,
      startISO,
      endISO,
      setYear,
      setMonth,
      setPeriod: (y, m) => { setYear(y); setMonth(m); }
    };
  }, [year, month]);

  return (
    <PeriodContext.Provider value={value}>{children}</PeriodContext.Provider>
  );
}

export function usePeriod() {
  const ctx = useContext(PeriodContext);
  if (!ctx) throw new Error('usePeriod must be used within a PeriodProvider');
  return ctx;
}
