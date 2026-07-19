import React from 'react';
import { Box, Typography } from '@mui/material';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';

/**
 * Delta de tendencia con color semántico (Epic 12, Req 12.2).
 *
 * `positiveIsGood`: para GASTOS es false (bajar = bueno = verde); para
 * BALANCE/INGRESOS es true (subir = bueno). `value` es el % ya calculado;
 * null/undefined → "—" (sin flechas).
 */
const TrendDelta = ({ value, positiveIsGood = true }) => {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return (
      <Typography variant="caption" color="text.disabled" data-testid="trend-delta" data-tone="none">
        —
      </Typography>
    );
  }

  const num = Number(value);
  const up = num >= 0;
  const isGood = up ? positiveIsGood : !positiveIsGood;
  const tone = num === 0 ? 'neutral' : isGood ? 'good' : 'bad';
  const color = tone === 'good' ? 'success.main' : tone === 'bad' ? 'error.main' : 'text.secondary';

  return (
    <Box
      data-testid="trend-delta"
      data-tone={tone}
      sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.25, color }}
    >
      {up ? (
        <ArrowUpwardIcon sx={{ fontSize: 14 }} data-testid="trend-up" />
      ) : (
        <ArrowDownwardIcon sx={{ fontSize: 14 }} data-testid="trend-down" />
      )}
      <Typography variant="caption" sx={{ fontWeight: 600, color: 'inherit' }}>
        {Math.abs(Math.round(num))}%
      </Typography>
    </Box>
  );
};

export default TrendDelta;
