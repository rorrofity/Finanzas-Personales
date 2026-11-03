// Category analysis is an overlay. Bank identities, financial totals and reconciliation
// continue reading the original tables. This lateral relation returns one attributed
// amount per parent/category, or the unchanged parent when there is no saved split.
const FIELDS = Object.freeze({
  tc_nacional: { parent: 'transaction_id', amount: 'monto' },
  tc_internacional: { parent: 'intl_unbilled_id', amount: 'amount_clp' },
  cuenta_corriente: { parent: 'checking_transaction_id', amount: 'amount' },
});

function expenseAllocationJoin(source, parentAlias, amountSql, allocationAlias = 'allocation') {
  const field = FIELDS[source];
  if (!field || !/^[a-z][a-z0-9_]*$/i.test(parentAlias) || !/^[a-z][a-z0-9_]*$/i.test(allocationAlias)) throw new TypeError('Invalid internal expense allocation relation');
  const original = `${parentAlias}.${field.amount}`;
  if (amountSql !== original && !(source === 'tc_nacional' && amountSql === `ABS(${original})`)) throw new TypeError('Invalid internal expense amount expression');
  const identity = `es.user_id = ${parentAlias}.user_id AND es.source = '${source}' AND es.${field.parent} = ${parentAlias}.id`;
  return `CROSS JOIN LATERAL (
    SELECT esp.category_id, SUM(esp.amount_clp)::numeric AS amount,
      ${amountSql}::numeric AS original_amount, true AS is_split
    FROM expense_splits es
    JOIN expense_split_parts esp ON esp.split_id = es.id
    WHERE ${identity}
    GROUP BY esp.category_id
    UNION ALL
    SELECT ${parentAlias}.category_id, ${amountSql}::numeric AS amount,
      ${amountSql}::numeric AS original_amount, false AS is_split
    WHERE NOT EXISTS (SELECT 1 FROM expense_splits es WHERE ${identity})
  ) ${allocationAlias}`;
}

module.exports = { expenseAllocationJoin };
