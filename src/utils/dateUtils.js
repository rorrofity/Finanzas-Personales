/**
 * Formatea una fecha string (YYYY-MM-DD) a formato local sin problemas de timezone.
 * 
 * Problema: new Date("2026-01-26") interpreta como UTC medianoche.
 * En Chile (UTC-3), esto se convierte a 21:00 del día anterior.
 * 
 * Solución: Parsear la fecha manualmente sin conversión UTC.
 * 
 * @param {string} fechaStr - Fecha en formato "YYYY-MM-DD" o "YYYY-MM-DDTHH:mm:ss"
 * @param {string} locale - Locale para formateo (default: 'es-CL')
 * @returns {string} - Fecha formateada en formato local (ej: "26/1/2026")
 */
export function formatDateLocal(fechaStr, locale = 'es-CL') {
  if (!fechaStr) return '';
  
  // Extraer solo la parte de fecha (YYYY-MM-DD)
  const dateOnly = fechaStr.split('T')[0];
  const [year, month, day] = dateOnly.split('-').map(Number);
  
  // Crear fecha usando componentes locales (no UTC)
  const date = new Date(year, month - 1, day);
  
  return date.toLocaleDateString(locale);
}

/**
 * Parsea una fecha string a Date object sin problemas de timezone.
 * Útil cuando necesitas el objeto Date para comparaciones o cálculos.
 * 
 * @param {string} fechaStr - Fecha en formato "YYYY-MM-DD"
 * @returns {Date} - Objeto Date en hora local
 */
export function parseDateLocal(fechaStr) {
  if (!fechaStr) return null;
  
  const dateOnly = fechaStr.split('T')[0];
  const [year, month, day] = dateOnly.split('-').map(Number);
  
  return new Date(year, month - 1, day);
}
