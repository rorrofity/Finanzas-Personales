import React, { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip
} from '@mui/material';
import MonthPicker from '../components/MonthPicker';
import { usePeriod } from '../contexts/PeriodContext';
import axios from 'axios';

const TransactionsIntl = () => {
  const { year, month } = usePeriod();
  const [rows, setRows] = useState([]);
  const [openImport, setOpenImport] = useState(false);
  const [brand, setBrand] = useState('visa');
  const [rate, setRate] = useState('');
  const [fileText, setFileText] = useState('');

  const fetchRows = async () => {
    try {
      const res = await axios.get('/api/intl-unbilled', { params: { year, month } });
      setRows(res.data || []);
    } catch (e) {
      console.warn('intl list error', e?.response?.status || e?.message);
      setRows([]);
    }
  };

  useEffect(() => { fetchRows(); }, [year, month]);

  const parseCSV = (text) => {
    // Very simple CSV parser: Fecha,Descripcion,MontoUSD,Tipo,CategoryId
    const lines = text.split(/\r?\n/).filter(Boolean);
    const out = [];
    for (const line of lines.slice(1)) { // skip header
      const parts = line.split(',');
      if (parts.length < 4) continue;
      const [fecha, descripcion, amount_usd, tipo, category_id] = parts;
      out.push({ fecha, descripcion, amount_usd: Number(amount_usd), tipo: (tipo||'').toLowerCase(), category_id: category_id ? Number(category_id) : null });
    }
    return out;
  };

  const onFileChange = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const txt = await f.text();
    setFileText(txt);
  };

  const onImport = async () => {
    const r = Number(rate);
    if (!r || r <= 0) return alert('Ingresa un tipo de cambio válido (> 0)');
    const rowsParsed = parseCSV(fileText);
    if (!rowsParsed.length) return alert('Archivo sin filas válidas');
    try {
      await axios.post('/api/intl-unbilled/import', { brand, exchange_rate: r, rows: rowsParsed });
      setOpenImport(false);
      setFileText('');
      setRate('');
      await fetchRows();
    } catch (e) {
      alert(e?.response?.data?.error || 'Error al importar');
    }
  };

  const formatCurrency = (n) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(Number(n||0));

  return (
    <Box>
      <MonthPicker />
      <Typography variant="h5" sx={{ mt: 2, mb: 2, fontWeight: 700 }}>Transacciones No Facturadas Internacionales (TC)</Typography>
      <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
        <Button variant="contained" onClick={() => setOpenImport(true)}>Importar archivo</Button>
        <Tooltip title="Próximamente">
          <span>
            <Button variant="outlined" disabled>Nueva transacción manual</Button>
          </span>
        </Tooltip>
      </Stack>

      <Dialog open={openImport} onClose={() => setOpenImport(false)} fullWidth maxWidth="sm">
        <DialogTitle>Importar movimientos internacionales</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <FormControl fullWidth>
              <InputLabel>Tarjeta</InputLabel>
              <Select value={brand} label="Tarjeta" onChange={(e) => setBrand(e.target.value)}>
                <MenuItem value="visa">Visa Internacional</MenuItem>
                <MenuItem value="mastercard">Mastercard Internacional</MenuItem>
              </Select>
            </FormControl>
            <TextField
              label="Valor CLP por USD"
              type="number"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              inputProps={{ min: 1, step: '0.01' }}
              required
              fullWidth
            />
            <Stack direction="row" alignItems="center" spacing={2}>
              <Button variant="outlined" component="label">
                Seleccionar CSV
                <input type="file" accept=".csv" hidden onChange={onFileChange} />
              </Button>
              <Typography variant="body2" sx={{ opacity: 0.7 }}>{fileText ? 'Archivo cargado' : 'Sin archivo seleccionado'}</Typography>
            </Stack>
            <Typography variant="caption" sx={{ opacity: 0.8 }}>
              Formato CSV esperado (encabezados): Fecha,Descripcion,MontoUSD,Tipo,CategoryId
            </Typography>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenImport(false)}>Cancelar</Button>
          <Button variant="contained" onClick={onImport}>Importar</Button>
        </DialogActions>
      </Dialog>

      <Paper>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Fecha</TableCell>
                <TableCell>Descripción</TableCell>
                <TableCell align="right">Monto USD</TableCell>
                <TableCell align="right">Monto CLP</TableCell>
                <TableCell>Tipo</TableCell>
                <TableCell>Categoría</TableCell>
                <TableCell>Tarjeta</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.length ? rows.map(r => (
                <TableRow key={r.id}>
                  <TableCell>{new Date(r.fecha).toLocaleDateString('es-CL')}</TableCell>
                  <TableCell>{r.descripcion}</TableCell>
                  <TableCell align="right">{Number(r.amount_usd).toFixed(2)}</TableCell>
                  <TableCell align="right">{formatCurrency(r.amount_clp)}</TableCell>
                  <TableCell>{r.tipo}</TableCell>
                  <TableCell>{r.category_id || '-'}</TableCell>
                  <TableCell>{String(r.brand).toUpperCase()}</TableCell>
                </TableRow>
              )) : (
                <TableRow>
                  <TableCell colSpan={7} align="center">No tienes transacciones internacionales no facturadas en este mes. Importa un archivo para comenzar.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
    </Box>
  );
};

export default TransactionsIntl;
