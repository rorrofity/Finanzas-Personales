import React from 'react';
import { Box, FormControl, InputLabel, Select, MenuItem, Typography } from '@mui/material';
import { usePeriod } from '../contexts/PeriodContext';
import { useNavigate, useLocation } from 'react-router-dom';

const MONTHS = [
  'enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'
];

export default function MonthPicker() {
  const { year, month, label, setYear, setMonth } = usePeriod();
  const navigate = useNavigate();
  const location = useLocation();

  const periodStr = `${year}-${String(month).padStart(2, '0')}`;

  const updateUrl = (y, m) => {
    const params = new URLSearchParams(location.search);
    params.set('period', `${y}-${String(m).padStart(2, '0')}`);
    navigate(`${location.pathname}?${params.toString()}`, { replace: true });
  };

  const handleMonthChange = (e) => {
    const m = Number(e.target.value);
    setMonth(m);
    updateUrl(year, m);
  };

  const handleYearChange = (e) => {
    const y = Number(e.target.value);
    setYear(y);
    updateUrl(y, month);
  };

  const years = (() => {
    const current = new Date().getFullYear();
    const arr = [];
    for (let y = current + 1; y >= current - 5; y--) arr.push(y);
    return arr;
  })();

  return (
    <Box display="flex" alignItems="center" gap={2} mb={2}>
      <Typography variant="subtitle1" sx={{ minWidth: 48 }}>Mes:</Typography>
      <FormControl size="small" sx={{ minWidth: 160 }}>
        <InputLabel id="month-label">Mes</InputLabel>
        <Select
          labelId="month-label"
          label="Mes"
          value={month}
          onChange={handleMonthChange}
          renderValue={(val) => MONTHS[val-1] || '—'}
        >
          {MONTHS.map((m, idx) => (
            <MenuItem key={m} value={idx+1}>{m}</MenuItem>
          ))}
        </Select>
      </FormControl>
      <FormControl size="small" sx={{ minWidth: 120 }}>
        <InputLabel id="year-label">Año</InputLabel>
        <Select
          labelId="year-label"
          label="Año"
          value={year}
          onChange={handleYearChange}
        >
          {years.map((y) => (
            <MenuItem key={y} value={y}>{y}</MenuItem>
          ))}
        </Select>
      </FormControl>
      <Typography variant="body2" sx={{ opacity: 0.7 }}>
        {label || 'septiembre 2025'}
      </Typography>
    </Box>
  );
}
