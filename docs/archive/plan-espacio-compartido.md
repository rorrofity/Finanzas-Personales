# plan.md — Plan de Arquitectura Técnica: Espacio Compartido del Hogar (Epic 11)

> **Subordinación:** Este plan está subordinado a `constitution.md` (v1.1, innegociable) y a `spec.md` (v1.1.0, Epic 11). En caso de conflicto, la Constitución tiene prioridad absoluta.
>
> El plan de la épica PWA (completada y desplegada el 2026-07-18) está archivado en `archive/plan-pwa.md`.

---

## 1. Idea Central

**ACL sobre la cuenta del dueño.** Los datos financieros no se mueven: siguen colgando del `user_id` del dueño. Se agrega una capa de autorización:

```
Petición del frontend
  Authorization: Bearer <JWT>          → QUIÉN soy (AUTH-001)
  X-Space-Owner: <uuid del dueño>      → SOBRE QUÉ espacio opero (opcional)
        ↓
auth middleware (existente)            → req.user = persona autenticada
        ↓
resolveSpace middleware (NUEVO)        → consulta space_members en BD (ACL-001)
  - sin header o header == req.user.id → espacio propio, permisos plenos
  - header ≠ req.user.id              → busca membresía activa:
      · no existe / inactiva  → 403
      · existe                → req.spaceUserId = owner_id
                                req.spacePerms = {canEdit, canDelete, isOwner:false}
        ↓
Controllers: usan req.spaceUserId para TODAS las queries de datos
             usan req.user.id para created_by/updated_by (auditoría)
Guards por método: POST/PUT → canEdit · DELETE → canDelete · sync/config/members → isOwner
```

**Retrocompatibilidad total:** sin `X-Space-Owner`, el comportamiento es idéntico al actual (espacio propio). El usuario sin membresías no nota ningún cambio.

---

## 2. Backend

### 2.1 Migraciones (2 archivos nuevos, sin tocar datos existentes)

- `026_create_space_members.sql`: tabla `space_members` (ver spec §6.1) + índices por `owner_user_id`, `member_user_id`, `invited_email` + trigger `updated_at`.
- `027_add_audit_to_transactions.sql`: `ALTER TABLE transactions ADD COLUMN created_by UUID REFERENCES users(id), ADD COLUMN updated_by UUID REFERENCES users(id);` (nullable — histórico queda NULL).

### 2.2 Archivos nuevos

| Archivo | Responsabilidad |
|---|---|
| `backend/middleware/resolveSpace.js` | Resuelve espacio activo + permisos desde BD (ACL-001). Adjunta `req.spaceUserId`, `req.spacePerms`. |
| `backend/middleware/requirePermission.js` | Guards: `requireEdit`, `requireDelete`, `requireOwner`. |
| `backend/models/SpaceMember.js` | CRUD de membresías + `findMembership(owner, member)` + `linkPendingByEmail(email, userId)`. |
| `backend/controllers/spaceController.js` | memberships / members / invite / update / revoke (validaciones: máx 2, no auto-invitación, email duplicado 409). |
| `backend/routes/spaceRoutes.js` | `/api/space/*` (JWT). |

### 2.3 Cambios en código existente

- `server.js`: montar `spaceRoutes`; insertar `resolveSpace` en las cadenas de rutas de datos (transactions, dashboard, projected, categories, installments, intl-unbilled, checking, financial-health, billing, cards, suspicious).
- **Controllers de datos**: reemplazar `req.user.id` por `req.spaceUserId` en queries (cambio mecánico, uno por uno con su prueba). En `create/update` de transacciones: setear `created_by`/`updated_by = req.user.id`.
- Rutas de escritura: agregar `requireEdit`/`requireDelete` según método. `syncRoutes` (sync-emails), `cardRoutes`, `billingRoutes` (config) y `spaceRoutes` (admin): `requireOwner`.
- `authController.register` + login Google: al crear/loguear usuario, llamar `linkPendingByEmail` (Req 11.2).

---

## 3. Frontend

### 3.1 Archivos nuevos

| Archivo | Responsabilidad |
|---|---|
| `src/contexts/SpaceContext.jsx` | Estado del espacio activo (`{ownerId, ownerName, isOwner, canEdit, canDelete}`), carga `GET /api/space/memberships`, persiste selección en localStorage (por usuario), expone `switchSpace()`. Maneja 403 → volver a espacio propio con aviso (Req borde). |
| `src/components/SpaceSwitcher.jsx` | Selector en `DashboardLayout` (drawer/appbar). Solo visible con >1 espacio (Req 11.13). |
| `src/components/SpaceMembersSettings.jsx` | Sección en Settings (solo dueño): invitar, toggles de permisos, activar/desactivar, revocar. |
| `src/components/CreatedByChip.jsx` | Indicador discreto de quién registró (Req 11.12; visible solo si el espacio tiene >1 participante). |

### 3.2 Cambios en código existente

- `src/services/api.js` (axios): interceptor agrega `X-Space-Owner` cuando el espacio activo no es el propio; ante respuesta 403 de espacio → evento para SpaceContext.
- **Gating de UI por permisos**: patrón existente de offline se extiende — `disabled = isOffline || !canWrite` con tooltip ("Requiere conexión" / "Sin permiso de edición"). Aplica a: Nueva/Importar/Editar/Eliminar/selects inline en todas las páginas de datos.
- `SyncButton`: `disabled` si `!isOwner` (tooltip "Solo el dueño del espacio puede sincronizar").
- Settings: tarjetas y período de facturación ocultos/solo-lectura para miembros (Req 11.10); nueva sección de miembros para el dueño.
- `src/services/readCache.js`: **llave del caché prefijada por espacio activo** (`${ownerId}::${endpoint}`) (Req 11.14); `clearReadCache()` invocado en logout (Req 11.15, en `AuthContext.logout`).
- Refetch de datos al cambiar de espacio (mismo mecanismo que el refresh al reconectar).

---

## 4. Seguridad (mapa de decisiones)

| Riesgo | Mitigación |
|---|---|
| Permiso revocado pero token vigente | ACL-001: permisos SIEMPRE desde BD por request; JWT solo identifica |
| Escalada horizontal (leer espacio ajeno) | `resolveSpace` es la ÚNICA puerta; sin membresía activa → 403; tests de autorización por endpoint |
| Fuga de datos en caché offline compartiendo dispositivo | readCache llaveado por espacio + limpieza en logout |
| Miembro dispara lectura del Gmail del dueño | sync-emails con `requireOwner` |
| Config alterada por miembro (tarjetas/período) | `requireOwner` en cardRoutes/billingRoutes |
| Invitación a email equivocado | El dueño ve estado `pending` + email exacto en Settings y puede revocar antes del registro |

---

## 5. Estrategia de Pruebas (TEST-001)

| Capa | Herramienta | Qué cubre |
|---|---|---|
| **API de autorización** (nueva) | Playwright `request` (`tests/api/`) contra backend local con 2 usuarios de prueba | Matriz de permisos: owner/miembro activo/inactivo/sin can_edit/sin can_delete × GET/POST/PUT/DELETE → 200/403; invitaciones (máx 2, duplicado 409, auto-invitación 400); efecto inmediato de toggles |
| Unit frontend | Jest + RTL | SpaceContext (cambio de espacio, manejo 403), gating de botones por permisos, readCache con namespace por espacio |
| E2E UI | Playwright | Flujo completo: dueño invita → miembro ve espacio "Hogar" → edita con permiso → pierde permiso y la UI se degrada → switcher persiste; regresión de usuario sin membresías (UX intacta) |

Usuarios E2E: `e2e@test.local` (dueño, existente) + `e2e.partner@test.local` (miembro, nuevo).

---

## 6. Fases de Implementación (resumen; detalle en `tasks.md`)

1. **Fase 0 — Infra de pruebas API**: carpeta `tests/api/`, seed de segundo usuario, helper de tokens.
2. **Fase 1 — Núcleo ACL backend**: migraciones + `resolveSpace` + guards + `spaceController` (TDD por endpoint).
3. **Fase 2 — Adopción en controllers de datos**: `req.spaceUserId` en cada controller + auditoría created_by/updated_by (TDD: matriz de permisos por recurso).
4. **Fase 3 — Frontend**: SpaceContext + interceptor + switcher + Settings de miembros + gating de permisos + CreatedByChip.
5. **Fase 4 — PWA/caché y bordes**: namespace de readCache, limpieza en logout, manejo de 403 en vivo, E2E integral.
6. **Fase 5 — Auditoría, deploy y walkthrough**: suite completa, deploy al droplet (proceso de `archive/tasks-pwa.md` Fase 5.6), verificación con 2 cuentas reales, walkthrough.

**Riesgo principal:** la Fase 2 toca todos los controllers. Mitigación: cambio mecánico y repetitivo, un controller por commit con su prueba de matriz de permisos en verde antes de pasar al siguiente; la ausencia de `X-Space-Owner` mantiene el comportamiento actual (regresión cubierta por la suite E2E existente).

---

*Versión: 2.0.0 (épica Espacio Compartido)*
*Última actualización: 2026-07-18*
