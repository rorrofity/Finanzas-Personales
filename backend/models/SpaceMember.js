const db = require('../config/database');
const crypto = require('crypto');

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
    inviteExpiresAt: row.invite_expires_at ? new Date(row.invite_expires_at).toISOString() : null,
    acceptedAt: row.accepted_at ? new Date(row.accepted_at).toISOString() : null,
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

const invalidInvitation = () => Object.assign(new Error('La invitación no es válida o ya venció.'), { status: 400, code: 'SPACE_INVITATION_INVALID' });
const invitationError = (status, code, message) => Object.assign(new Error(message), { status, code });
const normalizeEmail = value => String(value || '').trim().toLowerCase();
const newToken = () => crypto.randomBytes(32).toString('base64url');
function tokenHash(token) {
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) throw invalidInvitation();
  return crypto.createHash('sha256').update(token).digest('hex');
}
async function transaction(operation) {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const result = await operation(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}

/** Always pending: an account/email alone does not authorize household access. */
async function create(ownerUserId, { email, canEdit = false, canDelete = false }) {
  const invitedEmail = normalizeEmail(email);
  const token = newToken(), hash = tokenHash(token);
  return transaction(async client => {
    // Serialize capacity checks for concurrent invitations from the same owner.
    const owner = (await client.query('SELECT id, email FROM users WHERE id=$1 FOR UPDATE', [ownerUserId])).rows[0];
    if (!owner || normalizeEmail(owner.email) === invitedEmail) {
      throw invitationError(400, 'SPACE_INVITATION_SELF', 'No puedes invitarte a ti mismo.');
    }
    const duplicate = await client.query('SELECT id FROM space_members WHERE owner_user_id=$1 AND LOWER(invited_email)=$2', [ownerUserId, invitedEmail]);
    if (duplicate.rows.length) throw invitationError(409, 'SPACE_INVITATION_DUPLICATE', 'Ese email ya está invitado a tu espacio.');
    const count = (await client.query('SELECT COUNT(*)::int AS count FROM space_members WHERE owner_user_id=$1', [ownerUserId])).rows[0].count;
    if (count >= MAX_MEMBERS_PER_SPACE) throw invitationError(400, 'SPACE_MEMBER_LIMIT', 'Máximo dos miembros por espacio.');
    const row = (await client.query(`INSERT INTO space_members
      (owner_user_id, invited_email, can_edit, can_delete, invite_token_hash, invite_expires_at, status, member_user_id)
      VALUES($1,$2,$3,$4,$5,NOW()+INTERVAL '7 days','pending',NULL) RETURNING *`,
    [ownerUserId, invitedEmail, !!canEdit, !!canDelete, hash])).rows[0];
    return { member: toApi(row), token };
  });
}

const invitationSelect = `SELECT sm.*, owner.nombre AS owner_name, actor.email AS actor_email
  FROM space_members sm JOIN users owner ON owner.id=sm.owner_user_id
  JOIN users actor ON actor.id=$2
  WHERE sm.invite_token_hash=$1 AND sm.status='pending' AND sm.is_active=true
    AND sm.invite_expires_at > NOW() AND sm.owner_user_id <> actor.id`;
function matchingInvitation(row) {
  if (!row) throw invalidInvitation();
  if (normalizeEmail(row.actor_email) !== normalizeEmail(row.invited_email)) {
    throw invitationError(403, 'SPACE_INVITATION_EMAIL_MISMATCH', 'Inicia sesión con el correo al que se dirigió la invitación.');
  }
  return row;
}
async function previewInvitation(actorId, token) {
  const row = matchingInvitation((await db.query(invitationSelect, [tokenHash(token), actorId])).rows[0]);
  return { ownerName: row.owner_name, invitedEmail: row.invited_email,
    expiresAt: new Date(row.invite_expires_at).toISOString(), canEdit: row.can_edit, canDelete: row.can_delete };
}
async function acceptInvitation(actorId, token) {
  const hash = tokenHash(token);
  return transaction(async client => {
    const row = matchingInvitation((await client.query(invitationSelect + ' FOR UPDATE OF sm', [hash, actorId])).rows[0]);
    const updated = await client.query(`UPDATE space_members SET member_user_id=$2,status='linked',
      invite_token_hash=NULL,invite_expires_at=NULL,accepted_at=NOW()
      WHERE id=$1 AND invite_token_hash=$3 AND status='pending' AND is_active=true
        AND invite_expires_at > NOW() RETURNING *`, [row.id, actorId, hash]);
    if (updated.rowCount !== 1) throw invalidInvitation();
    return { member: toApi(updated.rows[0]), ownerId: row.owner_user_id };
  });
}
async function renewInvitation(ownerId, membershipId) {
  const token = newToken(), hash = tokenHash(token);
  return transaction(async client => {
    const result = await client.query(`UPDATE space_members
      SET invite_token_hash=$3,invite_expires_at=NOW()+INTERVAL '7 days'
      WHERE owner_user_id=$1 AND id=$2 AND status='pending' AND is_active=true RETURNING *`,
    [ownerId, membershipId, hash]);
    if (result.rowCount !== 1) throw invalidInvitation();
    return { member: toApi(result.rows[0]), token };
  });
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
  previewInvitation,
  acceptInvitation,
  renewInvitation,
};
