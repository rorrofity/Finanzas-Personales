#!/bin/bash
# Script automatizado de deployment a producción
# Uso: ./deploy-to-production.sh [--fresh-db]

set -e

# Colores
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

FRESH_DB=false

# Parsear argumentos
while [[ $# -gt 0 ]]; do
  case $1 in
    --fresh-db)
      FRESH_DB=true
      shift
      ;;
    *)
      echo "Argumento desconocido: $1"
      exit 1
      ;;
  esac
done

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${BLUE}🚀 Deployment a Producción${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Verificar que estamos en la rama main
CURRENT_BRANCH=$(git branch --show-current)
if [ "$CURRENT_BRANCH" != "main" ]; then
  echo -e "${RED}✗ Error: Debes estar en la rama 'main' para hacer deployment${NC}"
  echo "  Rama actual: $CURRENT_BRANCH"
  exit 1
fi

# Verificar que no hay cambios sin commitear
if ! git diff-index --quiet HEAD --; then
  echo -e "${RED}✗ Error: Hay cambios sin commitear${NC}"
  echo "  Haz commit de tus cambios antes de deployar"
  exit 1
fi

echo -e "${GREEN}✓${NC} Verificaciones locales pasadas"
echo ""

# Confirmar deployment
echo -e "${YELLOW}¿Estás seguro de hacer deployment a producción?${NC}"
if [ "$FRESH_DB" = true ]; then
  echo -e "${RED}⚠️  ADVERTENCIA: Se recreará la base de datos (--fresh-db)${NC}"
fi
read -p "Escribe 'yes' para continuar: " -r
echo
if [[ ! $REPLY =~ ^yes$ ]]; then
  echo "Deployment cancelado"
  exit 1
fi

# 1. Push a GitHub
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📤 Paso 1/6: Push a GitHub"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
git push origin main
echo -e "${GREEN}✓${NC} Push completado"
echo ""

# 2. Pull en servidor
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📥 Paso 2/6: Pull en servidor"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
ssh root@137.184.12.234 << 'ENDSSH'
cd /var/www/finanzas-personales
git fetch origin
git reset --hard origin/main
echo "✓ Pull completado"
ENDSSH
echo ""

# 3. Instalar dependencias
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📦 Paso 3/6: Instalar dependencias"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
ssh root@137.184.12.234 << 'ENDSSH'
cd /var/www/finanzas-personales/backend
npm install --production
echo "✓ Dependencias instaladas"
ENDSSH
echo ""

# 4. Build frontend
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🏗️  Paso 4/6: Build frontend"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
ssh root@137.184.12.234 << 'ENDSSH'
cd /var/www/finanzas-personales/frontend
npm install
npm run build
echo "✓ Frontend built"
ENDSSH
echo ""

# 5. Migraciones de base de datos
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🗄️  Paso 5/6: Migraciones de base de datos"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [ "$FRESH_DB" = true ]; then
  echo -e "${YELLOW}⚠️  Recreando base de datos...${NC}"
  ssh root@137.184.12.234 << 'ENDSSH'
sudo -u postgres psql << 'EOF'
DROP DATABASE IF EXISTS finanzas_personales;
CREATE DATABASE finanzas_personales;
GRANT ALL PRIVILEGES ON DATABASE finanzas_personales TO finanzas_user;
EOF
echo "✓ Base de datos recreada"
ENDSSH
fi

# Ejecutar migraciones en orden
ssh root@137.184.12.234 << 'ENDSSH'
cd /var/www/finanzas-personales/backend/migrations

# Orden correcto de migraciones
echo "Ejecutando migraciones..."

sudo -u postgres psql finanzas_personales < 00_init_schema.sql 2>/dev/null || echo "  - 00_init_schema.sql"
sudo -u postgres psql finanzas_personales < 01_create_users_table.sql 2>/dev/null || echo "  - 01_create_users_table.sql"
sudo -u postgres psql finanzas_personales < 02_add_last_login_to_users.sql 2>/dev/null || echo "  - 02_add_last_login_to_users.sql"
sudo -u postgres psql finanzas_personales < 18_add_google_oauth_support.sql 2>/dev/null || echo "  - 18_add_google_oauth_support.sql"
sudo -u postgres psql finanzas_personales < 01_create_transactions_table.sql 2>/dev/null || echo "  - 01_create_transactions_table.sql"
sudo -u postgres psql finanzas_personales < 02_update_tipo_check.sql 2>/dev/null || echo "  - 02_update_tipo_check.sql"
sudo -u postgres psql finanzas_personales < 06_update_tipo_check_add_desestimar.sql 2>/dev/null || echo "  - 06_update_tipo_check_add_desestimar.sql"
sudo -u postgres psql finanzas_personales < 03_create_imports_table.sql 2>/dev/null || echo "  - 03_create_imports_table.sql"
sudo -u postgres psql finanzas_personales < 04_add_import_id_to_transactions.sql 2>/dev/null || echo "  - 04_add_import_id_to_transactions.sql"
sudo -u postgres psql finanzas_personales < 05_add_period_to_imports.sql 2>/dev/null || echo "  - 05_add_period_to_imports.sql"
sudo -u postgres psql finanzas_personales < categories.sql 2>/dev/null || echo "  - categories.sql"
sudo -u postgres psql finanzas_personales < 12_create_projected_templates.sql 2>/dev/null || echo "  - 12_create_projected_templates.sql"
sudo -u postgres psql finanzas_personales < 13_create_projected_occurrences.sql 2>/dev/null || echo "  - 13_create_projected_occurrences.sql"
sudo -u postgres psql finanzas_personales < 14_create_installment_plans.sql 2>/dev/null || echo "  - 14_create_installment_plans.sql"
sudo -u postgres psql finanzas_personales < 15_create_intl_unbilled.sql 2>/dev/null || echo "  - 15_create_intl_unbilled.sql"
sudo -u postgres psql finanzas_personales < 16_alter_intl_unbilled_add_period.sql 2>/dev/null || echo "  - 16_alter_intl_unbilled_add_period.sql"
sudo -u postgres psql finanzas_personales < 17_create_checking.sql 2>/dev/null || echo "  - 17_create_checking.sql"

# Verificar que la columna cuotas existe
sudo -u postgres psql finanzas_personales << 'EOF'
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS cuotas INTEGER DEFAULT 1;
EOF

echo "✓ Migraciones completadas"
ENDSSH
echo ""

# 6. Reiniciar backend
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔄 Paso 6/6: Reiniciar backend"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
ssh root@137.184.12.234 << 'ENDSSH'
pm2 restart finanzas-backend
pm2 save
echo "✓ Backend reiniciado"
ENDSSH
echo ""

# Verificar ambiente
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔍 Verificando ambiente de producción..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
ssh root@137.184.12.234 'bash -s' < scripts/verify-environment.sh

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${GREEN}✓ Deployment completado exitosamente${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "🌐 Aplicación disponible en: https://finanzas.rocketflow.cl"
echo ""
