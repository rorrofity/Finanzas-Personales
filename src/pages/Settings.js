import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Paper,
  Typography,
  TextField,
  Button,
  Tab,
  Tabs,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
  Switch,
  Alert,
  Chip,
  Stack,
  Tooltip,
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  CreditCard as CreditCardIcon,
} from '@mui/icons-material';
import axios from 'axios';
import Profile from './Profile';

function TabPanel({ children, value, index, ...other }) {
  return (
    <div role="tabpanel" hidden={value !== index} {...other}>
      {value === index && <Box sx={{ py: 2 }}>{children}</Box>}
    </div>
  );
}

const emptyCard = { last_four: '', network: 'visa', holder: '', label: '' };

const Settings = () => {
  const [tabIndex, setTabIndex] = useState(0);
  const [cards, setCards] = useState([]);
  const [loadingCards, setLoadingCards] = useState(false);
  const [cardError, setCardError] = useState(null);
  const [cardSuccess, setCardSuccess] = useState(null);

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState('add'); // 'add' | 'edit'
  const [cardForm, setCardForm] = useState(emptyCard);
  const [editingCardId, setEditingCardId] = useState(null);

  // Delete confirmation
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingCard, setDeletingCard] = useState(null);

  const fetchCards = useCallback(async () => {
    setLoadingCards(true);
    try {
      const res = await axios.get('/api/cards');
      setCards(res.data);
      setCardError(null);
    } catch (err) {
      setCardError('Error al cargar tarjetas');
      console.error(err);
    } finally {
      setLoadingCards(false);
    }
  }, []);

  useEffect(() => {
    if (tabIndex === 1) {
      fetchCards();
    }
  }, [tabIndex, fetchCards]);

  const handleOpenAdd = () => {
    setDialogMode('add');
    setCardForm(emptyCard);
    setEditingCardId(null);
    setDialogOpen(true);
  };

  const handleOpenEdit = (card) => {
    setDialogMode('edit');
    setCardForm({
      last_four: card.last_four,
      network: card.network,
      holder: card.holder,
      label: card.label || '',
    });
    setEditingCardId(card.id);
    setDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
    setCardForm(emptyCard);
    setEditingCardId(null);
  };

  const handleSaveCard = async () => {
    try {
      if (dialogMode === 'add') {
        await axios.post('/api/cards', cardForm);
        setCardSuccess('Tarjeta agregada exitosamente');
      } else {
        await axios.put(`/api/cards/${editingCardId}`, cardForm);
        setCardSuccess('Tarjeta actualizada exitosamente');
      }
      handleCloseDialog();
      fetchCards();
    } catch (err) {
      setCardError(err.response?.data?.error || 'Error al guardar tarjeta');
    }
    setTimeout(() => setCardSuccess(null), 3000);
  };

  const handleToggleActive = async (card) => {
    try {
      await axios.put(`/api/cards/${card.id}`, { is_active: !card.is_active });
      fetchCards();
    } catch (err) {
      setCardError('Error al cambiar estado de tarjeta');
    }
  };

  const handleDeleteCard = async () => {
    if (!deletingCard) return;
    try {
      await axios.delete(`/api/cards/${deletingCard.id}`);
      setCardSuccess('Tarjeta eliminada');
      setDeleteDialogOpen(false);
      setDeletingCard(null);
      fetchCards();
    } catch (err) {
      setCardError('Error al eliminar tarjeta');
    }
    setTimeout(() => setCardSuccess(null), 3000);
  };

  const isFormValid = cardForm.last_four.length === 4 &&
    /^\d{4}$/.test(cardForm.last_four) &&
    ['visa', 'mastercard'].includes(cardForm.network) &&
    cardForm.holder.trim().length >= 2;

  return (
    <Box sx={{ maxWidth: 800, mx: 'auto', mt: 2 }}>
      <Typography variant="h4" gutterBottom>
        Configuración
      </Typography>
      <Paper sx={{ px: 2 }}>
        <Tabs
          value={tabIndex}
          onChange={(_, v) => setTabIndex(v)}
          sx={{ borderBottom: 1, borderColor: 'divider' }}
        >
          <Tab label="Perfil" />
          <Tab label="Tarjetas de Crédito" icon={<CreditCardIcon />} iconPosition="start" />
        </Tabs>

        <TabPanel value={tabIndex} index={0}>
          <Profile embedded />
        </TabPanel>

        <TabPanel value={tabIndex} index={1}>
          {cardError && (
            <Alert severity="error" sx={{ mb: 2 }} onClose={() => setCardError(null)}>
              {cardError}
            </Alert>
          )}
          {cardSuccess && (
            <Alert severity="success" sx={{ mb: 2 }} onClose={() => setCardSuccess(null)}>
              {cardSuccess}
            </Alert>
          )}

          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
            <Typography variant="h6">Tarjetas registradas</Typography>
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={handleOpenAdd}
              size="small"
            >
              Agregar Tarjeta
            </Button>
          </Stack>

          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Últimos 4</TableCell>
                  <TableCell>Red</TableCell>
                  <TableCell>Titular</TableCell>
                  <TableCell>Etiqueta</TableCell>
                  <TableCell align="center">Activa</TableCell>
                  <TableCell align="center">Acciones</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {loadingCards ? (
                  <TableRow>
                    <TableCell colSpan={6} align="center">Cargando...</TableCell>
                  </TableRow>
                ) : cards.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} align="center">
                      No hay tarjetas registradas. Agrega una para comenzar.
                    </TableCell>
                  </TableRow>
                ) : (
                  cards.map((card) => (
                    <TableRow key={card.id} sx={{ opacity: card.is_active ? 1 : 0.5 }}>
                      <TableCell>
                        <Typography variant="body2" fontFamily="monospace" fontWeight="bold">
                          **** {card.last_four}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={card.network.charAt(0).toUpperCase() + card.network.slice(1)}
                          size="small"
                          color={card.network === 'visa' ? 'primary' : 'warning'}
                          variant="outlined"
                        />
                      </TableCell>
                      <TableCell>{card.holder}</TableCell>
                      <TableCell>{card.label || '—'}</TableCell>
                      <TableCell align="center">
                        <Switch
                          checked={card.is_active}
                          onChange={() => handleToggleActive(card)}
                          size="small"
                        />
                      </TableCell>
                      <TableCell align="center">
                        <Tooltip title="Editar">
                          <IconButton size="small" onClick={() => handleOpenEdit(card)}>
                            <EditIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Eliminar">
                          <IconButton
                            size="small"
                            color="error"
                            onClick={() => { setDeletingCard(card); setDeleteDialogOpen(true); }}
                          >
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </TabPanel>
      </Paper>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onClose={handleCloseDialog} maxWidth="xs" fullWidth>
        <DialogTitle>
          {dialogMode === 'add' ? 'Agregar Tarjeta' : 'Editar Tarjeta'}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Últimos 4 dígitos"
              value={cardForm.last_four}
              onChange={(e) => {
                const v = e.target.value.replace(/\D/g, '').slice(0, 4);
                setCardForm({ ...cardForm, last_four: v });
              }}
              inputProps={{ maxLength: 4, inputMode: 'numeric' }}
              fullWidth
              required
              helperText="4 dígitos numéricos"
            />
            <FormControl fullWidth required>
              <InputLabel>Red</InputLabel>
              <Select
                value={cardForm.network}
                onChange={(e) => setCardForm({ ...cardForm, network: e.target.value })}
                label="Red"
              >
                <MenuItem value="visa">Visa</MenuItem>
                <MenuItem value="mastercard">Mastercard</MenuItem>
              </Select>
            </FormControl>
            <TextField
              label="Titular"
              value={cardForm.holder}
              onChange={(e) => setCardForm({ ...cardForm, holder: e.target.value })}
              fullWidth
              required
              helperText="Nombre del titular (ej: Rodrigo, Camila)"
            />
            <TextField
              label="Etiqueta (opcional)"
              value={cardForm.label}
              onChange={(e) => setCardForm({ ...cardForm, label: e.target.value })}
              fullWidth
              helperText="Ej: Black, Infinite, Adicional"
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog}>Cancelar</Button>
          <Button
            onClick={handleSaveCard}
            variant="contained"
            disabled={!isFormValid}
          >
            {dialogMode === 'add' ? 'Agregar' : 'Guardar'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
        <DialogTitle>Eliminar Tarjeta</DialogTitle>
        <DialogContent>
          <Typography>
            ¿Estás seguro de que deseas eliminar la tarjeta ****{deletingCard?.last_four} ({deletingCard?.network}) de {deletingCard?.holder}?
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>Cancelar</Button>
          <Button onClick={handleDeleteCard} color="error" variant="contained">
            Eliminar
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default Settings;
