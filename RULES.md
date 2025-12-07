# Reglas y Contexto del Proyecto - Finanzas Personales

## Descripción General

Aplicación web de finanzas personales desarrollada en **React + Node.js/Express + PostgreSQL**. Permite al usuario gestionar sus finanzas mediante:

- **Tarjetas de crédito** nacionales e internacionales (facturadas y no facturadas)
- **Cuenta corriente** (Banco de Chile) con importación de cartolas Excel
- **Dashboard de salud financiera** con alertas y proyecciones
- **Sincronización automática** de transacciones desde emails bancarios (via n8n)
- **Categorización** de gastos
- **Detección de duplicados** sospechosos

---

## Arquitectura de Producción

```
┌─────────────────────────────────────────────────────────────────┐
│                    Digital Ocean Droplet                        │
│                 IP: 137.184.12.234 (2GB RAM)                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   ┌─────────────┐     ┌─────────────────────────────────────┐  │
│   │   Caddy     │────▶│  finanzas.rocketflow.cl (HTTPS)     │  │
│   │ (Puerto 80) │     │  → Backend Node.js (Puerto 3001)    │  │
│   │             │     │  → Sirve React estático en /        │  │
│   └─────────────┘     └─────────────────────────────────────┘  │
│         │                                                       │
│         │             ┌─────────────────────────────────────┐  │
│         └────────────▶│  rocketflow.cl (HTTPS)              │  │
│                       │  → N8N Docker (Puerto 5678)         │  │
│                       └─────────────────────────────────────┘  │
│                                                                 │
│   ┌─────────────────────────────────────────────────────────┐  │
│   │                    PostgreSQL                            │  │
│   │                 Base: finanzas_personales               │  │
│   └─────────────────────────────────────────────────────────┘  │
│                                                                 │
│   ┌─────────────────────────────────────────────────────────┐  │
│   │                    PM2 (Process Manager)                 │  │
│   │                 Proceso: finanzas-backend               │  │
│   └─────────────────────────────────────────────────────────┘  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### URLs
- **App de Finanzas**: https://finanzas.rocketflow.cl
- **N8N (Automatización)**: https://rocketflow.cl
- **IP Servidor**: 137.184.12.234

---

## Stack Tecnológico

### Frontend
- **React 18** con Create React App
- **Material UI (MUI)** para componentes
- **Axios** para llamadas API
- **Context API** para estado global (PeriodContext)

### Backend
- **Node.js + Express**
- **PostgreSQL** como base de datos
- **JWT** para autenticación
- **Multer** para upload de archivos
- **XLSX** para parseo de archivos Excel

### Automatización
- **N8N** corriendo en Docker para workflows de sincronización
- Integración con Gmail API para leer emails bancarios
- Webhooks internos entre backend y n8n

---

## Estructura del Proyecto

```
/Users/rpizarro/CascadeProjects/Finanzas-Personales/
├── backend/
│   ├── controllers/       # Lógica de negocio
│   ├── models/            # Acceso a datos (PostgreSQL)
│   ├── routes/            # Endpoints API
│   ├── middleware/        # Auth, etc.
│   ├── migrations/        # Scripts SQL
│   └── server.js          # Entry point
├── src/
│   ├── components/        # Componentes React reutilizables
│   ├── pages/             # Páginas principales
│   ├── contexts/          # Context providers
│   └── services/          # Servicios API
├── public/
└── build/                 # Build de producción (generado)
```

---

## Flujo de Despliegue

### IMPORTANTE: Trabajamos directamente en producción

Por decisión del usuario, no hay ambiente de staging. Los cambios se prueban directamente en producción para agilizar el desarrollo.

### Comando de Deploy Estándar

```bash
# 1. Commit local
git add -A && git commit -m "tipo: descripción del cambio"

# 2. Push a GitHub
git push origin main

# 3. Deploy en servidor
ssh root@137.184.12.234 "cd /var/www/finanzas-personales && git pull origin main && npm run build && pm2 restart finanzas-backend"
```

### Si hay migraciones de BD

```bash
ssh root@137.184.12.234 "cd /var/www/finanzas-personales && git pull origin main && sudo -u postgres psql -d finanzas_personales -f backend/migrations/XX_nombre.sql && npm run build && pm2 restart finanzas-backend"
```

### Convención de Commits

Usamos prefijos descriptivos:
- `feat:` - Nueva funcionalidad
- `fix:` - Corrección de bug
- `refactor:` - Refactorización sin cambio de comportamiento
- `style:` - Cambios de estilo/UI
- `docs:` - Documentación

---

## Flujos de N8N (Automatización)

### Ubicación
N8N corre en Docker en el mismo servidor: https://rocketflow.cl

### Flujo Principal: Sincronización de Emails

El botón "Sync" en la app dispara:

```
Frontend (SyncButton) 
    → POST /api/sync/trigger
    → Backend llama webhook N8N (localhost:5678)
    → N8N lee emails no leídos de Gmail (Banco de Chile)
    → Parsea transacciones de tarjetas de crédito
    → Retorna JSON al backend
    → Backend inserta en PostgreSQL (con detección de duplicados)
    → Frontend muestra resultado
```

### Emails que se parsean:
1. **Tarjeta de crédito nacional** - Compras en CLP
2. **Tarjeta de crédito internacional** - Compras en USD
3. **Cuenta corriente** - Movimientos (transferencias, PAC, etc.)

---

## Funcionalidades Recientes Implementadas

### 1. Importación de Cartola Banco de Chile
- Endpoint: `POST /api/checking/import-file`
- Parsea archivos Excel (.xls/.xlsx) de cartola
- Headers en fila 23: Fecha, Descripción, Cargos, Abonos, Saldo
- Extrae el saldo de la primera transacción como "saldo conocido"
- Detección de duplicados por: fecha + monto + descripción normalizada

### 2. Cuenta Corriente (Checking)
- Muestra últimos 6 meses (ventana móvil, sin filtro de mes)
- Cards: Saldo Actual, Total Abonos, Total Cargos
- El saldo se toma directamente de la cartola importada (más confiable)

### 3. Detección de Duplicados
- Al importar, se verifica si ya existe: `fecha + amount + descripcion_normalizada`
- Las transacciones duplicadas se omiten automáticamente
- Se retorna conteo de insertadas vs omitidas

### 4. Transacciones Internacionales
- Importación de CSV con transacciones en USD
- Tipo de cambio configurable
- Detección de duplicados por fecha + amount_usd

---

## Base de Datos - Tablas Principales

```sql
-- Cuenta corriente
checking_balances (user_id, year, month, initial_balance, known_balance, balance_date)
checking_transactions (user_id, year, month, fecha, descripcion, tipo, amount, category_id)

-- Tarjetas de crédito
unbilled (user_id, card_brand, fecha, descripcion, amount, cuotas, category_id)
intl_unbilled (user_id, card_brand, fecha, descripcion, amount_usd, exchange_rate)

-- Categorías
categories (id, user_id, name, type, budget)

-- Duplicados sospechosos
suspicious_duplicates (user_id, original_id, duplicate_id, status, type)
```

---

## Consideraciones de Desarrollo

### Para el Frontend
- Usar componentes MUI existentes
- Seguir patrón de páginas en `src/pages/`
- Usar `axios` para llamadas API (ya configurado con interceptors)
- Formateo de moneda: `new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' })`

### Para el Backend
- Modelos en `backend/models/` extienden BaseModel
- Controladores manejan req/res, modelos manejan queries
- Autenticación via middleware `auth` (JWT en header Authorization)
- Usuario disponible en `req.user.id`

### Migraciones
- Crear en `backend/migrations/` con número secuencial
- Ejemplo: `21_add_known_balance.sql`
- Ejecutar manualmente en deploy

---

## Comandos Útiles

### Desarrollo Local
```bash
# Frontend (puerto 3000)
npm start

# Backend (puerto 3001)
cd backend && node server.js
```

### Producción
```bash
# Ver logs del backend
ssh root@137.184.12.234 "pm2 logs finanzas-backend"

# Reiniciar backend
ssh root@137.184.12.234 "pm2 restart finanzas-backend"

# Acceder a PostgreSQL
ssh root@137.184.12.234 "sudo -u postgres psql -d finanzas_personales"

# Ver estado de N8N
ssh root@137.184.12.234 "docker ps"
```

### Consultas SQL útiles
```sql
-- Ver duplicados en cuenta corriente
SELECT fecha, descripcion, amount, COUNT(*) 
FROM checking_transactions 
GROUP BY fecha, descripcion, amount 
HAVING COUNT(*) > 1;

-- Eliminar duplicados (mantener el más antiguo)
DELETE FROM checking_transactions a 
USING checking_transactions b 
WHERE a.id > b.id 
  AND a.user_id = b.user_id 
  AND a.fecha = b.fecha 
  AND a.descripcion = b.descripcion 
  AND a.amount = b.amount;
```

---

## Problemas Conocidos / Notas

1. **Netskope**: El usuario tiene software de seguridad corporativo que puede bloquear conexiones. Si hay problemas de red, puede ser esto.

2. **Fechas**: Usar timezone `America/Santiago` para consistencia.

3. **Saldo de cuenta corriente**: Se confía en el saldo de la cartola importada, no en cálculos manuales.

4. **N8N**: Los workflows están en el servidor. Si necesitas modificarlos, accede a https://rocketflow.cl

---

## Contacto / Accesos

- **Servidor**: SSH como root a 137.184.12.234
- **GitHub**: https://github.com/rorrofity/Finanzas-Personales
- **N8N**: https://rocketflow.cl (credenciales en el servidor)

---

*Última actualización: Diciembre 2025*
