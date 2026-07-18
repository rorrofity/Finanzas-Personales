const db = require('../config/database');

/**
 * Modelo de membresías del espacio compartido (Epic 11).
 * Una fila = una invitación/membresía del espacio del dueño.
 */

const MAX_MEMBERS_PER_SPACE = 2;

const toApi = (row) =>
  row && {
    id: row.id,
    ownerUserId: row.owner_user_id,
    memberUserId: row.member_user_id,
    invitedEmail: row.invited_email,
    memberName: row.member_name || null,
    canEdit: row.can_edit,
    canDelete: row.can_delete,
    isActive: row.is_active,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };

/** Membresía activa de `memberUserId` en el espacio de `ownerUserId` (o null). */
async function findMembership(ownerUserId, memberUserId) {
  const result = await db.query(
    `SELECT * FROM space_members
     WHERE owner_user_id = $1 AND member_user_id = $2
       AND status = 'linked' AND is_active = true`,
    [ownerUserId, memberUserId]
  );
  return result.rows[0] || null;
}

/** Miembros/invitaciones del espacio del dueño (con nombre si está vinculado). */
async function listByOwner(ownerUserId) {
  const result = await db.query(
    `SELECT sm.*, u.nombre AS member_name
     FROM space_members sm
     LEFT JOIN users u ON u.id = sm.member_user_id
     WHERE sm.owner_user_id = $1
     ORDER BY sm.created_at`,
    [ownerUserId]
  );
  return result.rows.map(toApi);
}

/** Espacios compartidos accesibles para un usuario (membresías activas). */
async function listSharedSpaces(memberUserId) {
  const result = await db.query(
    `SELECT sm.*, o.nombre AS owner_name
     FROM space_members sm
     JOIN users o ON o.id = sm.owner_user_id
     WHERE sm.member_user_id = $1 AND sm.status = 'linked' AND sm.is_active = true
     ORDER BY sm.created_at`,
    [memberUserId]
  );
  return result.rows.map((row) => ({
    ownerId: row.owner_user_id,
    ownerName: row.owner_name,
    isOwner: false,
    canEdit: row.can_edit,
    canDelete: row.can_delete,
  }));
}

async function countByOwner(ownerUserId) {
  const result = await db.query(
    `SELECT COUNT(*)::int AS count FROM space_members WHERE owner_user_id = $1`,
    [ownerUserId]
  );
  return result.rows[0].count;
}

async function findByOwnerAndEmail(ownerUserId, email) {
  const result = await db.query(
    `SELECT * FROM space_members WHERE owner_user_id = $1 AND invited_email = $2`,
    [ownerUserId, email]
  );
  return result.rows[0] || null;
}

/**
 * Crea la invitación. Si el email ya tiene cuenta, queda `linked`;
 * si no, `pending` hasta que se registre (Req 11.1 / 11.2).
 */
async function create(ownerUserId, { email, canEdit, canDelete }) {
  const userResult = await db.query(`SELECT id FROM users WHERE email = $1`, [email]);
  const memberUserId = userResult.rows[0]?.id || null;
  const status = memberUserId ? 'linked' : 'pending';

  const result = await db.query(
    `INSERT INTO space_members
       (owner_user_id, member_user_id, invited_email, can_edit, can_delete, status)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [ownerUserId, memberUserId, email, !!canEdit, !!canDelete, status]
  );
  return toApi(result.rows[0]);
}

/** Actualiza permisos/estado. Solo dentro del espacio del dueño indicado. */
async function update(ownerUserId, membershipId, { canEdit, canDelete, isActive }) {
  const result = await db.query(
    `UPDATE space_members SET
       can_edit = COALESCE($3, can_edit),
       can_delete = COALESCE($4, can_delete),
       is_active = COALESCE($5, is_active)
     WHERE id = $2 AND owner_user_id = $1
     RETURNING *`,
    [ownerUserId, membershipId, canEdit ?? null, canDelete ?? null, isActive ?? null]
  );
  return toApi(result.rows[0]);
}

/** Revoca (elimina) la membresía. Solo dentro del espacio del dueño. */
async function remove(ownerUserId, membershipId) {
  const result = await db.query(
    `DELETE FROM space_members WHERE id = $2 AND owner_user_id = $1 RETURNING id`,
    [ownerUserId, membershipId]
  );
  return result.rows[0] || null;
}

/**
 * Vincula invitaciones `pending` cuando el email se registra (Req 11.2).
 * Se invoca desde register y desde el alta por Google OAuth.
 */
async function linkPendingByEmail(email, userId) {
  await db.query(
    `UPDATE space_members
     SET member_user_id = $2, status = 'linked'
     WHERE invited_email = $1 AND status = 'pending' AND owner_user_id <> $2`,
    [email, userId]
  );
}

module.exports = {
  MAX_MEMBERS_PER_SPACE,
  findMembership,
  listByOwner,
  listSharedSpaces,
  countByOwner,
  findByOwnerAndEmail,
  create,
  update,
  remove,
  linkPendingByEmail,
};
