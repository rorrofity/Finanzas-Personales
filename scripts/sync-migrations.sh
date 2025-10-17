#!/bin/bash
# Script para sincronizar archivos de migración con el servidor

set -e

# Colores
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${BLUE}📋 Sincronizando Migraciones${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Verificar que estamos en el directorio correcto
if [ ! -d "backend/migrations" ]; then
  echo -e "${RED}✗ Error: No se encontró el directorio backend/migrations${NC}"
  echo "  Asegúrate de ejecutar este script desde la raíz del proyecto"
  exit 1
fi

# Copiar migraciones al servidor
echo "📤 Copiando archivos de migración al servidor..."
scp backend/migrations/*.sql root@137.184.12.234:/var/www/finanzas-personales/backend/migrations/

echo ""
echo -e "${GREEN}✓${NC} Migraciones sincronizadas"
echo ""

# Mostrar diferencias
echo "📊 Archivos de migración en el servidor:"
ssh root@137.184.12.234 'ls -lh /var/www/finanzas-personales/backend/migrations/*.sql | awk "{print \$9, \$5}"'

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${GREEN}✓ Sincronización completada${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "💡 Ahora puedes ejecutar:"
echo "   ./scripts/deploy-to-production.sh --fresh-db"
echo ""
