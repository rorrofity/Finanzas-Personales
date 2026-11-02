const spaceMember = require('../models/SpaceMember');
const db = require('../config/database');

/**
 * Controller del espacio compartido (Epic 11).
 * La administración de miembros SIEMPRE opera sobre el espacio del usuario
 * autenticado real (req.actorId si existe, si no req.user.id) — no es
 * delegable vía X-Space-Owner (Req 11.10).
 */

const ownId = (req) => req.actorId || req.user.id;

function invitationBase() {
  let origin;
  try { origin = new URL(process.env.APP_PUBLIC_URL || 'https://finanzas.rocketflow.cl'); }
  catch (_) { throw Object.assign(new Error('Invitations unavailable'), { status: 503, code: 'SPACE_INVITATION_NOT_CONFIGURED' }); }
  const localHttp = process.env.NODE_ENV !== 'production' && origin.protocol === 'http:'
    && ['localhost', '127.0.0.1'].includes(origin.hostname);
  if ((origin.protocol !== 'https:' && !localHttp) || origin.username || origin.password
    || origin.pathname !== '/' || origin.search || origin.hash) {
    throw Object.assign(new Error('Invitations unavailable'), { status: 503, code: 'SPACE_INVITATION_NOT_CONFIGURED' });
  }
  return new URL('/invite', origin.origin).href;
}
function invitationUrl(token, base) { return base + '#token=' + token; }
function invitationFailure(res, error) {
  const code = error?.code;
  if (code === '23505') return res.status(409).json({ error: 'Ese email ya está invitado a tu espacio.', code: 'SPACE_INVITATION_DUPLICATE' });
  const messages = {
    SPACE_INVITATION_INVALID: 'La invitación no es válida o ya venció.',
    SPACE_INVITATION_NOT_CONFIGURED: 'Las invitaciones no están configuradas.',
    SPACE_INVITATION_EMAIL_MISMATCH: 'Inicia sesión con el correo al que se dirigió la invitación.',
    SPACE_INVITATION_SELF: 'No puedes invitarte a ti mismo.',
    SPACE_INVITATION_DUPLICATE: 'Ese email ya está invitado a tu espacio.',
    SPACE_MEMBER_LIMIT: 'Máximo dos miembros por espacio.',
  };
  if (messages[code] && [400, 403, 409, 503].includes(error.status)) return res.status(error.status).json({ error: messages[code], code });
  return res.status(500).json({ error: 'No se pudo completar la invitación.', code: 'SPACE_INVITATION_FAILED' });
}


// GET /api/space/memberships — espacios accesibles (Req 11.4)
const getMemberships = async (req, res) => {
  try {
    const userId = ownId(req);
    const me = await db.query(`SELECT id, nombre FROM users WHERE id = $1`, [userId]);
    const shared = await spaceMember.listSharedSpaces(userId);

    res.json({
      spaces: [
        {
          ownerId: userId,
          ownerName: me.rows[0]?.nombre || 'Mi espacio',
          isOwner: true,
          canEdit: true,
          canDelete: true,
        },
        ...shared,
      ],
    });
  } catch (error) {
    console.error('Error obteniendo memberships:', error);
    res.status(500).json({ error: 'Error al obtener espacios' });
  }
};

// GET /api/space/members — miembros de MI espacio
const getMembers = async (req, res) => {
  try {
    const members = await spaceMember.listByOwner(ownId(req));
    res.json({ members });
  } catch (error) {
    console.error('Error obteniendo miembros:', error);
    res.status(500).json({ error: 'Error al obtener miembros' });
  }
};

// POST /api/space/members — invitar (Reqs 11.1–11.3)
const inviteMember = async (req, res) => {
  try {
    const userId = ownId(req);
    const { email, canEdit = false, canDelete = false } = req.body || {};

    const normalized = String(email || '').trim().toLowerCase();
    if (!normalized || normalized.length > 100 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
      return res.status(400).json({ error: 'Email inválido' });
    }
    if (typeof canEdit !== 'boolean' || typeof canDelete !== 'boolean') {
      return res.status(400).json({ error: 'Los permisos deben ser valores booleanos.', code: 'SPACE_PERMISSION_INVALID' });
    }
    const publicBase = invitationBase();

    const me = await db.query(`SELECT email FROM users WHERE id = $1`, [userId]);
    if (me.rows[0]?.email?.toLowerCase() === normalized) {
      return res.status(400).json({ error: 'No puedes invitarte a ti mismo' });
    }

    const existing = await spaceMember.findByOwnerAndEmail(userId, normalized);
    if (existing) {
      return res.status(409).json({ error: 'Ese email ya está invitado a tu espacio' });
    }

    const count = await spaceMember.countByOwner(userId);
    if (count >= spaceMember.MAX_MEMBERS_PER_SPACE) {
      return res.status(400).json({
        error: `Máximo ${spaceMember.MAX_MEMBERS_PER_SPACE} miembros por espacio`,
      });
    }

    const created = await spaceMember.create(userId, {
      email: normalized,
      canEdit,
      canDelete,
    });
    res.status(201).json({ member: created.member, invitationUrl: invitationUrl(created.token, publicBase) });
  } catch (error) {
    return invitationFailure(res, error);
  }
};

// PUT /api/space/members/:id — permisos / activar / desactivar (Req 11.8)
const updateMember = async (req, res) => {
  try {
    const { canEdit, canDelete, isActive } = req.body || {};
    if ([canEdit, canDelete, isActive].some(value => value !== undefined && typeof value !== 'boolean')) {
      return res.status(400).json({ error: 'Los permisos deben ser valores booleanos.', code: 'SPACE_PERMISSION_INVALID' });
    }
    const member = await spaceMember.update(ownId(req), req.params.id, {
      canEdit,
      canDelete,
      isActive,
    });
    if (!member) {
      return res.status(404).json({ error: 'Membresía no encontrada en tu espacio' });
    }
    res.json({ member });
  } catch (error) {
    console.error('Error actualizando miembro:', error);
    res.status(500).json({ error: 'Error al actualizar miembro' });
  }
};

// DELETE /api/space/members/:id — revocar
const removeMember = async (req, res) => {
  try {
    const removed = await spaceMember.remove(ownId(req), req.params.id);
    if (!removed) {
      return res.status(404).json({ error: 'Membresía no encontrada en tu espacio' });
    }
    res.json({ ok: true });
  } catch (error) {
    console.error('Error revocando miembro:', error);
    res.status(500).json({ error: 'Error al revocar miembro' });
  }
};

const previewInvitation = async (req, res) => {
  try { return res.json({ invitation: await spaceMember.previewInvitation(ownId(req), req.body?.token) }); }
  catch (error) { return invitationFailure(res, error); }
};
const acceptInvitation = async (req, res) => {
  try { return res.json(await spaceMember.acceptInvitation(ownId(req), req.body?.token)); }
  catch (error) { return invitationFailure(res, error); }
};
const renewInvitation = async (req, res) => {
  try {
    const publicBase = invitationBase();
    const renewed = await spaceMember.renewInvitation(ownId(req), req.params.id);
    return res.json({ member: renewed.member, invitationUrl: invitationUrl(renewed.token, publicBase) });
  } catch (error) { return invitationFailure(res, error); }
};
module.exports = { getMemberships, getMembers, inviteMember, updateMember, removeMember, previewInvitation, acceptInvitation, renewInvitation };
