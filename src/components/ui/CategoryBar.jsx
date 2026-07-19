import React from 'react';
import { Box, Typography } from '@mui/material';
import TrendDelta from './TrendDelta';
import { formatCLP, formatPct } from '../../utils/format';

/**
 * Fila de categoría con barra de progreso horizontal (Epic 12, Req 12.4).
 * Clickeable para navegar al drill-down existente.
 */
const CategoryBar = ({ name, total, pct, deltaPct, onClick, color = 'primary.main' }) => {
  const width = `${Math.max(0, Math.min(100, Math.round((pct || 0) * 100)))}%`;

  return (
    <Box
      onClick={onClick}
      sx={{
        py: 0.75,
        cursor: onClick ? 'pointer' : 'default',
        '&:hover': onClick ? { bgcolor: 'action.hover' } : undefined,
        borderRadius: 1,
        px: 0.5,
      }}
    >
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
        <Typography variant="body2" noWrap sx={{ maxWidth: '55%' }}>
          {name}
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {deltaPct !== undefined && <TrendDelta value={deltaPct} positiveIsGood={false} />}
          <Typography variant="body2" color="text.secondary" noWrap>
            {formatCLP(total)}
          </Typography>
          <Typography variant="caption" fontWeight={700} sx={{ minWidth: 32, textAlign: 'right' }}>
            {formatPct(pct)}
          </Typography>
        </Box>
      </Box>
      <Box sx={{ height: 6, borderRadius: 3, bgcolor: 'action.hover', overflow: 'hidden' }}>
        <Box
          data-testid="category-bar-fill"
          sx={{ height: '100%', width, bgcolor: color, borderRadius: 3, transition: 'width .3s' }}
        />
      </Box>
    </Box>
  );
};

export default CategoryBar;
