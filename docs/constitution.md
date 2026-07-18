# 📜 Constitución - Finanzas Personales

## Propósito

**Finanzas Personales** es una aplicación web personal para el seguimiento completo de las finanzas del hogar. Cada espacio de finanzas tiene un **dueño** (el propietario de los datos), quien puede **invitar a miembros de su hogar** con permisos granulares para ver y colaborar en ese espacio. Los datos viven en el servidor personal del dueño, sin intermediarios ni servicios de terceros que almacenen información sensible.

### Visión

Crear una herramienta de gestión financiera personal que:
- **Centralice** todos los gastos, ingresos y proyecciones en un solo lugar
- **Automatice** la captura de transacciones desde emails bancarios
- **Proyecte** la salud financiera futura para tomar decisiones informadas
- **Respete la privacidad** manteniendo todos los datos bajo control personal
- **Funcione en cualquier dispositivo** como una aplicación nativa (PWA)

---

## Principios Fundamentales

### 1. Privacidad Primero
- Los datos financieros nunca salen del servidor personal
- Sin analytics de terceros
- Sin tracking ni publicidad
- Autenticación propia + Google OAuth opcional

### 2. Automatización Inteligente
- Sincronización on-demand desde emails bancarios vía N8N
- Detección automática de duplicados
- Proyecciones automáticas de gastos fijos y cuotas

### 3. Simplicidad Operativa
- **Una persona = un usuario**: cada quien se autentica con su propia cuenta; nunca se comparten credenciales
- **Un espacio de finanzas = un dueño**: los datos pertenecen al usuario dueño; el dueño puede invitar hasta 2 miembros de su hogar con permisos granulares (ver / crear+editar / eliminar), activables y desactivables al instante
- Sin multi-tenant abierto: no hay registro público de espacios ni organizaciones
- Flujos directos: la administración de miembros es exclusiva del dueño
- Deploy directo a producción (no hay staging)

*(Enmienda 2026-07-18: este principio decía "sin complejidad multi-tenant ni permisos". Se redefine para permitir el espacio compartido del hogar manteniendo la identidad individual — ver Epic 11 en spec.md.)*

### 4. Transparencia Total
- Código abierto y documentado
- Toda transacción es rastreable (import ID, email ID, metadata)
- Auditoría completa de operaciones

### 5. Disponibilidad Offline para Consulta (Objetivo PWA)
- La aplicación debe permitir **consultar datos** sin conexión (solo lectura)
- Las operaciones de escritura (crear/editar/eliminar) requieren conexión activa
- Datos consultados recientemente cacheados localmente para visualización
- La app debe seguir operando idéntica a hoy, añadiendo capa PWA y optimización mobile

### 6. Test-First (Desarrollo Guiado por Pruebas)
- **NINGUNA implementación de código se realiza sin pruebas previas que fallen**
- Ciclo obligatorio: (1) escribir prueba → (2) verificar que **falla** → (3) implementar → (4) verificar que **pasa**
- Pruebas E2E con **Playwright** para flujos de usuario (instalación PWA, offline, responsive)
- Pruebas unitarias para hooks, utilidades y lógica de componentes
- No se considera completa una tarea sin su prueba pasando
- Las pruebas existentes NUNCA se debilitan ni eliminan sin autorización explícita

---

## Arquitectura de Alto Nivel

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENTE (PWA)                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │
│  │   React     │  │  Workbox    │  │  IndexedDB  │              │
│  │   (UI)      │  │  (SW/Cache) │  │  (Offline)  │              │
│  └──────┬──────┘  └─────────────┘  └─────────────┘              │
└─────────┼────────────────────────────────────────────────────────┘
          │ HTTPS
┌─────────┼────────────────────────────────────────────────────────┐
│  ┌──────┴──────┐                                            DO   │
│  │   Caddy     │  SSL + Reverse Proxy                        │
│  │  (80/443)   │                                             │
│  └──────┬──────┘                                             │
│         │                                                    │
│    ┌────┴────┐                                               │
│    ↓         ↓                                                │
│ ┌────────┐ ┌────────┐                                         │
│ │ Backend│ │  N8N   │  ← Docker                              │
│ │(Node+  │ │(Docker)│                                         │
│ │Express)│ └────────┘                                         │
│ └───┬────┘                                                   │
│     │                                                        │
│ ┌───┴────────────────┐                                       │
│ │   PostgreSQL       │                                       │
│ │   (Datos locales)  │                                       │
│ └────────────────────┘                                       │
└─────────────────────────────────────────────────────────────────┘
```

### Componentes Principales

| Componente | Tecnología | Propósito |
|------------|------------|-----------|
| **Frontend** | React 18 + MUI | Interfaz de usuario responsive |
| **Backend** | Node.js + Express | API REST, lógica de negocio |
| **Base de Datos** | PostgreSQL 14+ | Persistencia de datos |
| **Automatización** | N8N (Docker) | Workflows de sincronización |
| **Proxy/SSL** | Caddy | Reverse proxy + SSL automático |
| **Procesos** | PM2 | Gestión de procesos Node.js en producción |

---

## Dominios del Negocio

### 1. Transacciones Financieras
- **Transacciones facturadas**: Movimientos ya pagados
- **No facturadas (TC)**: Compras en tarjeta pendientes de facturación
- **Internacionales**: Compras en USD con conversión
- **Cuenta corriente**: Movimientos bancarios (Banco de Chile)

### 2. Categorización
- Categorías personalizables por usuario
- Presupuestos por categoría (futuro)
- Tipos: `ingreso`, `gasto`, `pago`, `desestimar`

### 3. Proyecciones
- **Compras en cuotas**: Cálculo automático de pagos futuros
- **Gastos fijos**: Transacciones recurrentes proyectadas
- **Salud financiera**: Proyección de balance mes a mes

### 4. Importación
- CSV desde bancos (Banco de Chile, Santander, etc.)
- Excel de cartolas bancarias
- Emails bancarios vía N8N (automatizado)

---

## Decisiones de Diseño Clave

### ¿Por qué no usar una app existente?
- **Control total**: Los datos son propios, no en servidores de terceros
- **Personalización**: Flujos adaptados exactamente a necesidades personales
- **Integración bancaria**: Automatización propia con N8N
- **Costo**: Una vez deployado, solo costo de servidor (~$6/mes)

### ¿Por qué deploy directo a producción?
- Usuario único = bajo riesgo
- Agilidad en iteraciones
- El "staging" es el ambiente local

### ¿Por qué PostgreSQL y no SQLite?
- Escalabilidad futura (múltiples años de datos)
- Concurrencia (N8N + Backend simultáneos)
- Funcionalidades avanzadas (JSONB para metadata, triggers)

### ¿Por qué N8N y no scripts directos?
- Visual workflow builder para ajustes sin código
- Reutilización de nodos comunes (Gmail API)
- Retry logic y error handling integrado

---

## Flujos de Negocio Principales

### 1. Ingreso de Transacciones
```
┌─────────┐    ┌─────────────┐    ┌───────────┐    ┌─────────┐
│ Origen  │───▶│  Parseo     │───▶│ Detección │───▶│  BD     │
└─────────┘    └─────────────┘    └───────────┘    └─────────┘
   │                 │                 │               │
   • Manual          • Excel/CSV       • Por email_id  • PostgreSQL
   • Importación     • Email (N8N)     • Por fecha+
   • Sincronización  • Regex parsing     monto+desc
```

### 2. Período de Facturación
- Todo análisis se basa en **período de facturación** (mes/año de pago)
- Regla de negocio: Compras día >= 22 → facturan 2 meses después
- Compras día < 22 → facturan mes siguiente
- Ejemplo: Compra 25 de noviembre → factura enero próximo año

### 3. Detección de Duplicados
- **Exactos**: mismo email_id en metadata
- **Sospechosos**: misma fecha + monto + descripción similar
- Requiere revisión manual en UI dedicada

---

## Restricciones y Convenciones

### Convenciones de Código
- **Frontend**: React functional components + hooks
- **Backend**: Modelo MVC (Models, Controllers, Routes)
- **Base de datos**: Snake_case en tablas/columnas
- **API**: RESTful, JSON, prefijo `/api/`
- **Fechas**: ISO 8601 con timezone America/Santiago

### Límites del Sistema
- Un dueño por espacio de finanzas; máximo 2 miembros invitados por espacio (no multi-tenant abierto)
- Año mínimo: 2020, máximo: 2050
- Montos: hasta 999,999,999.99 CLP
- Descripciones: máximo 255 caracteres

### Seguridad
- JWT con expiración de 24 horas
- Password hasheados con bcrypt
- CORS configurado por ambiente
- Headers de seguridad (HSTS, CSP, X-Frame-Options)

---

## Roadmap Estratégico

### Corto Plazo (Inmediato)
1. ✅ Sistema base de transacciones
2. ✅ Importación CSV/Excel
3. ✅ Sincronización emails vía N8N
4. ✅ Dashboard de salud financiera
5. ✅ **Conversión a PWA** (desplegada a producción 2026-07-18)
6. 🚧 **Espacio compartido del hogar (multi-usuario)** — épica actual: el dueño invita a un miembro con permisos granulares (Epic 11, enmienda constitucional aplicada 2026-07-18)

### Mediano Plazo (3-6 meses)
1. Presupuestos por categoría con alertas
2. Metas de ahorro con seguimiento
3. Reportes exportables (PDF)
4. Soporte multi-moneda completo

### Largo Plazo (6+ meses)
1. App móvil nativa (React Native)
2. Machine learning para categorización automática
3. Predicción de gastos con análisis histórico

---

## Glosario

| Término | Significado |
|---------|-------------|
| **TC** | Tarjeta de Crédito |
| **No facturadas** | Compras que aún no aparecen en la cartola mensual |
| **Cuotas** | Compras en N pagos mensuales |
| **Billing period** | Mes/año en que se pagará la transacción |
| **Desestimar** | Marcar transacción para ignorar en totales |
| **PAC** | Pago Automático de Cuentas |
| **N8N** | Plataforma de automatización de workflows |

---

## Contacto y Accesos

- **Repositorio**: https://github.com/rorrofity/Finanzas-Personales
- **Producción**: https://finanzas.rocketflow.cl
- **Servidor**: Digital Ocean (137.184.12.234)
- **N8N**: https://rocketflow.cl
- **Autor**: Rodrigo Pizarro

---

*Última actualización: 2026-07-18*
*Versión de la constitución: 1.1 (enmienda: espacio compartido del hogar — principio 3 y límites del sistema)*
