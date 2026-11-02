const jwt = require('jsonwebtoken');

const auth = async (req, res, next) => {
  try {
    const header = req.header('Authorization');
    if (typeof header !== 'string' || !header.startsWith('Bearer ') || !header.slice(7)) {
      return res.status(401).json({ message: 'Debes iniciar sesión.' });
    }
    const decoded = jwt.verify(header.slice(7), process.env.JWT_SECRET, { algorithms: ['HS256'] });
    if (process.env.AUTH_SESSION_VERSION && decoded.sessionVersion !== process.env.AUTH_SESSION_VERSION) {
      return res.status(401).json({ message: 'Por seguridad, vuelve a iniciar sesión.', code: 'AUTH_SESSION_EXPIRED' });
    }
    req.user = decoded;
    return next();
  } catch (_) {
    return res.status(401).json({ message: 'Token inválido o expirado' });
  }
};

const generateToken = userId => jwt.sign(
  { id: userId, ...(process.env.AUTH_SESSION_VERSION ? { sessionVersion: process.env.AUTH_SESSION_VERSION } : {}) },
  process.env.JWT_SECRET,
  { expiresIn: '24h', algorithm: 'HS256' }
);
module.exports = { auth, generateToken };
