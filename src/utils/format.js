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

/**
 * Resolución hasta el mil, para stat-cards: 2.543.678 → "$2.544K",
 * 47.997 → "$48K", 950 → "$950". Muestra el valor en miles con separadores
 * es-CL y sufijo K (más informativo que M/K de un decimal).
 */
export function formatCLPThousands(amount) {
  const n = Number(amount) || 0;
  const abs = Math.abs(n);
  if (abs < 1000) return formatCLP(n);
  const sign = n < 0 ? '-' : '';
  const thousands = Math.round(abs / 1000);
  return `${sign}$${new Intl.NumberFormat('es-CL').format(thousands)}K`;
}

/** 0.223 → "22%" (o "—" si es null/undefined). */
export function formatPct(ratio) {
  if (ratio === null || ratio === undefined || Number.isNaN(Number(ratio))) {
    return '—';
  }
  return `${Math.round(Number(ratio) * 100)}%`;
}
