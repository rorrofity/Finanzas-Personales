const spaceMember = require('../models/SpaceMember');

/**
 * Resuelve el espacio activo de la petición (Epic 11, principio ACL-001).
 *
 * Debe montarse SIEMPRE después de `auth`. Lee el header `X-Space-Owner`:
 *  - Ausente o igual al usuario autenticado → espacio propio, permisos plenos.
 *  - Distinto → valida en BD la membresía activa (por request, nunca cacheada
 *    ni embebida en el JWT). Sin membresía → 403.
 *
 * Al operar sobre un espacio ajeno, `req.user.id` se REESCRIBE al id del
 * dueño: así todos los controllers existentes consultan los datos del espacio
 * sin cambios. La persona real queda en `req.actorId` (auditoría) y los
 * permisos efectivos en `req.spacePerms`.
 */
const resolveSpace = async (req, res, next) => {
  try {
    const actorId = req.user.id;
    req.actorId = actorId;

    const requestedOwner = req.header('X-Space-Owner');

    if (!requestedOwner || requestedOwner === actorId) {
      req.spaceUserId = actorId;
      req.spacePerms = { isOwner: true, canEdit: true, canDelete: true };
      return next();
    }

    const membership = await spaceMember.findMembership(requestedOwner, actorId);
    if (!membership) {
      return res.status(403).json({
        error: 'No tienes acceso a este espacio',
        code: 'SPACE_FORBIDDEN',
      });
    }

    req.spaceUserId = requestedOwner;
    req.spacePerms = {
      isOwner: false,
      canEdit: membership.can_edit,
      canDelete: membership.can_delete,
    };
    // Los controllers existentes usan req.user.id como llave de datos.
    req.user = { ...req.user, id: requestedOwner };
    return next();
  } catch (error) {
    console.error('Error resolviendo espacio:', error);
    return res.status(500).json({ error: 'Error al resolver el espacio' });
  }
};

module.exports = { resolveSpace };
