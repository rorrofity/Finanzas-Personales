#!/bin/bash
# Script para verificar que el ambiente de producción está correcto

set -e

echo "🔍 Verificando ambiente de producción..."
echo ""

# Colores
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

ERRORS=0

# 1. Verificar estructura de base de datos
echo "📊 Verificando estructura de base de datos..."

# Verificar tabla transactions
TRANSACTIONS_COLS=$(sudo -u postgres psql -d finanzas_personales -t -c "SELECT COUNT(*) FROM information_schema.columns WHERE table_name='transactions';")
if [ "$TRANSACTIONS_COLS" -eq 12 ]; then
  echo -e "${GREEN}✓${NC} Tabla transactions tiene 12 columnas"
else
  echo -e "${RED}✗${NC} Tabla transactions tiene $TRANSACTIONS_COLS columnas (esperadas: 12)"
  ERRORS=$((ERRORS + 1))
fi

# Verificar columna cuotas existe
CUOTAS_EXISTS=$(sudo -u postgres psql -d finanzas_personales -t -c "SELECT COUNT(*) FROM information_schema.columns WHERE table_name='transactions' AND column_name='cuotas';")
if [ "$CUOTAS_EXISTS" -eq 1 ]; then
  echo -e "${GREEN}✓${NC} Columna 'cuotas' existe en transactions"
else
  echo -e "${RED}✗${NC} Columna 'cuotas' NO existe en transactions"
  ERRORS=$((ERRORS + 1))
fi

# Verificar columna category_id existe
CATEGORY_ID_EXISTS=$(sudo -u postgres psql -d finanzas_personales -t -c "SELECT COUNT(*) FROM information_schema.columns WHERE table_name='transactions' AND column_name='category_id';")
if [ "$CATEGORY_ID_EXISTS" -eq 1 ]; then
  echo -e "${GREEN}✓${NC} Columna 'category_id' existe en transactions"
else
  echo -e "${RED}✗${NC} Columna 'category_id' NO existe en transactions"
  ERRORS=$((ERRORS + 1))
fi

# 2. Verificar tablas necesarias
echo ""
echo "📋 Verificando tablas requeridas..."

REQUIRED_TABLES=(
  "users"
  "transactions"
  "categories"
  "imports"
  "checking_balances"
  "checking_transactions"
  "projected_templates"
  "projected_occurrences"
  "installment_plans"
  "installment_occurrences"
  "intl_unbilled"
)

for table in "${REQUIRED_TABLES[@]}"; do
  TABLE_EXISTS=$(sudo -u postgres psql -d finanzas_personales -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public' AND table_name='$table';")
  if [ "$TABLE_EXISTS" -eq 1 ]; then
    echo -e "${GREEN}✓${NC} Tabla '$table' existe"
  else
    echo -e "${RED}✗${NC} Tabla '$table' NO existe"
    ERRORS=$((ERRORS + 1))
  fi
done

# 3. Verificar archivos del backend
echo ""
echo "📁 Verificando archivos del backend..."

REQUIRED_FILES=(
  "backend/server.js"
  "backend/package.json"
  "backend/.env"
  "backend/config/database.js"
)

for file in "${REQUIRED_FILES[@]}"; do
  if [ -f "/var/www/finanzas-personales/$file" ]; then
    echo -e "${GREEN}✓${NC} Archivo '$file' existe"
  else
    echo -e "${RED}✗${NC} Archivo '$file' NO existe"
    ERRORS=$((ERRORS + 1))
  fi
done

# 4. Verificar que PM2 está corriendo
echo ""
echo "🔄 Verificando servicios..."

PM2_RUNNING=$(pm2 list | grep -c "finanzas-backend" || echo "0")
if [ "$PM2_RUNNING" -gt 0 ]; then
  echo -e "${GREEN}✓${NC} Backend corriendo en PM2"
else
  echo -e "${RED}✗${NC} Backend NO está corriendo en PM2"
  ERRORS=$((ERRORS + 1))
fi

# 5. Verificar Git
echo ""
echo "🔀 Verificando Git..."

cd /var/www/finanzas-personales
CURRENT_BRANCH=$(git branch --show-current)
CURRENT_COMMIT=$(git log -1 --oneline)

echo -e "${GREEN}✓${NC} Branch actual: $CURRENT_BRANCH"
echo -e "${GREEN}✓${NC} Commit actual: $CURRENT_COMMIT"

# 6. Resumen final
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if [ $ERRORS -eq 0 ]; then
  echo -e "${GREEN}✓ Ambiente de producción está correcto${NC}"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  exit 0
else
  echo -e "${RED}✗ Se encontraron $ERRORS errores${NC}"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  exit 1
fi
