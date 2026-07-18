import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  FormControlLabel,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import axios from '../config/axios';
import { useSpace } from '../contexts/SpaceContext';

/**
 * Administración de miembros del espacio propio (Epic 11, Reqs 11.1–11.3, 11.8).
 * Solo la ve el dueño; las escrituras del backend son requireOwner.
 */
const SpaceMembersSettings = () => {
  const { refreshMemberships } = useSpace();
  const [members, setMembers] = useState([]);
  const [email, setEmail] = useState('');
  const [inviteCanEdit, setInviteCanEdit] = useState(false);
  const [inviteCanDelete, setInviteCanDelete] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [loading, setLoading] = useState(false);

  const fetchMembers = useCallback(async () => {
    try {
      const { data } = await axios.get('/api/space/members');
      setMembers(data.members || []);
    } catch (e) {
      setError('Error al cargar miembros');
    }
  }, []);

  useEffect(() => {
    fetchMembers();
  }, [fetchMembers]);

  const notify = (msg) => {
    setSuccess(msg);
    setTimeout(() => setSuccess(null), 3000);
  };

  const handleInvite = async () => {
    setLoading(true);
    setError(null);
    try {
      await axios.post('/api/space/members', {
        email: email.trim(),
        canEdit: inviteCanEdit,
        canDelete: inviteCanDelete,
      });
      setEmail('');
      setInviteCanEdit(false);
      setInviteCanDelete(false);
      notify('Invitación enviada');
      await fetchMembers();
      refreshMemberships();
    } catch (e) {
      setError(e.response?.data?.error || 'Error al invitar');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdate = async (member, changes) => {
    setError(null);
    try {
      await axios.put(`/api/space/members/${member.id}`, changes);
      await fetchMembers();
      notify('Permisos actualizados');
    } catch (e) {
      setError(e.response?.data?.error || 'Error al actualizar permisos');
    }
  };

  const handleRevoke = async (member) => {
    setError(null);
    try {
      await axios.delete(`/api/space/members/${member.id}`);
      await fetchMembers();
      refreshMemberships();
      notify('Acceso revocado');
    } catch (e) {
      setError(e.response?.data?.error || 'Error al revocar acceso');
    }
  };

  return (
    <Box>
      <Typography variant="h6" sx={{ mb: 1 }}>
        Espacio compartido
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Invita a un miembro de tu hogar a ver tus finanzas. Tú controlas sus
        permisos y puedes desactivar su acceso en cualquier momento (máximo 2
        miembros). Si aún no tiene cuenta, el acceso se activará cuando se
        registre con ese email.
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
      {success && (
        <Alert severity="success" sx={{ mb: 2 }}>
          {success}
        </Alert>
      )}

      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={1}
        alignItems={{ xs: 'stretch', sm: 'center' }}
        sx={{ mb: 3 }}
      >
        <TextField
          label="Email del invitado"
          size="small"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          sx={{ minWidth: 220 }}
        />
        <FormControlLabel
          control={
            <Checkbox
              size="small"
              checked={inviteCanEdit}
              onChange={(e) => setInviteCanEdit(e.target.checked)}
            />
          }
          label="Crear/Editar"
        />
        <FormControlLabel
          control={
            <Checkbox
              size="small"
              checked={inviteCanDelete}
              onChange={(e) => setInviteCanDelete(e.target.checked)}
            />
          }
          label="Eliminar"
        />
        <Button
          variant="contained"
          size="small"
          startIcon={<PersonAddIcon />}
          onClick={handleInvite}
          disabled={loading || !email.trim()}
        >
          Invitar
        </Button>
      </Stack>

      <TableContainer sx={{ overflowX: 'auto' }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Miembro</TableCell>
              <TableCell>Estado</TableCell>
              <TableCell align="center">Crear/Editar</TableCell>
              <TableCell align="center">Eliminar</TableCell>
              <TableCell align="center">Acceso activo</TableCell>
              <TableCell align="center">Revocar</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {members.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} align="center">
                  <Typography variant="body2" color="text.secondary">
                    Aún no has invitado a nadie
                  </Typography>
                </TableCell>
              </TableRow>
            ) : (
              members.map((m) => (
                <TableRow key={m.id}>
                  <TableCell>
                    <Typography variant="body2">
                      {m.memberName || m.invitedEmail}
                    </Typography>
                    {m.memberName && (
                      <Typography variant="caption" color="text.secondary">
                        {m.invitedEmail}
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell>
                    <Chip
                      size="small"
                      label={m.status === 'linked' ? 'Vinculado' : 'Pendiente'}
                      color={m.status === 'linked' ? 'success' : 'warning'}
                      variant="outlined"
                    />
                  </TableCell>
                  <TableCell align="center">
                    <Switch
                      size="small"
                      checked={m.canEdit}
                      onChange={(e) => handleUpdate(m, { canEdit: e.target.checked })}
                      inputProps={{ 'aria-label': 'Permiso crear/editar' }}
                    />
                  </TableCell>
                  <TableCell align="center">
                    <Switch
                      size="small"
                      checked={m.canDelete}
                      onChange={(e) => handleUpdate(m, { canDelete: e.target.checked })}
                      inputProps={{ 'aria-label': 'Permiso eliminar' }}
                    />
                  </TableCell>
                  <TableCell align="center">
                    <Switch
                      size="small"
                      color="success"
                      checked={m.isActive}
                      onChange={(e) => handleUpdate(m, { isActive: e.target.checked })}
                      inputProps={{ 'aria-label': 'Acceso activo' }}
                    />
                  </TableCell>
                  <TableCell align="center">
                    <Button
                      size="small"
                      color="error"
                      startIcon={<DeleteOutlineIcon />}
                      onClick={() => handleRevoke(m)}
                    >
                      Revocar
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
};

export default SpaceMembersSettings;
