import useSpacePermissions from '../hooks/useSpacePermissions';
import React, { useEffect, useState, useMemo } from 'react';
import { formatDateLocal } from '../utils/dateUtils';
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
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
  Tooltip,
  Snackbar,
  Alert,
  IconButton,
  Chip,
  TablePagination,
  Switch,
  FormControlLabel,
  Card,
  CardContent,
  Grid,
  useMediaQuery,
  useTheme
} from '@mui/material';
import { 
  Edit as EditIcon, 
  Delete as DeleteIcon,
  CheckCircle as CheckCircleIcon,
  Close as CloseIcon,
  FileUpload as FileUploadIcon
} from '@mui/icons-material';
import MonthPicker from '../components/MonthPicker';
import SyncButton from '../components/SyncButton';
import BillingPeriodConfig from '../components/BillingPeriodConfig';
import { usePeriod } from '../contexts/PeriodContext';
import StatCard from '../components/ui/StatCard';
import UncategorizedFilter, { isUncategorized } from '../components/UncategorizedFilter';
import axios from 'axios';

const hasConversion = row => row.amount_clp !== null && row.amount_clp !== undefined
  && row.exchange_rate !== null && row.exchange_rate !== undefined
  && Number.isFinite(Number(row.amount_clp)) && Number.isFinite(Number(row.exchange_rate)) && Number(row.exchange_rate) > 0;

const TransactionsIntl = () => {
  const { canEdit, canDelete } = useSpacePermissions();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const { year, month } = usePeriod();
  const periodKey = `${year}-${String(month).padStart(2,'0')}`;
  const [cardFilter, setCardFilter] = useState(()=>{
    try { return sessionStorage.getItem(`tcFilterCard::transactionsIntl::${periodKey}`) || 'ALL'; } catch { return 'ALL'; }
  });
  const [rows, setRows] = useState([]);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [hideDismissed, setHideDismissed] = useState(false);
  const [onlyUncategorized, setOnlyUncategorized] = useState(false);
  const [openImport, setOpenImport] = useState(false);
  const [brand, setBrand] = useState('visa');
  const [rate, setRate] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [categoriesList, setCategoriesList] = useState([]);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });
  const [importResult, setImportResult] = useState({ open: false, data: null });
  const [selectedIds, setSelectedIds] = useState([]);
  const [openEdit, setOpenEdit] = useState(false);
  const [editing, setEditing] = useState(null);
  const [formData, setFormData] = useState({ fecha: '', descripcion: '', amount_usd: '', exchange_rate: '', tipo: 'gasto', category_id: '' });

  const fetchRows = async () => {
    try {
      const res = await axios.get('/api/intl-unbilled', { params: { year, month } });
      setRows(res.data || []);
    } catch (e) {
      console.warn('intl list error', e?.response?.status || e?.message);
      setRows([]);
    }
  };

  const fetchCategories = async () => {
    try { const r = await axios.get('/api/categories'); setCategoriesList(r.data || []); } catch {}
  };

  useEffect(() => { 
    fetchRows();
    try {
      const saved = sessionStorage.getItem(`tcFilterCard::transactionsIntl::${periodKey}`);
      if (saved) setCardFilter(saved);
    } catch {}
    setPage(0);
    setSelectedIds([]);
  }, [year, month]);
  useEffect(() => { fetchCategories(); }, []);

  const onFileChange = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const allowed = ['.csv', '.xls', '.xlsx'];
    const ok = allowed.some(ext => f.name.toLowerCase().endsWith(ext));
    if (!ok) return alert('Formato no soportado. Usa .csv, .xls o .xlsx');
    setSelectedFile(f);
  };

  const onImport = async () => {
    if (!canEdit) return;
    const r = Number(rate);
    if (!r || r <= 0) return alert('Ingresa un tipo de cambio válido (> 0)');
    if (!selectedFile) return alert('Selecciona un archivo CSV/Excel');
    const fd = new FormData();
    fd.append('file', selectedFile);
    fd.append('brand', brand);
    fd.append('exchange_rate', String(r));
    fd.append('periodYear', String(year));
    fd.append('periodMonth', String(month));
    try {
      setUploadProgress(0);
      const response = await axios.post('/api/intl-unbilled/import-file', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (ev) => {
          if (ev.total) setUploadProgress(Math.round((ev.loaded * 100) / ev.total));
        }
      });
      setOpenImport(false);
      setSelectedFile(null);
      setRate('');
      setUploadProgress(0);
      await fetchRows();
      
      // Mostrar diálogo con resultado
      const { inserted = 0, skipped = 0 } = response.data || {};
      const message = inserted > 0 
        ? 'Transacciones importadas correctamente'
        : skipped > 0 
          ? 'No se encontraron transacciones nuevas'
          : 'No se encontraron transacciones para importar';
      setImportResult({ 
        open: true, 
        data: { imported: inserted, skipped, message, isError: false }
      });
    } catch (e) {
      setImportResult({ 
        open: true, 
        data: { 
          imported: 0, 
          skipped: 0, 
          message: e?.response?.data?.error || 'Error al importar archivo', 
          isError: true 
        }
      });
    }
  };

  const formatCurrency = (n) => n === null || n === undefined ? 'Conversión pendiente' : new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(Number(n));

  const toggleSelect = (id) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };
  const toggleSelectAll = (checked) => {
    if (checked) setSelectedIds(filteredRows.map(r => r.id)); else setSelectedIds([]);
  };

  const handleOpenEdit = (row) => {
    if (!canEdit) return;
    setEditing(row);
    setFormData({
      fecha: row.fecha?.split('T')[0] || row.fecha,
      descripcion: row.descripcion,
      amount_usd: String(row.amount_usd),
      exchange_rate: row.exchange_rate === null || row.exchange_rate === undefined ? '' : String(row.exchange_rate),
      tipo: row.tipo,
      category_id: row.category_id || ''
    });
    setOpenEdit(true);
  };
  const handleCloseEdit = () => { setOpenEdit(false); setEditing(null); };

  const handleEditChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const submitEdit = async (e) => {
    if (!canEdit) return;
    e?.preventDefault?.();
    const rateText = formData.exchange_rate.trim(), amountText = formData.amount_usd.trim();
    if ((rateText !== '' && (!Number.isFinite(Number(rateText)) || Number(rateText) <= 0))
      || (rateText === '' && editing.exchange_rate !== null && editing.exchange_rate !== undefined)) {
      setSnackbar({ open: true, message: 'Ingresa un tipo de cambio positivo o déjalo pendiente.', severity: 'error' });
      return;
    }
    if (amountText === '' || !Number.isFinite(Number(amountText))) {
      setSnackbar({ open: true, message: 'Ingresa un monto USD válido.', severity: 'error' });
      return;
    }
    const payload = { fecha: formData.fecha, descripcion: formData.descripcion, tipo: formData.tipo, category_id: formData.category_id || null };
    if (Number(amountText) !== Number(editing.amount_usd)) payload.amount_usd = Number(amountText);
    if (rateText !== '' && (editing.exchange_rate === null || editing.exchange_rate === undefined || Number(rateText) !== Number(editing.exchange_rate))) payload.exchange_rate = Number(rateText);
    try {
      await axios.put(`/api/intl-unbilled/${editing.id}`, payload);
      setSnackbar({ open: true, message: 'Transacción actualizada', severity: 'success' });
      handleCloseEdit();
      await fetchRows();
      if (typeof window.refreshDashboardData === 'function') window.refreshDashboardData();
    } catch (err) {
      setSnackbar({ open: true, message: err?.response?.data?.error || 'Error al actualizar', severity: 'error' });
    }
  };

  const changeCategoryInline = async (rowId, newCat) => {
    if (!canEdit) return;
    try {
      await axios.put(`/api/intl-unbilled/${rowId}`, { category_id: newCat || null });
      setRows(prev => prev.map(r => r.id === rowId ? { ...r, category_id: newCat || null } : r));
      if (typeof window.refreshDashboardData === 'function') window.refreshDashboardData();
    } catch {}
  };

  const changeTypeInline = async (rowId, newType) => {
    if (!canEdit) return;
    try {
      await axios.put(`/api/intl-unbilled/${rowId}`, { tipo: newType });
      setRows(prev => prev.map(r => r.id === rowId ? { ...r, tipo: newType } : r));
      if (typeof window.refreshDashboardData === 'function') window.refreshDashboardData();
    } catch {}
  };

  const handleDelete = async (rowId) => {
    if (!canDelete) return;
    if (!window.confirm('¿Eliminar esta transacción internacional?')) return;
    try {
      await axios.delete(`/api/intl-unbilled/${rowId}`);
      setSnackbar({ open: true, message: 'Transacción eliminada', severity: 'success' });
      await fetchRows();
      if (typeof window.refreshDashboardData === 'function') window.refreshDashboardData();
    } catch (err) {
      setSnackbar({ open: true, message: err?.response?.data?.error || 'Error al eliminar', severity: 'error' });
    }
  };

  const handleBulkDelete = async () => {
    if (!canDelete) return;
    if (!selectedIds.length) return;
    if (!window.confirm(`¿Eliminar ${selectedIds.length} transacción(es) seleccionadas?`)) return;
    try {
      // No hay endpoint bulk; iterar
      for (const id of selectedIds) {
        await axios.delete(`/api/intl-unbilled/${id}`);
      }
      setSelectedIds([]);
      setSnackbar({ open: true, message: 'Transacciones eliminadas', severity: 'success' });
      await fetchRows();
      if (typeof window.refreshDashboardData === 'function') window.refreshDashboardData();
    } catch (err) {
      setSnackbar({ open: true, message: err?.response?.data?.error || 'Error al eliminar selección', severity: 'error' });
    }
  };

  // Count against the other active filters, then filter before pagination.
  const baseFilteredRows = useMemo(() => (hideDismissed ? rows.filter(r => r.tipo !== 'desestimar') : rows).filter(r => {
    if (cardFilter === 'ALL') return true;
    const b = String(r.brand || '').toLowerCase();
    if (cardFilter === 'VISA') return b === 'visa';
    if (cardFilter === 'MASTERCARD') return b === 'mastercard';
    return true;
  }), [rows, hideDismissed, cardFilter]);
  const uncategorizedCount = baseFilteredRows.filter(isUncategorized).length;
  const filteredRows = useMemo(() => onlyUncategorized ? baseFilteredRows.filter(isUncategorized) : baseFilteredRows, [baseFilteredRows, onlyUncategorized]);
  const visiblePage = Math.min(page, Math.max(0, Math.ceil(filteredRows.length / rowsPerPage) - 1));
  useEffect(() => {
    setPage(previous => Math.min(previous, Math.max(0, Math.ceil(filteredRows.length / rowsPerPage) - 1)));
    const visibleIds = new Set(filteredRows.map(row => row.id));
    setSelectedIds(previous => {
      const visible = previous.filter(id => visibleIds.has(id));
      return visible.length === previous.length ? previous : visible;
    });
  }, [filteredRows, rowsPerPage]);
  const titleBrandLabel = cardFilter === 'ALL' ? 'Todas' : (cardFilter === 'VISA' ? 'Visa' : 'Mastercard');

  // Calcular totales
  const totals = useMemo(() => {
    const gastos = filteredRows.filter(r => r.tipo === 'gasto');
    const pagos = filteredRows.filter(r => r.tipo === 'pago');
    return {
      totalUSD: gastos.reduce((sum, r) => sum + Number(r.amount_usd || 0), 0),
      totalCLP: gastos.filter(hasConversion).reduce((sum, r) => sum + Number(r.amount_clp), 0),
      pendingGastos: gastos.filter(r => !hasConversion(r)).length,
      convertedGastos: gastos.filter(hasConversion).length,
      countGastos: gastos.length,
      pagosUSD: pagos.reduce((sum, r) => sum + Number(r.amount_usd || 0), 0),
      pagosCLP: pagos.filter(hasConversion).reduce((sum, r) => sum + Number(r.amount_clp), 0),
      pendingPagos: pagos.filter(r => !hasConversion(r)).length,
      convertedPagos: pagos.filter(hasConversion).length,
      countPagos: pagos.length,
      countTotal: filteredRows.length
    };
  }, [filteredRows]);

  const conversionSummary = (total, pending, converted) => pending > 0 ? converted > 0 ? `${formatCurrency(total)} parcial` : 'CLP pendiente' : formatCurrency(total);
  const pendingConversions = totals.pendingGastos + totals.pendingPagos;

  const formatUSD = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(n||0));

  const handleChangePage = (event, newPage) => setPage(newPage);
  const handleChangeRowsPerPage = (event) => { setRowsPerPage(parseInt(event.target.value, 10)); setPage(0); };

  const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  const monthLabel = `${monthNames[month - 1]} ${year}`;

  return (
    <Box>
      <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, justifyContent: 'space-between', alignItems: { xs: 'flex-start', sm: 'center' }, mb: 2, gap: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
          <Typography variant="h5" fontWeight={700}>Transacciones Internacionales</Typography>
          <BillingPeriodConfig year={year} month={month} onRecalculated={fetchRows} />
        </Box>
        <Box sx={{ width: { xs: '100%', sm: 'auto' } }}>
          <MonthPicker />
        </Box>
      </Box>

      {/* Totales compactos (Epic 12, Req 12.10) */}
      <Grid container spacing={1} sx={{ mb: 2.5 }} data-testid="totals-row">
        <Grid item xs={4}>
          <StatCard label="Total Gastos" valueText={formatUSD(totals.totalUSD)} subtext={conversionSummary(totals.totalCLP, totals.pendingGastos, totals.convertedGastos)} accent="error.main" />
        </Grid>
        <Grid item xs={4}>
          <StatCard label="Total Pagos" valueText={formatUSD(totals.pagosUSD)} subtext={conversionSummary(totals.pagosCLP, totals.pendingPagos, totals.convertedPagos)} accent="success.main" />
        </Grid>
        <Grid item xs={4}>
          <StatCard label="Balance" valueText={formatUSD(totals.totalUSD - totals.pagosUSD)} subtext={conversionSummary(totals.totalCLP - totals.pagosCLP, pendingConversions, totals.convertedGastos + totals.convertedPagos)} accent="primary.main" />
        </Grid>
      </Grid>

      {pendingConversions > 0 && <Alert severity="info" sx={{ mb: 2 }}>{pendingConversions} {pendingConversions === 1 ? 'movimiento sin conversión' : 'movimientos sin conversión'}. Los importes USD se conservan; los totales en CLP son parciales hasta contar con el cambio correspondiente.</Alert>}

      <Typography variant="subtitle1" sx={{ mb: 1, fontWeight: 600, color: 'text.secondary' }}>
        {titleBrandLabel} ({filteredRows.length} registros)
      </Typography>
      <Stack direction="row" spacing={1} useFlexGap sx={{ mb: 2, flexWrap: 'wrap', alignItems: 'center' }}>
        <SyncButton 
          onSyncComplete={() => {
            fetchRows();
          }}
          variant="outlined"
          size="small"
        />
        <Button variant="contained" disabled={!canEdit} onClick={() => setOpenImport(true)}>Importar archivo</Button>
        <FormControlLabel
          control={<Switch checked={hideDismissed} onChange={(e)=>{ setHideDismissed(e.target.checked); setPage(0); setSelectedIds([]); }} />}
          label="Ocultar desestimados en tabla"
        />
        <TextField
          select
          size="small"
          label="Tarjeta"
          value={cardFilter}
          onChange={(e)=>{
            const v = e.target.value;
            setCardFilter(v);
            setPage(0);
            setSelectedIds([]);
            try { sessionStorage.setItem(`tcFilterCard::transactionsIntl::${periodKey}`, v); } catch {}
          }}
          sx={{ minWidth: 180 }}
        >
          <MenuItem value="ALL">Todas</MenuItem>
          <MenuItem value="VISA">Visa</MenuItem>
          <MenuItem value="MASTERCARD">Mastercard</MenuItem>
        </TextField>
        <UncategorizedFilter active={onlyUncategorized} count={uncategorizedCount} onChange={active => { setOnlyUncategorized(active); setPage(0); setSelectedIds([]); }} />
        {selectedIds.length > 0 && (
          <Button color="error" variant="contained" disabled={!canDelete} onClick={handleBulkDelete}>
            Eliminar seleccionadas ({selectedIds.length})
          </Button>
        )}
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
                Seleccionar archivo
                <input type="file" accept=".csv,.xls,.xlsx" hidden onChange={onFileChange} />
              </Button>
              <Typography variant="body2" sx={{ opacity: 0.7 }}>{selectedFile ? selectedFile.name : 'Sin archivo seleccionado'}</Typography>
            </Stack>
            <Typography variant="caption" sx={{ opacity: 0.8 }}>
              Se usará el período seleccionado arriba (Mes/Año) para registrar estas transacciones.
            </Typography>
            {uploadProgress > 0 && (
              <Box mt={2}>
                <Typography variant="caption">Subiendo: {uploadProgress}%</Typography>
              </Box>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenImport(false)}>Cancelar</Button>
          <Button variant="contained" disabled={!canEdit} onClick={onImport}>Importar</Button>
        </DialogActions>
      </Dialog>

      {isMobile ? (
        <Box sx={{ mb: 2 }}>
          {filteredRows.length === 0 ? (
            <Typography align="center" color="text.secondary" sx={{ py: 4 }}>
              {onlyUncategorized ? 'No hay transacciones internacionales sin categoría con estos filtros.' : 'No tienes transacciones internacionales no facturadas en este mes.'}
            </Typography>
          ) : (
            <Stack spacing={1}>
              {filteredRows
                .slice(visiblePage * rowsPerPage, visiblePage * rowsPerPage + rowsPerPage)
                .map((r) => (
                  <Card key={r.id} variant="outlined" sx={{ 
                    borderLeft: r.category_id ? '4px solid #4caf50' : '4px solid #ff9800',
                  }}>
                    <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
                      <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb={1}>
                        <Box flex={1}>
                          <Typography variant="body2" fontWeight="bold" sx={{ 
                            overflow: 'hidden', 
                            textOverflow: 'ellipsis',
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical',
                          }}>
                            {r.descripcion}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {formatDateLocal(r.fecha)} • {String(r.brand).toUpperCase()}
                          </Typography>
                        </Box>
                        <Box textAlign="right">
                          <Typography variant="body1" fontWeight="bold" color="error.main" sx={{ ml: 1, whiteSpace: 'nowrap' }}>
                            {Number(r.amount_usd).toFixed(2)} USD
                          </Typography>
                          <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                            {hasConversion(r) ? formatCurrency(r.amount_clp) : 'Conversión pendiente'}
                          </Typography>
                        </Box>
                      </Box>
                      
                      <Stack direction="row" spacing={1} alignItems="center">
                        <Select
                          disabled={!canEdit}
                          size="small"
                          value={r.category_id || ''}
                          onChange={(e) => changeCategoryInline(r.id, e.target.value)}
                          displayEmpty
                          sx={{ flex: 1, '& .MuiSelect-select': { py: 0.75 } }}
                        >
                          <MenuItem value=""><em>Sin categoría</em></MenuItem>
                          {categoriesList.map((category) => (
                            <MenuItem key={category.id} value={category.id}>{category.name}</MenuItem>
                          ))}
                        </Select>
                        <Select
                          disabled={!canEdit}
                          size="small"
                          value={r.tipo}
                          onChange={(e) => changeTypeInline(r.id, e.target.value)}
                          sx={{ minWidth: 90, '& .MuiSelect-select': { py: 0.75 } }}
                        >
                          <MenuItem value="gasto">Gasto</MenuItem>
                          <MenuItem value="pago">Pago</MenuItem>
                          <MenuItem value="desestimar">Desest.</MenuItem>
                        </Select>
                        <IconButton size="small" aria-label="Editar transacción internacional" disabled={!canEdit} onClick={() => handleOpenEdit(r)}>
                          <EditIcon fontSize="small" />
                        </IconButton>
                        <IconButton size="small" disabled={!canDelete} onClick={() => handleDelete(r.id)}>
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Stack>
                    </CardContent>
                  </Card>
                ))}
            </Stack>
          )}
        </Box>
      ) : (
        <Paper sx={{ mb: 2, overflow: 'hidden' }}>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>
                    <input type="checkbox" disabled={!canDelete} aria-label="Seleccionar todas las transacciones filtradas" checked={filteredRows.length > 0 && filteredRows.every(row => selectedIds.includes(row.id))} onChange={(e)=>toggleSelectAll(e.target.checked)} />
                  </TableCell>
                  <TableCell>Fecha</TableCell>
                  <TableCell>Descripción</TableCell>
                  <TableCell align="right">Monto USD</TableCell>
                  <TableCell align="right">Monto CLP</TableCell>
                  <TableCell>Tipo</TableCell>
                  <TableCell>Categoría</TableCell>
                  <TableCell>Tarjeta</TableCell>
                  <TableCell>Acciones</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredRows.length ? filteredRows
                  .slice(visiblePage * rowsPerPage, visiblePage * rowsPerPage + rowsPerPage)
                  .map(r => (
                    <TableRow key={r.id}>
                      <TableCell>
                        <input type="checkbox" disabled={!canDelete} aria-label={`Seleccionar ${r.descripcion}`} checked={selectedIds.includes(r.id)} onChange={()=>toggleSelect(r.id)} />
                      </TableCell>
                      <TableCell>{formatDateLocal(r.fecha)}</TableCell>
                      <TableCell>
                        {r.descripcion}
                        {r.tipo === 'desestimar' && (<Chip size="small" label="Desestimado" color="warning" sx={{ ml: 1 }} />)}
                      </TableCell>
                      <TableCell align="right">{Number(r.amount_usd).toFixed(2)}</TableCell>
                      <TableCell align="right">{hasConversion(r) ? formatCurrency(r.amount_clp) : 'Conversión pendiente'}</TableCell>
                      <TableCell>
                        <Select disabled={!canEdit} size="small" value={r.tipo} onChange={(e)=>changeTypeInline(r.id, e.target.value)} sx={{ minWidth: 110 }}>
                          <MenuItem value="gasto">Gasto</MenuItem>
                          <MenuItem value="pago">Pago</MenuItem>
                          <MenuItem value="desestimar">Desestimar</MenuItem>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Select disabled={!canEdit} size="small" value={r.category_id || ''} displayEmpty onChange={(e)=>changeCategoryInline(r.id, e.target.value)} sx={{ minWidth: 140 }}>
                          <MenuItem value=""><em>Sin categoría</em></MenuItem>
                          {categoriesList.map(c => (
                            <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>
                          ))}
                        </Select>
                      </TableCell>
                      <TableCell>{String(r.brand).toUpperCase()}</TableCell>
                      <TableCell>
                        <Tooltip title="Editar"><IconButton size="small" disabled={!canEdit} onClick={()=>handleOpenEdit(r)}><EditIcon/></IconButton></Tooltip>
                        <Tooltip title="Eliminar"><IconButton size="small" disabled={!canDelete} onClick={()=>handleDelete(r.id)}><DeleteIcon/></IconButton></Tooltip>
                      </TableCell>
                    </TableRow>
                  )) : (
                  <TableRow>
                    <TableCell colSpan={9} align="center">{onlyUncategorized ? 'No hay transacciones internacionales sin categoría con estos filtros.' : 'No tienes transacciones internacionales no facturadas en este mes. Importa un archivo para comenzar.'}</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      )}

      <TablePagination
        rowsPerPageOptions={[5, 10, 25]}
        component="div"
        count={filteredRows.length}
        rowsPerPage={rowsPerPage}
        page={visiblePage}
        onPageChange={handleChangePage}
        onRowsPerPageChange={handleChangeRowsPerPage}
      />

      <Box mt={1} textAlign="right">
        <Typography variant="caption">Mostrando {Math.min(filteredRows.length, visiblePage*rowsPerPage + (filteredRows.slice(visiblePage*rowsPerPage, visiblePage*rowsPerPage+rowsPerPage).length))} de {filteredRows.length} transacciones ({titleBrandLabel})</Typography>
      </Box>

      {/* Edit dialog */}
      <Dialog open={openEdit} onClose={handleCloseEdit} fullWidth maxWidth="sm">
        <DialogTitle>Editar transacción internacional</DialogTitle>
        <DialogContent>
          <Box component="form" onSubmit={submitEdit} sx={{ mt: 1 }}>
            <TextField margin="normal" fullWidth required type="date" name="fecha" label="Fecha" InputLabelProps={{ shrink: true }} value={formData.fecha} onChange={handleEditChange} />
            <TextField margin="normal" fullWidth required name="descripcion" label="Descripción" value={formData.descripcion} onChange={handleEditChange} />
            <Stack direction={{ xs:'column', sm:'row' }} spacing={2} sx={{ mt: 1 }}>
              <TextField fullWidth type="number" name="amount_usd" label="Monto USD" value={formData.amount_usd} onChange={handleEditChange} />
              <TextField fullWidth type="number" name="exchange_rate" label="Tipo de cambio" value={formData.exchange_rate} onChange={handleEditChange} />
            </Stack>
            <Stack direction={{ xs:'column', sm:'row' }} spacing={2} sx={{ mt: 2 }}>
              <FormControl fullWidth>
                <InputLabel>Tipo</InputLabel>
                <Select name="tipo" label="Tipo" value={formData.tipo} onChange={handleEditChange}>
                  <MenuItem value="gasto">Gasto</MenuItem>
                  <MenuItem value="pago">Pago</MenuItem>
                  <MenuItem value="desestimar">Desestimar</MenuItem>
                </Select>
              </FormControl>
              <FormControl fullWidth>
                <InputLabel>Categoría</InputLabel>
                <Select name="category_id" label="Categoría" value={formData.category_id} onChange={handleEditChange} displayEmpty>
                  <MenuItem value=""><em>Sin categoría</em></MenuItem>
                  {categoriesList.map(c => (<MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>))}
                </Select>
              </FormControl>
            </Stack>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseEdit}>Cancelar</Button>
          <Button variant="contained" disabled={!canEdit} onClick={submitEdit}>Guardar</Button>
        </DialogActions>
      </Dialog>

      {/* Diálogo de resultado de importación */}
      <Dialog
        open={importResult.open}
        onClose={() => setImportResult({ open: false, data: null })}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          <Box display="flex" alignItems="center" justifyContent="space-between">
            <Box display="flex" alignItems="center" gap={1}>
              {importResult.data?.isError ? (
                <>
                  <FileUploadIcon color="error" />
                  <Typography variant="h6">Error en Importación</Typography>
                </>
              ) : importResult.data?.imported > 0 ? (
                <>
                  <CheckCircleIcon color="success" />
                  <Typography variant="h6">Importación Exitosa</Typography>
                </>
              ) : (
                <>
                  <FileUploadIcon color="primary" />
                  <Typography variant="h6">Importación Completada</Typography>
                </>
              )}
            </Box>
            <IconButton
              edge="end"
              color="inherit"
              onClick={() => setImportResult({ open: false, data: null })}
              aria-label="close"
            >
              <CloseIcon />
            </IconButton>
          </Box>
        </DialogTitle>
        
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            {importResult.data?.message}
          </DialogContentText>
          
          {importResult.data && !importResult.data.isError && (
            <Box>
              <Typography variant="body2" sx={{ mb: 1 }}>
                ✅ <strong>{importResult.data.imported}</strong> transacciones nuevas importadas
              </Typography>
              <Typography variant="body2" sx={{ mb: 1 }}>
                ⏭️ <strong>{importResult.data.skipped}</strong> transacciones duplicadas (omitidas)
              </Typography>
            </Box>
          )}
          
          <Button
            onClick={() => setImportResult({ open: false, data: null })}
            variant="contained"
            fullWidth
            sx={{ mt: 3 }}
          >
            Cerrar
          </Button>
        </DialogContent>
      </Dialog>

      <Snackbar 
        open={snackbar.open} 
        autoHideDuration={6000} 
        onClose={()=>setSnackbar(prev=>({ ...prev, open:false }))}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      >
        <Alert onClose={()=>setSnackbar(prev=>({ ...prev, open:false }))} severity={snackbar.severity} sx={{ width: '100%' }}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default TransactionsIntl;
