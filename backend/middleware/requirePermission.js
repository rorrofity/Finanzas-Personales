/**
 * Guards de permisos del espacio compartido (Epic 11).
 * Requieren `resolveSpace` ejecutado antes (req.spacePerms presente).
 */

const forbidden = (res, message) =>
  res.status(403).json({ error: message, code: 'SPACE_PERMISSION_DENIED' });

/** Crear/editar/importar/categorizar (Req 11.6). */
const requireEdit = (req, res, next) => {
  if (!req.spacePerms?.canEdit) {
    return forbidden(res, 'Sin permiso de edición en este espacio');
  }
  next();
};

/** Eliminar, individual o bulk (Req 11.7). */
const requireDelete = (req, res, next) => {
  if (!req.spacePerms?.canDelete) {
    return forbidden(res, 'Sin permiso de eliminación en este espacio');
  }
  next();
};

/** Operaciones exclusivas del dueño: sync N8N, config, miembros (Req 11.9/11.10). */
const requireOwner = (req, res, next) => {
  if (!req.spacePerms?.isOwner) {
    return forbidden(res, 'Solo el dueño del espacio puede realizar esta acción');
  }
  next();
};

/**
 * Resolver duplicados sospechosos: si la acción elimina una transacción
 * requiere can_delete; mantener ambas requiere can_edit.
 */
const requireResolve = (req, res, next) => {
  const p = req.spacePerms || {};
  if (req.body?.action === 'delete' ? !p.canDelete : !p.canEdit) {
    return forbidden(
      res,
      req.body?.action === 'delete'
        ? 'Sin permiso de eliminación en este espacio'
        : 'Sin permiso de edición en este espacio'
    );
  }
  next();
};

module.exports = { requireEdit, requireDelete, requireOwner, requireResolve };
