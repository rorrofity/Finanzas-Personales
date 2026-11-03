import React, { useEffect, useState } from 'react';
import { Alert, Box, Button, CircularProgress, Divider, Drawer, IconButton, List, ListItem, Stack, Typography } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { readExpenseTransactions } from '../../services/expenseEvolution';
import { formatCLPExact as formatCLP } from '../../utils/format';
import { formatDateLocal } from '../../utils/dateUtils';

const SOURCE_NAMES = { tc_nacional: 'Tarjeta nacional', tc_internacional: 'Tarjeta internacional', cuenta_corriente: 'Cuenta corriente' };

export default function ExpenseDetailDrawer({ selection, scope, onClose }) {
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [offset, setOffset] = useState(0);
  const [retry, setRetry] = useState(0);

  useEffect(() => { setOffset(0); }, [selection]);

  useEffect(() => {
    if (!selection) return undefined;
    let current = true;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setResult(null);
    readExpenseTransactions({ ...scope, year: selection.month.year, month: selection.month.month, categoryId: selection.category.id, limit: 100, offset }, { signal: controller.signal })
      .then((response) => { if (current) setResult(response); })
      .catch((failure) => { if (current && !controller.signal.aborted) setError(failure.code === 'OFFLINE_MISS' ? failure.message : 'No pudimos cargar los movimientos de esta categoría. Vuelve a intentarlo.'); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; controller.abort(); };
  }, [selection, scope, offset, retry]);

  const data = result?.data;
  return (
    <Drawer anchor="right" open={Boolean(selection)} onClose={onClose} sx={{ zIndex: (theme) => theme.zIndex.drawer + 2 }} PaperProps={{ role: 'dialog', 'aria-labelledby': 'expense-detail-title', 'data-testid': 'expense-detail', sx: { width: { xs: '100%', sm: 500 }, maxWidth: '100vw' } }}>
      <Box sx={{ p: 2, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1 }}>
        <Box sx={{ minWidth: 0 }}><Typography component="h2" variant="h6" id="expense-detail-title" sx={{ overflowWrap: 'anywhere' }}>{selection?.category.name}</Typography><Typography variant="body2" color="text.secondary">{selection?.month.label} · Facturación</Typography></Box>
        <IconButton aria-label="Cerrar detalle" onClick={onClose}><CloseIcon /></IconButton>
      </Box>
      <Divider />
      <Box sx={{ p: 2 }} aria-live="polite">
        {loading && <Box sx={{ textAlign: 'center', py: 4 }}><CircularProgress size={30} aria-label="Cargando movimientos" /></Box>}
        {error && <Alert severity="error" action={<Button onClick={() => setRetry((n) => n + 1)} color="inherit">Reintentar</Button>}>{error}</Alert>}
        {data && !loading && <Stack spacing={2}>
          {result.origin === 'cache' && <Alert severity="info">Consulta guardada del {new Date(result.cachedAt).toLocaleString('es-CL')}. No se pudo actualizar esta página.</Alert>}
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 1, flexWrap: 'wrap' }}><Typography variant="body2">{data.count} movimiento{data.count === 1 ? '' : 's'} registrado{data.count === 1 ? '' : 's'}</Typography><Typography component="p" variant="h6" sx={{ overflowWrap: 'anywhere' }}>{formatCLP(data.total)}</Typography></Box>
          <Typography variant="body2" color="text.secondary">Fechas reales del movimiento; el período de facturación puede ser distinto. Cobertura bancaria no verificada.</Typography>
          {!data.transactions?.length && <Typography variant="body2">Sin movimientos registrados para esta categoría y período.</Typography>}
          <List disablePadding aria-label="Movimientos de la categoría">
            {(data.transactions || []).map((transaction) => <ListItem key={`${transaction.source}:${transaction.id}`} disableGutters divider sx={{ display: 'block', py: 1.5 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, flexWrap: 'wrap' }}><Typography variant="body2" color="text.secondary">{formatDateLocal(transaction.fecha)}</Typography><Typography variant="body2" fontWeight={600} sx={{ fontVariantNumeric: 'tabular-nums' }}>{formatCLP(transaction.amount)}</Typography></Box>
              <Typography variant="body2" sx={{ my: 0.5, overflowWrap: 'anywhere' }}>{transaction.descripcion}</Typography>
              {transaction.isSplit && <Typography variant="caption" sx={{ display: 'block', mb: 0.5 }} color="text.secondary">Parte atribuida · Total original: {formatCLP(transaction.originalAmount)}</Typography>}
              <Typography variant="caption" color="text.secondary">{SOURCE_NAMES[transaction.source] || transaction.source}</Typography>
            </ListItem>)}
          </List>
          {(data.count > data.limit || offset > 0) && <Box>
            <Typography variant="caption" color="text.secondary">Mostrando {data.transactions?.length ? offset + 1 : 0}–{offset + (data.transactions?.length || 0)} de {data.count}</Typography>
            <Stack direction="row" spacing={1} sx={{ mt: 1 }}><Button disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - 100))}>Anteriores</Button><Button disabled={!data.hasMore} onClick={() => setOffset(offset + 100)}>Siguientes</Button></Stack>
          </Box>}
        </Stack>}
      </Box>
    </Drawer>
  );
}
