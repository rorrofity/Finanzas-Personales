/** Translate only known split constraints; never expose SQL/financial payloads. */
function respondToSplitConstraint(error, res) {
  if (error?.code === 'P0001' && error.message === 'EXPENSE_SPLIT_PARENT_LOCKED') {
    res.status(409).json({ error: 'Edita o deshaz la división antes de modificar el movimiento original.', code: 'EXPENSE_SPLIT_PARENT_LOCKED' });
    return true;
  }
  if (error?.code === '23503' && error.constraint === 'expense_split_parts_category_id_fkey') {
    res.status(409).json({ error: 'Esta categoría está utilizada en una división de gastos.', code: 'EXPENSE_SPLIT_CATEGORY_IN_USE' });
    return true;
  }
  return false;
}
module.exports = { respondToSplitConstraint };
