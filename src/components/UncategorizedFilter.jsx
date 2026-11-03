import React from 'react';
import { Chip, ToggleButton } from '@mui/material';
import { matchesExpenseCategory } from '../utils/expenseSplits';

export const isUncategorized = row => matchesExpenseCategory(row, 'uncategorized');

export default function UncategorizedFilter({ active, count, onChange }) {
  return <ToggleButton value="uncategorized" selected={active} onChange={() => onChange(!active)}
    color="primary" size="small" aria-label={`Sin categoría (${count})`}
    sx={{ minHeight: 40, maxWidth: '100%', gap: 1, px: 1.5, borderRadius: 2, textTransform: 'none', alignSelf: 'flex-start' }}>
    <span>Sin categoría</span>
    <Chip component="span" label={count} size="small" color={active ? 'primary' : 'default'} aria-hidden="true" sx={{ height: 22, minWidth: 24 }} />
  </ToggleButton>;
}
