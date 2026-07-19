/**
 * Formateadores de moneda CLP compartidos (Epic 12).
 * Fuente única para el sistema de diseño y las páginas.
 */

/** $1.234.567 (sin decimales). */
export function formatCLP(amount) {
  if (amount === undefined || amount === null || Number.isNaN(Number(amount))) {
    return '$0';
  }
  return new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    maximumFractionDigits: 0,
  }).format(Number(amount));
}

/** $1,8M / $45K / $990 — abreviado para stat-cards. */
export function formatCLPShort(amount) {
  const n = Number(amount) || 0;
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  if (abs >= 1000000) return `${sign}$${(abs / 1000000).toFixed(1)}M`;
  if (abs >= 10000) return `${sign}$${Math.round(abs / 1000)}K`;
  return formatCLP(n);
}

/** 0.223 → "22%" (o "—" si es null/undefined). */
export function formatPct(ratio) {
  if (ratio === null || ratio === undefined || Number.isNaN(Number(ratio))) {
    return '—';
  }
  return `${Math.round(Number(ratio) * 100)}%`;
}
