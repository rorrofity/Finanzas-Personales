const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const {
  getMemberships,
  getMembers,
  inviteMember,
  updateMember,
  removeMember,
} = require('../controllers/spaceController');

// NOTA: estas rutas NO usan resolveSpace a propósito — la administración de
// miembros siempre opera sobre el espacio propio del autenticado (Req 11.10)
// y no es delegable con X-Space-Owner.
router.use(auth);

router.get('/memberships', getMemberships);
router.get('/members', getMembers);
router.post('/members', inviteMember);
router.put('/members/:id', updateMember);
router.delete('/members/:id', removeMember);

module.exports = router;
