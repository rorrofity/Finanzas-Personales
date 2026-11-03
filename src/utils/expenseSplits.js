// Keep validation and distribution in integer centavos, including CLP amounts
// persisted with decimal places. Do not round the bank's original amount.
export function parseClpMinor(value) {
  if ((typeof value !== 'number' && typeof value !== 'string') || !/^-?\d+(?:\.\d{1,2})?$/.test(String(value))) return null;
  const [integer, fraction = ''] = String(value).replace(/^-/, '').split('.');
  const minor = Number(integer) * 100 + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(minor)) return null;
  return String(value).startsWith('-') ? -minor : minor;
}

export function minorToClp(value) {
  if (!Number.isSafeInteger(value)) throw new Error('Monto fuera de precisión');
  return `${value < 0 ? '-' : ''}${Math.floor(Math.abs(value) / 100)}.${String(Math.abs(value) % 100).padStart(2, '0')}`;
}

export const hasExpenseSplit = row => Array.isArray(row?.split?.parts) && row.split.parts.length >= 2;
const noCategory = value => value === null || value === undefined || value === '';
export function matchesExpenseCategory(row, category) {
  if (!category || category === 'todas') return true;
  const parts = hasExpenseSplit(row) ? row.split.parts : [row];
  return parts.some(part => category === 'uncategorized' ? noCategory(part.category_id) : String(part.category_id) === String(category));
}

export function expenseParentClp(source, row) {
  return source === 'tc_nacional' ? row?.monto : source === 'tc_internacional' ? row?.amount_clp : row?.amount;
}

export function eligibleExpenseSplit(source, row) {
  const amount = parseClpMinor(expenseParentClp(source, row));
  if (amount === null || amount <= 1) return false;
  if (source === 'tc_nacional') return row?.tipo === 'gasto';
  if (source === 'tc_internacional') return row?.tipo === 'gasto' && Number(row?.exchange_rate) > 0;
  if (source !== 'cuenta_corriente' || row?.tipo !== 'cargo') return false;
  const description = String(row.descripcion || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  return !/pago.*tarjeta|pago tc|cargo por pago tc/.test(description);
}
