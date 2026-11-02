import React, { useCallback, useEffect, useState } from 'react';
import { Link as RouterLink, useNavigate, useLocation } from 'react-router-dom';
import { Alert, Box, Button, Container, Link, Paper, Stack, Typography } from '@mui/material';
import axios from '../config/axios';
import { useAuth } from '../contexts/AuthContext';
import { useSpace } from '../contexts/SpaceContext';
import { captureInvitation, clearInvitation } from '../services/invitation';

export default function AcceptInvitation() {
  const { isAuthenticated, user } = useAuth();
  const { refreshMemberships } = useSpace();
  const navigate = useNavigate();
  const location = useLocation();
  const [token, setToken] = useState(captureInvitation);
  const [invitation, setInvitation] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (window.location.hash) {
      setToken(captureInvitation()); setInvitation(null); setError('');
    }
  }, [location.hash]);
  const failure = useCallback(e => {
    if (e.response?.data?.code === 'SPACE_INVITATION_EMAIL_MISMATCH') {
      setError('Esta invitación corresponde a otro correo. Inicia sesión con el correo invitado y vuelve a revisar.');
    } else if (e.response?.status === 400 || e.response?.status === 404) {
      clearInvitation(); setToken(null);
      setError('Esta invitación venció, fue revocada o ya se utilizó. Pide un nuevo enlace al dueño del hogar.');
    } else setError('No se pudo consultar la invitación. Inténtalo nuevamente.');
  }, []);
  useEffect(() => {
    if (!isAuthenticated || !token) return undefined;
    let current = true;
    setLoading(true); setError(''); setInvitation(null);
    axios.post('/api/space/invitations/preview', { token }).then(({data}) => {
      if (current) setInvitation(data.invitation);
    }).catch(e => { if (current) failure(e); }).finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  // The token is scoped to this tab; identity changes require a new preview.
  }, [isAuthenticated, user?.id, user?.email, token, retry, failure]);
  async function accept() {
    if (!token || !invitation || loading) return;
    setLoading(true); setError('');
    try {
      const { data } = await axios.post('/api/space/invitations/accept', { token });
      clearInvitation(); setToken(null); setInvitation(null);
      await refreshMemberships(data.ownerId);
      navigate('/');
    } catch (e) { failure(e); }
    finally { setLoading(false); }
  }
  return <Container maxWidth="sm" sx={{ py: { xs: 3, sm: 6 } }}><Paper variant="outlined" sx={{p:{xs:2,sm:4},overflowWrap:'anywhere'}}>
    <Typography component="h1" variant="h5" fontWeight={700} gutterBottom>Invitación al hogar</Typography>
    {error && <Alert severity="warning" sx={{my:2}}>{error}</Alert>}
    {!token && !error && <Alert severity="info">Abre el enlace privado que te compartió el dueño del hogar. Si no lo tienes, pídele un nuevo enlace.</Alert>}
    {token && !isAuthenticated && <><Typography sx={{my:2}}>Inicia sesión o crea tu cuenta con el correo invitado para revisar y aceptar el acceso.</Typography><Stack direction={{xs:'column',sm:'row'}} spacing={2}><Link component={RouterLink} to="/login">Iniciar sesión</Link><Link component={RouterLink} to="/register">Crear cuenta</Link></Stack></>}
    {loading && <Typography role="status" sx={{my:2}}>Revisando invitación…</Typography>}
    {invitation && <Box sx={{my:2}}><Typography variant="h6">Hogar de {invitation.ownerName}</Typography><Typography sx={{mt:1}}>Cuenta invitada: {invitation.invitedEmail}</Typography><Typography sx={{mt:1}}>{!invitation.canEdit && !invitation.canDelete ? 'Acceso de solo lectura: podrás consultar los gastos, ingresos y dashboards del hogar.' : 'El dueño controla tus permisos de acceso a las finanzas del hogar.'}</Typography><Button fullWidth variant="contained" sx={{mt:3}} disabled={loading} onClick={accept}>Aceptar invitación</Button></Box>}
    {token && isAuthenticated && error && <Stack spacing={2} sx={{mt:2}}><Link component={RouterLink} to="/login">Iniciar sesión con otra cuenta</Link><Button disabled={loading} onClick={()=>setRetry(value=>value+1)}>Volver a revisar</Button></Stack>}
  </Paper></Container>;
}
