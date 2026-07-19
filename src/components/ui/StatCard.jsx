import React from 'react';
import { Box, Card, CardContent, Skeleton, Typography } from '@mui/material';
import TrendDelta from './TrendDelta';
import { formatCLP, formatCLPShort } from '../../utils/format';

/**
 * Stat-card compacta del sistema de diseño (Epic 12, Reqs 12.2/12.6/12.7/12.9).
 * Altura acotada, label pequeño, valor grande, delta opcional.
 */
const StatCard = ({
  label,
  value,
  deltaPct,
  positiveIsGood = true,
  short = false,
  loading = false,
  accent = 'primary.main',
  emptyText = 'Sin datos del período',
}) => {
  const isEmpty = value === null || value === undefined;

  return (
    <Card
      variant="outlined"
      sx={{
        height: '100%',
        borderLeft: '3px solid',
        borderLeftColor: accent,
        maxHeight: 96,
      }}
    >
      <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
        <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
          {label}
        </Typography>

        {loading ? (
          <Skeleton variant="text" width="70%" height={32} />
        ) : isEmpty ? (
          <Typography variant="body2" color="text.disabled" sx={{ mt: 0.5 }}>
            {emptyText}
          </Typography>
        ) : (
          <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 0.5 }}>
            <Typography variant="h6" fontWeight={700} noWrap>
              {short ? formatCLPShort(value) : formatCLP(value)}
            </Typography>
            {deltaPct !== undefined && (
              <TrendDelta value={deltaPct} positiveIsGood={positiveIsGood} />
            )}
          </Box>
        )}
      </CardContent>
    </Card>
  );
};

export default StatCard;
