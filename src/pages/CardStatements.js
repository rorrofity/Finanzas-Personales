import React from 'react';
import { Box, Stack, Typography } from '@mui/material';
import MonthPicker from '../components/MonthPicker';
import CardStatementReconciliations from '../components/CardStatementReconciliations';
import { usePeriod } from '../contexts/PeriodContext';

export default function CardStatements() {
  const { year, month } = usePeriod();
  return <Box sx={{ minWidth: 0 }}>
    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 2, justifyContent: 'space-between', alignItems: { sm: 'center' } }}>
      <Box><Typography component="h1" variant="h5" fontWeight={700}>Estados de tarjetas</Typography><Typography variant="body2" color="text.secondary">Selecciona el mes de vencimiento.</Typography></Box>
      <MonthPicker />
    </Stack>
    <CardStatementReconciliations year={year} month={month} />
  </Box>;
}
