const spaceMember = require('../models/SpaceMember');
const userModel = require('../models/User');
const db = require('../config/database');

/**
 * Controller del espacio compartido (Epic 11).
 * La administración de miembros SIEMPRE opera sobre el espacio del usuario
 * autenticado real (req.actorId si existe, si no req.user.id) — no es
 * delegable vía X-Space-Owner (Req 11.10).
 */

const ownId = (req) => req.actorId || req.user.id;

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
    if (!normalized || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
      return res.status(400).json({ error: 'Email inválido' });
    }

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

    const member = await spaceMember.create(userId, {
      email: normalized,
      canEdit,
      canDelete,
    });
    res.status(201).json({ member });
  } catch (error) {
    console.error('Error invitando miembro:', error);
    res.status(500).json({ error: 'Error al invitar miembro' });
  }
};

// PUT /api/space/members/:id — permisos / activar / desactivar (Req 11.8)
const updateMember = async (req, res) => {
  try {
    const { canEdit, canDelete, isActive } = req.body || {};
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

module.exports = { getMemberships, getMembers, inviteMember, updateMember, removeMember };
