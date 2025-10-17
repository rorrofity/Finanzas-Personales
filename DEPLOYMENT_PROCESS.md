# 🚀 Proceso de Deployment a Producción

Este documento describe el proceso **automatizado y confiable** para deployar la aplicación de finanzas personales a producción.

## 📋 Pre-requisitos

- [ ] Todos los cambios están commiteados
- [ ] Estás en la rama `main`
- [ ] Los tests pasan localmente (si aplica)
- [ ] Tienes acceso SSH al servidor

## 🔧 Scripts Disponibles

### 1. `verify-environment.sh`
Verifica que el ambiente de producción esté correcto.

```bash
# Ejecutar en el servidor
bash scripts/verify-environment.sh
```

**Verifica:**
- ✅ Estructura de base de datos (12 columnas en `transactions`)
- ✅ Todas las tablas necesarias existen
- ✅ Archivos del backend están presentes
- ✅ PM2 está corriendo
- ✅ Estado de Git

### 2. `sync-migrations.sh`
Sincroniza los archivos de migración desde local al servidor.

```bash
# Ejecutar localmente
./scripts/sync-migrations.sh
```

**Uso:** Solo cuando hayas modificado archivos de migración y necesites actualizarlos en el servidor.

### 3. `deploy-to-production.sh`
Script principal de deployment automatizado.

```bash
# Deployment normal (mantiene datos)
./scripts/deploy-to-production.sh

# Deployment con base de datos fresca
./scripts/deploy-to-production.sh --fresh-db
```

## 📝 Proceso de Deployment

### Opción A: Deployment Normal (Mantener Datos)

```bash
# 1. Asegúrate de estar en main con cambios commiteados
git status

# 2. Ejecutar deployment
./scripts/deploy-to-production.sh
```

**Pasos que ejecuta automáticamente:**
1. ✅ Push a GitHub
2. ✅ Pull en servidor
3. ✅ Instalar dependencias
4. ✅ Build frontend
5. ✅ Ejecutar migraciones (solo las nuevas)
6. ✅ Reiniciar backend
7. ✅ Verificar ambiente

### Opción B: Deployment con DB Fresca (Borrar Datos)

```bash
# ADVERTENCIA: Esto borrará TODOS los datos de la BD
./scripts/deploy-to-production.sh --fresh-db
```

**Uso:** Solo cuando:
- Primera instalación
- Cambios mayores en el schema
- Necesitas empezar desde cero

## 🔍 Verificación Post-Deployment

Después del deployment, verifica:

1. **Aplicación funciona:**
   ```bash
   curl https://finanzas.rocketflow.cl
   ```

2. **Backend responde:**
   ```bash
   curl https://finanzas.rocketflow.cl/api/health
   ```

3. **Base de datos está correcta:**
   ```bash
   ssh root@137.184.12.234
   bash scripts/verify-environment.sh
   ```

## 🐛 Troubleshooting

### Error: "Columna no existe"

**Problema:** La base de datos no tiene el schema correcto.

**Solución:**
```bash
# Sincronizar migraciones
./scripts/sync-migrations.sh

# Redeploy con DB fresca
./scripts/deploy-to-production.sh --fresh-db
```

### Error: "PM2 no está corriendo"

**Problema:** El backend se cayó.

**Solución:**
```bash
ssh root@137.184.12.234
pm2 restart finanzas-backend
pm2 logs finanzas-backend
```

### Error: "Build failed"

**Problema:** El frontend no compiló.

**Solución:**
```bash
# Verificar que compile localmente
cd frontend
npm run build

# Si funciona local, redeploy
./scripts/deploy-to-production.sh
```

## 📊 Orden de Migraciones

Las migraciones se ejecutan en este orden:

1. `00_init_schema.sql` - Schema inicial
2. `01_create_users_table.sql` - Tabla users
3. `02_add_last_login_to_users.sql` - Agregar last_login
4. `18_add_google_oauth_support.sql` - Google OAuth
5. `01_create_transactions_table.sql` - Tabla transactions (con cuotas)
6. `02_update_tipo_check.sql` - Actualizar tipos
7. `06_update_tipo_check_add_desestimar.sql` - Agregar desestimar
8. `03_create_imports_table.sql` - Tabla imports
9. `04_add_import_id_to_transactions.sql` - FK import_id
10. `05_add_period_to_imports.sql` - Agregar período
11. `categories.sql` - Tabla categories y FK category_id
12. `12_create_projected_templates.sql` - Templates proyectados
13. `13_create_projected_occurrences.sql` - Occurrencias proyectadas
14. `14_create_installment_plans.sql` - Planes de cuotas
15. `15_create_intl_unbilled.sql` - Transacciones internacionales
16. `16_alter_intl_unbilled_add_period.sql` - Agregar período
17. `17_create_checking.sql` - Cuenta corriente

## 🔐 Seguridad

- ✅ Los scripts usan `set -e` para fallar rápido
- ✅ Confirmación requerida antes de deployment
- ✅ Verificación automática post-deployment
- ✅ Backup recomendado antes de `--fresh-db`

## 📞 Contacto

Si tienes problemas con el deployment, contacta al equipo de desarrollo.

---

**Última actualización:** 2025-10-17
