import React from 'react';
import {BrowserRouter,MemoryRouter} from 'react-router-dom';
import {act,render,screen,fireEvent,waitFor} from '@testing-library/react';
import axios from '../../config/axios';
import {useAuth} from '../../contexts/AuthContext';
import {useSpace} from '../../contexts/SpaceContext';
import AcceptInvitation from '../AcceptInvitation';
jest.mock('../../config/axios',()=>({post:jest.fn()}));
jest.mock('../../contexts/AuthContext',()=>({useAuth:jest.fn()}));
jest.mock('../../contexts/SpaceContext',()=>({useSpace:jest.fn()}));
const token='a'.repeat(43),refresh=jest.fn().mockResolvedValue(),switchSpace=jest.fn();
beforeEach(()=>{jest.clearAllMocks();sessionStorage.clear();window.history.replaceState(null,'','/invite#token='+token);useAuth.mockReturnValue({isAuthenticated:true,user:{email:'pareja@example.com'},logout:jest.fn()});useSpace.mockReturnValue({refreshMemberships:refresh,switchSpace});axios.post.mockImplementation(path=>Promise.resolve({data:path.endsWith('/preview')?{invitation:{ownerName:'Rodrigo',invitedEmail:'pareja@example.com',canEdit:false,canDelete:false,expiresAt:'2030-01-01T00:00:00Z'}}:{ownerId:'owner',member:{id:'m'}}}));});
const mount=()=>render(<MemoryRouter><AcceptInvitation/></MemoryRouter>);
test('previsualiza sin aceptar y requiere confirmación explícita; después limpia token',async()=>{mount();expect(await screen.findByText(/Rodrigo/)).toBeInTheDocument();expect(axios.post).toHaveBeenCalledTimes(1);fireEvent.click(screen.getByRole('button',{name:'Aceptar invitación'}));await waitFor(()=>expect(axios.post).toHaveBeenCalledWith('/api/space/invitations/accept',{token}));expect(refresh).toHaveBeenCalledWith('owner');await waitFor(()=>expect(sessionStorage.getItem('householdInvitation')).toBeNull());});
test('sin autenticación ofrece entrar o crear cuenta sin consultar invitación',()=>{useAuth.mockReturnValue({isAuthenticated:false});mount();expect(screen.getByRole('link',{name:'Iniciar sesión'})).toHaveAttribute('href','/login');expect(screen.getByRole('link',{name:'Crear cuenta'})).toHaveAttribute('href','/register');expect(axios.post).not.toHaveBeenCalled();});
test('email distinto no acepta y muestra cómo cambiar de cuenta',async()=>{axios.post.mockRejectedValue({response:{status:403,data:{code:'SPACE_INVITATION_EMAIL_MISMATCH'}}});mount();expect(await screen.findByText(/correo.*invitado/i)).toBeInTheDocument();expect(screen.queryByRole('button',{name:'Aceptar invitación'})).not.toBeInTheDocument();expect(axios.post).toHaveBeenCalledTimes(1);});
test('invitación inválida o vencida se limpia y pide nuevo enlace',async()=>{axios.post.mockRejectedValue({response:{status:400,data:{code:'SPACE_INVITATION_INVALID'}}});mount();expect(await screen.findByText(/nuevo enlace/i)).toBeInTheDocument();expect(sessionStorage.getItem('householdInvitation')).toBeNull();});

test('abrir un enlace renovado en la misma pestaña reemplaza uno ya vencido',async()=>{axios.post.mockRejectedValueOnce({response:{status:400,data:{code:'SPACE_INVITATION_INVALID'}}}).mockResolvedValueOnce({data:{invitation:{ownerName:'Nuevo Hogar',invitedEmail:'pareja@example.com',canEdit:false,canDelete:false}}});render(<BrowserRouter><AcceptInvitation/></BrowserRouter>);await screen.findByText(/nuevo enlace/i);const fresh='b'.repeat(43);act(()=>{window.history.pushState(null,'','/invite#token='+fresh);window.dispatchEvent(new PopStateEvent('popstate'));});await screen.findByText('Hogar de Nuevo Hogar');expect(axios.post).toHaveBeenLastCalledWith('/api/space/invitations/preview',{token:fresh});expect(window.location.hash).toBe('');});
