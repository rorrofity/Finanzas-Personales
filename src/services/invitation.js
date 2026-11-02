const KEY = 'householdInvitation';
const valid = value => typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value);
export function getInvitationToken() {
  try { const value=sessionStorage.getItem(KEY); return valid(value)?value:null; } catch (_) { return null; }
}
export function clearInvitation() { try { sessionStorage.removeItem(KEY); } catch (_) { /* Tab storage may be unavailable. */ } }
export function captureInvitation() {
  const fragment = new URLSearchParams(window.location.hash.slice(1));
  const value = fragment.get('token');
  if (window.location.hash || window.location.search) {
    window.history.replaceState(window.history.state, '', window.location.pathname);
    if (valid(value)) {
      try { sessionStorage.setItem(KEY,value); } catch (_) { /* Kept in page memory for this visit. */ }
      return value;
    }
    clearInvitation();
    return null;
  }
  return getInvitationToken();
}
