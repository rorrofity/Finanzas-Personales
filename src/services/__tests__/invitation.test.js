import { captureInvitation, clearInvitation, getInvitationToken } from '../invitation';
const token='a'.repeat(43);
beforeEach(()=>{sessionStorage.clear();window.history.replaceState(null,'','/invite');});
test('captura solo token válido del fragmento y lo retira de la URL sin usar localStorage',()=>{const spy=jest.spyOn(Storage.prototype,'setItem');window.history.replaceState(null,'','/invite#token='+token);expect(captureInvitation()).toBe(token);expect(window.location.hash).toBe('');expect(getInvitationToken()).toBe(token);expect(localStorage.getItem('householdInvitation')).toBeNull();spy.mockRestore();});
test('descarta fragmentos inválidos y no acepta token en query',()=>{window.history.replaceState(null,'','/invite?token='+token+'#token=invalid');expect(captureInvitation()).toBeNull();expect(getInvitationToken()).toBeNull();expect(window.location.search).toBe('');});
test('limpia el token al finalizar o salir',()=>{window.history.replaceState(null,'','/invite#token='+token);captureInvitation();clearInvitation();expect(getInvitationToken()).toBeNull();});
