# 🛠️ Scripts de Deployment

Scripts automatizados para garantizar deployments confiables a producción.

## 🚀 Uso Rápido

### Deployment Normal
```bash
./scripts/deploy-to-production.sh
```

### Deployment con DB Fresca
```bash
./scripts/deploy-to-production.sh --fresh-db
```

### Sincronizar Migraciones
```bash
./scripts/sync-migrations.sh
```

## 📖 Documentación Completa

Ver [DEPLOYMENT_PROCESS.md](../DEPLOYMENT_PROCESS.md) para documentación detallada.

## ⚠️ IMPORTANTE

Antes del primer uso:

1. **Sincroniza las migraciones:**
   ```bash
   ./scripts/sync-migrations.sh
   ```

2. **Recrea la base de datos:**
   ```bash
   ./scripts/deploy-to-production.sh --fresh-db
   ```

Esto garantiza que los ambientes local y producción estén 100% sincronizados.
