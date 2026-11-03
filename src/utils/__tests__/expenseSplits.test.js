import { parseClpMinor, minorToClp, eligibleExpenseSplit, matchesExpenseCategory } from '../expenseSplits';
test('convierte centavos exactos sin sumas decimales binarias', () => {
  expect(parseClpMinor('100000.01')).toBe(10000001); expect(parseClpMinor('0.10') + parseClpMinor('0.20')).toBe(30);
  expect(minorToClp(10000001)).toBe('100000.01'); expect(minorToClp(-1)).toBe('-0.01');
});
test.each(['1e3', '0.001', 'NaN', '', null, Infinity])('rechaza importe ambiguo %s', value => expect(parseClpMinor(value)).toBeNull());
test('admite solo gastos/cargos positivos con CLP, sin pagos de tarjeta', () => {
  expect(eligibleExpenseSplit('tc_nacional', { tipo: 'gasto', monto: '100' })).toBe(true);
  expect(eligibleExpenseSplit('tc_nacional', { tipo: 'pago', monto: '100' })).toBe(false);
  expect(eligibleExpenseSplit('tc_internacional', { tipo: 'gasto', amount_clp: null, exchange_rate: null })).toBe(false);
  expect(eligibleExpenseSplit('tc_internacional', { tipo: 'gasto', amount_clp: '100', exchange_rate: '900' })).toBe(true);
  expect(eligibleExpenseSplit('cuenta_corriente', { tipo: 'cargo', amount: '100', descripcion: 'Pago tarjeta de crédito' })).toBe(false);
  expect(eligibleExpenseSplit('cuenta_corriente', { tipo: 'cargo', amount: '100', descripcion: 'Compra calzado' })).toBe(true);
});
test('filtro por categoría busca solo partes cuando existe reparto', () => {
  const row = Object.freeze({ category_id: 9, split: { parts: [{ category_id: 1 }, { category_id: null }] } });
  expect(matchesExpenseCategory(row, '1')).toBe(true); expect(matchesExpenseCategory(row, '9')).toBe(false);
  expect(matchesExpenseCategory(row, 'uncategorized')).toBe(true); expect(matchesExpenseCategory({ category_id: 9 }, '9')).toBe(true);
});
