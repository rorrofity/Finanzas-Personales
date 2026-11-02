const { OAuth2Client } = require('google-auth-library');

const invalid = () => Object.assign(new Error('No se pudo verificar la identidad de Google.'), { status: 401, code: 'AUTH_GOOGLE_INVALID' });

/** Google verifies signature, audience, issuer and expiration before claims are used. */
function createGoogleIdentityVerifier({ env = process.env, client = new OAuth2Client(), now = () => Date.now() } = {}) {
  return async function verifyGoogleIdentity(credential) {
    const audience = env.GOOGLE_CLIENT_ID;
    if (typeof audience !== 'string' || !audience.trim() || audience.startsWith('your_')) {
      throw Object.assign(new Error('El acceso Google no está configurado.'), { status: 503, code: 'AUTH_GOOGLE_NOT_CONFIGURED' });
    }
    if (typeof credential !== 'string' || !credential || credential.length > 16384) throw invalid();
    let payload;
    try {
      const ticket = await client.verifyIdToken({ idToken: credential, audience });
      payload = ticket.getPayload();
    } catch (_) { throw invalid(); }
    const timestamp = now() / 1000;
    const email = typeof payload?.email === 'string' ? payload.email.trim().toLowerCase() : '';
    if (!payload || payload.aud !== audience || !['accounts.google.com', 'https://accounts.google.com'].includes(payload.iss)
      || !Number.isFinite(payload.exp) || payload.exp <= timestamp
      || !Number.isFinite(payload.iat) || payload.iat > timestamp + 300
      || typeof payload.sub !== 'string' || !payload.sub || payload.sub.length > 255
      || payload.email_verified !== true || email.length > 100 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw invalid();
    return { sub: payload.sub, email, name: typeof payload.name === 'string' ? payload.name.slice(0, 100) : email.split('@')[0],
      picture: typeof payload.picture === 'string' && /^https:\/\//.test(payload.picture) ? payload.picture : null };
  };
}
let verifier;
module.exports = { createGoogleIdentityVerifier, verifyGoogleIdentity: credential => {
  if (!verifier) verifier = createGoogleIdentityVerifier();
  return verifier(credential);
} };
