# plan.md — Plan de Arquitectura Técnica: Finanzas Personales PWA

> **Subordinación:** Este plan está subordinado a `constitution.md` (innegociable) y a `spec.md` (especificación funcional). En caso de conflicto, la Constitución tiene prioridad absoluta.
>
> **Alcance de esta fase (SDD):** Este documento describe **QUÉ** se construirá a nivel arquitectónico para la conversión PWA, no **CÓMO** se programará. La fase de implementación se ejecutará desde `tasks.md`.

---

## 1. Arquitectura Técnica (Visión General)

### 1.1 Diagrama de Arquitectura PWA

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    USUARIO (Browser PWA — mobile-first)                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │     React    │  │   Workbox    │  │  IndexedDB   │  │  Responsive  │ │
│  │  (UI + MUI   │  │  (Service    │  │ (Read-only   │  │  Layout +    │ │
│  │  responsive) │  │   Worker)    │  │    Cache)    │  │  Gestos)     │ │
│  └──────┬───────┘  └──────────────┘  └──────────────┘  └──────────────┘ │
└─────────┼───────────────────────────────────────────────────────────────┘
          │ HTTPS
┌─────────┼───────────────────────────────────────────────────────────────┐
│  ┌──────┴──────┐                                               Digital │
│  │   Caddy     │  SSL + Reverse Proxy (80/443)                     Ocean │
│  │  (Docker)   │                                               Droplet │
│  └──────┬──────┘                                                      │
│         │                                                             │
│    ┌────┴────────────────────────────────────────┐                   │
│    ↓                                             ↓                   │
│ ┌──────────┐                              ┌──────────┐              │
│ │ Backend  │◄──────────────────────────────►│   N8N    │  ← Docker  │
│ │(Node.js  │      Webhook (localhost)    │ (5678)   │            │
│ │+ Express)│                              └──────────┘            │
│ └───┬──────┘                                                        │
│     │                                                               │
│ ┌───┴────────────────┐                                            │
│ │   PostgreSQL         │  ← Puerto 5432 (local)                    │
│ │   (finanzas_personales)                                         │
│ └──────────────────────┘                                            │
│                                                                     │
│ ┌──────────────────────┐                                            │
│ │   PM2                │  ← Gestión de procesos Node.js              │
│ │   (finanzas-backend) │                                            │
│ └──────────────────────┘                                            │
└─────────────────────────────────────────────────────────────────────┘
```

### 1.2 Componentes Principales

| Componente | Tecnología | Responsabilidad | Principios |
|---|---|---|---|
| **Frontend PWA** | React 18 + MUI + Workbox | UI mobile-first responsive, caché de lectura | PWA-001, ARCH-001 |
| **Service Worker** | Workbox (Google) | Caching estratégico (App Shell + lectura API), precache | PWA-001 |
| **Backend** | Node.js + Express 4.x | API REST, lógica de negocio, N8N integration | AUTH-001, ARCH-001 |
| **Base de datos** | PostgreSQL 14+ | Persistencia transaccional | DATA-001 |
| **Automatización** | N8N (Docker) | Workflows de sincronización email | N8N-001 |
| **Proxy/SSL** | Caddy 2.x | Reverse proxy, SSL automático (Let's Encrypt) | SEC-001 |
| **Procesos** | PM2 | Gestión de procesos en producción | — |
| **IaC/Deploy** | Scripts shell + Git | Deploy automatizado vía SSH | — |

---

## 2. Estructura del Proyecto (Post-PWA)

```
Finanzas-Personales/
├── constitution.md             # read-only (Principios)
├── spec.md                     # especificación funcional
├── plan.md                     # este documento
├── tasks.md                    # se generará en la siguiente fase
├── README.md
├── .env                        # variables de entorno (no commit)
├── .gitignore
├── package.json                # Scripts + dependencias
├── .windsurfrules              # reglas del proyecto
│
├── public/                     # Static assets + PWA config
│   ├── index.html
│   ├── manifest.json           # PWA manifest actualizado
│   ├── favicon.ico
│   ├── icons/                  # Íconos PWA (72x72 a 512x512)
│   │   ├── icon-72.png
│   │   ├── icon-96.png
│   │   ├── icon-128.png
│   │   ├── icon-144.png
│   │   ├── icon-152.png
│   │   ├── icon-192.png
│   │   ├── icon-384.png
│   │   └── icon-512.png
│   └── screenshots/            # Screenshots para PWA install
│       ├── screenshot-dashboard-wide.png
│       └── screenshot-mobile.png
│
├── src/                        # Frontend React
│   ├── App.js                  # Router + Layout
│   ├── index.js                # Entry point (registra SW)
│   ├── serviceWorkerRegistration.js  # Registro Workbox
│   │
│   ├── components/             # Componentes React
│   │   ├── SyncButton.jsx
│   │   ├── MonthPicker.js
│   │   ├── CategoryDetailDrawer.js
│   │   ├── BillingPeriodConfig.jsx
│   │   ├── OfflineBanner.jsx   # NUEVO: indicador offline (solo lectura)
│   │   ├── ResponsiveTable.jsx # NUEVO: tabla → cards en mobile
│   │   └── InstallPrompt.jsx   # NUEVO: prompt de instalación PWA
│   │
│   ├── pages/                  # Vistas principales
│   │   ├── Dashboard.js
│   │   ├── Transactions.js
│   │   ├── TransactionsIntl.js
│   │   ├── Installments.js
│   │   ├── Checking.js
│   │   ├── FinancialHealth.jsx
│   │   ├── Categories.js
│   │   ├── ReviewDuplicates.jsx
│   │   ├── ProjectedTransactions.js
│   │   ├── Settings.js
│   │   ├── Login.js
│   │   └── Register.js
│   │
│   ├── contexts/               # Estado global
│   │   ├── AuthContext.js      # JWT + Google OAuth
│   │   ├── PeriodContext.js     # Período seleccionado
│   │   └── OfflineContext.jsx   # NUEVO: estado de conectividad
│   │
│   ├── hooks/                  # Custom hooks
│   │   ├── useOffline.js       # NUEVO: detecta estado offline
│   │   ├── useReadCache.js     # NUEVO: lee caché IndexedDB en offline
│   │   └── useMediaQuery (MUI)  # Breakpoints responsive (built-in)
│   │
│   ├── services/               # API clients
│   │   ├── api.js              # Axios config
│   │   ├── suspiciousService.js
│   │   └── readCache.js        # NUEVO: caché de lectura IndexedDB
│   │
│   ├── utils/                    # Utilidades
│   │   ├── formatters.js
│   │   └── validators.js
│   │
│   ├── sw/                       # NUEVO: Service Worker con Workbox
│   │   └── service-worker.js     # Workbox configuration
│   │
│   ├── theme.js                  # Tema MUI personalizado
│   └── layouts/
│       └── DashboardLayout.js
│
├── backend/                      # Backend Node.js/Express
│   ├── server.js                 # Entry point Express
│   ├── package.json
│   │
│   ├── config/
│   │   └── database.js           # Pool PostgreSQL
│   │
│   ├── controllers/              # Lógica de negocio
│   │   ├── authController.js
│   │   ├── transactionController.js
│   │   ├── dashboardController.js
│   │   ├── installmentsController.js
│   │   ├── intlUnbilledController.js
│   │   ├── checkingController.js
│   │   ├── financialHealthController.js
│   │   └── projectedController.js
│   │
│   ├── models/                   # Acceso a datos
│   │   ├── Transaction.js
│   │   ├── User.js
│   │   ├── Installments.js
│   │   ├── IntlUnbilled.js
│   │   ├── Checking.js
│   │   └── Projected.js
│   │
│   ├── routes/                   # API endpoints
│   │   ├── authRoutes.js
│   │   ├── transactionRoutes.js
│   │   ├── syncRoutes.js
│   │   ├── dashboardRoutes.js
│   │   ├── installmentsRoutes.js
│   │   ├── intlUnbilledRoutes.js
│   │   ├── checkingRoutes.js
│   │   ├── financialHealthRoutes.js
│   │   ├── billingRoutes.js
│   │   ├── cardRoutes.js
│   │   ├── suspiciousRoutes.js
│   │   ├── categoryRoutes.js
│   │   └── projectedRoutes.js
│   │
│   ├── middleware/
│   │   ├── auth.js               # JWT verification
│   │   └── security.js           # NUEVO: headers de seguridad
│   │
│   ├── utils/
│   │   └── suspiciousDetector.js
│   │
│   └── migrations/               # 27 archivos SQL existentes
│                                 # (sin cambios — no se requiere nueva tabla)
│
├── scripts/                      # Scripts de deployment
│   ├── deploy-to-production.sh
│   └── sync-migrations.sh
│
└── docs/                         # Documentación SDD
    ├── constitution.md
    ├── spec.md
    ├── plan.md
    └── tasks.md                  # (a generar)
```

---

## 3. Dependencias Clave (Nuevas para PWA)

### 3.1 Frontend (agregar a `package.json`)

| Paquete | Propósito | Justificación |
|---|---|---|
| `workbox-window` | Registro del SW desde React | API simplificada de Google |
| `workbox-precaching` | Precache de App Shell | Carga instantánea de shell |
| `workbox-routing` | Routing de requests | Estrategias de cache por ruta |
| `workbox-strategies` | Estrategias de caching | NetworkFirst, CacheFirst, StaleWhileRevalidate |
| `idb` | IndexedDB Promise-based | Caché de **solo lectura** para consulta offline |

> **Nota:** No se incluye `workbox-background-sync` ni `uuid` porque **no hay escritura offline**. Las operaciones de escritura (crear/editar/eliminar) requieren conexión activa (Req 9.4).

### 3.2 Backend (agregar a `backend/package.json`)

| Paquete | Propósito | Justificación |
|---|---|---|
| (sin cambios) | — | La conversión PWA es **frontend-only**; no requiere nuevos endpoints ni tablas |

---

## 4. Service Worker con Workbox

### 4.1 Estrategia de Caching

```javascript
// src/sw/service-worker.js
import { precacheAndRoute } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { NetworkFirst, CacheFirst, StaleWhileRevalidate } from 'workbox-strategies';
import { BackgroundSyncPlugin } from 'workbox-background-sync';

// Precache App Shell (inyectado por workbox-webpack-plugin)
precacheAndRoute(self.__WB_MANIFEST);

// API: Network First con cache de fallback
registerRoute(
  ({ url }) => url.pathname.startsWith('/api/') && !url.pathname.includes('/sync'),
  new NetworkFirst({
    cacheName: 'api-cache',
    networkTimeoutSeconds: 3,
    plugins: [
      {
        cacheWillUpdate: async ({ response }) => {
          // Solo cachear respuestas 200
          if (response.status === 200) return response;
          return null;
        }
      }
    ]
  })
);

// Static assets: Cache First
registerRoute(
  ({ request }) => 
    request.destination === 'style' ||
    request.destination === 'script' ||
    request.destination === 'font',
  new CacheFirst({
    cacheName: 'static-assets'
  })
);

// Images: Stale While Revalidate
registerRoute(
  ({ request }) => request.destination === 'image',
  new StaleWhileRevalidate({
    cacheName: 'images'
  })
);

// IMPORTANTE: Las peticiones de ESCRITURA (POST/PUT/DELETE) NO se cachean
// ni se encolan. Si no hay red, fallan y el frontend muestra el mensaje
// de "operación requiere conexión" (Req 9.4). No hay Background Sync.

// Skip waiting para actualizaciones inmediatas (Req 9.6)
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
```

> **Decisión clave:** El Service Worker solo cachea **lecturas** (GET) y assets estáticos. Las mutaciones siempre van directo a la red; si fallan por falta de conexión, la UI lo comunica al usuario.

### 4.2 IndexedDB Schema (Offline Storage)

> **Solo lectura.** IndexedDB almacena únicamente una copia de los datos consultados para mostrarlos cuando no hay red. No hay cola de escritura.

```javascript
// src/services/readCache.js
import { openDB } from 'idb';

const DB_NAME = 'FinanzasPWA';
const DB_VERSION = 1;

export const initDB = async () => {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      // Caché de respuestas GET por clave (endpoint + período)
      if (!db.objectStoreNames.contains('readCache')) {
        db.createObjectStore('readCache', { keyPath: 'key' });
      }
    }
  });
};

// Guardar respuesta de una consulta (key = endpoint+params)
export const cacheRead = async (key, data) => {
  const db = await initDB();
  await db.put('readCache', {
    key,
    data,
    cachedAt: new Date().toISOString()
  });
};

// Recuperar respuesta cacheada (para mostrar en offline)
export const getCachedRead = async (key) => {
  const db = await initDB();
  const entry = await db.get('readCache', key);
  return entry ? entry.data : null;
};
```

---

## 5. Hooks React para Offline (Solo Lectura) y Responsive

### 5.1 useOffline Hook

```javascript
// src/hooks/useOffline.js
import { useState, useEffect } from 'react';

export const useOffline = () => {
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [wasOffline, setWasOffline] = useState(false);

  useEffect(() => {
    const handleOffline = () => {
      setIsOffline(true);
      setWasOffline(true);
    };

    const handleOnline = () => {
      setIsOffline(false);
    };

    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);

    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
    };
  }, []);

  return { isOffline, wasOffline, setWasOffline };
};
```

### 5.2 useReadCache Hook

Al recuperar la conexión, refresca los datos (Req 9.12). En offline, sirve la última copia cacheada (Req 9.3).

```javascript
// src/hooks/useReadCache.js
import { useEffect } from 'react';
import { cacheRead, getCachedRead } from '../services/readCache';

// Envuelve una llamada GET con fallback a caché en offline
export const fetchWithCache = async (key, fetcher) => {
  if (navigator.onLine) {
    try {
      const data = await fetcher();
      await cacheRead(key, data); // actualiza caché
      return { data, fromCache: false };
    } catch (err) {
      const cached = await getCachedRead(key);
      if (cached) return { data: cached, fromCache: true };
      throw err;
    }
  }
  // Offline: servir caché
  const cached = await getCachedRead(key);
  return { data: cached, fromCache: true };
};
```

### 5.3 Layout Responsive (MUI useMediaQuery)

MUI provee breakpoints nativos. El layout se adapta sin librerías extra (Req 9.8, 9.9).

```javascript
// Ejemplo de uso en una página con tabla
import { useMediaQuery, useTheme } from '@mui/material';

const MyPage = () => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md')); // < 900px

  return isMobile
    ? <TransactionCards data={data} />   // cards apiladas en mobile
    : <TransactionTable data={data} />;  // tabla en desktop
};
```

---

## 6. Backend: Sin Cambios Requeridos

La conversión a PWA es **100% frontend**. El backend Express + PostgreSQL existente **no requiere modificaciones**:

- **No hay endpoint de batch-sync** porque no hay escritura offline.
- **No hay nueva tabla** `pending_sync`.
- Los endpoints actuales (`/api/transactions`, `/api/dashboard`, etc.) siguen sirviendo las peticiones igual que hoy.
- La única recomendación opcional es asegurar que los headers de caching HTTP (`Cache-Control`) en respuestas GET sean razonables, para complementar el Service Worker.

> **Beneficio:** Riesgo mínimo en producción. La app sigue "operando tal cual" — solo se añade una capa PWA en el cliente que mejora la experiencia mobile y permite consulta offline.

---

## 7. Manifest.json Completo

```json
{
  "short_name": "Finanzas",
  "name": "Finanzas Personales",
  "description": "Gestión personal de finanzas con seguimiento de gastos, ingresos y proyecciones",
  "categories": ["finance", "productivity"],
  "icons": [
    {
      "src": "/icons/icon-72.png",
      "sizes": "72x72",
      "type": "image/png",
      "purpose": "any"
    },
    {
      "src": "/icons/icon-96.png",
      "sizes": "96x96",
      "type": "image/png",
      "purpose": "any"
    },
    {
      "src": "/icons/icon-128.png",
      "sizes": "128x128",
      "type": "image/png",
      "purpose": "any"
    },
    {
      "src": "/icons/icon-144.png",
      "sizes": "144x144",
      "type": "image/png",
      "purpose": "any"
    },
    {
      "src": "/icons/icon-152.png",
      "sizes": "152x152",
      "type": "image/png",
      "purpose": "any"
    },
    {
      "src": "/icons/icon-192.png",
      "sizes": "192x192",
      "type": "image/png",
      "purpose": "any maskable"
    },
    {
      "src": "/icons/icon-384.png",
      "sizes": "384x384",
      "type": "image/png",
      "purpose": "any"
    },
    {
      "src": "/icons/icon-512.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "any maskable"
    }
  ],
  "start_url": "/",
  "display": "standalone",
  "orientation": "portrait",
  "theme_color": "#3B82F6",
  "background_color": "#F8FAFC",
  "scope": "/",
  "shortcuts": [
    {
      "name": "Nueva Transacción",
      "short_name": "Nueva",
      "description": "Agregar una transacción rápidamente",
      "url": "/transactions?action=new",
      "icons": [{ "src": "/icons/icon-96.png", "sizes": "96x96" }]
    },
    {
      "name": "Dashboard",
      "short_name": "Inicio",
      "url": "/",
      "icons": [{ "src": "/icons/icon-96.png", "sizes": "96x96" }]
    },
    {
      "name": "Sincronizar",
      "short_name": "Sync",
      "url": "/dashboard?action=sync",
      "icons": [{ "src": "/icons/icon-96.png", "sizes": "96x96" }]
    }
  ],
  "screenshots": [
    {
      "src": "/screenshots/screenshot-dashboard-wide.png",
      "sizes": "1280x720",
      "type": "image/png",
      "form_factor": "wide",
      "label": "Dashboard de Finanzas"
    },
    {
      "src": "/screenshots/screenshot-mobile.png",
      "sizes": "750x1334",
      "type": "image/png",
      "form_factor": "narrow",
      "label": "Vista móvil de transacciones"
    }
  ],
  "related_applications": [],
  "prefer_related_applications": false
}
```

---

## 8. Base de Datos: Sin Migraciones Nuevas

La conversión PWA **no introduce cambios en el esquema PostgreSQL**. Se reutilizan las 27 migraciones existentes sin alteraciones.

---

## 9. Flujos Críticos (Secuencias)

### 9.1 Consulta Offline (Solo Lectura)

```
1. Usuario abre la app sin conexión (isOffline = true)
2. Frontend: OfflineBanner muestra "Sin conexión - mostrando datos guardados"
3. Frontend: fetchWithCache detecta offline
4. Frontend: lee última copia desde IndexedDB 'readCache'
5. UI renderiza datos cacheados (Dashboard, transacciones, etc.)
6. Botones de escritura (Nueva, Editar, Eliminar) se muestran DISABLED
   con tooltip "Requiere conexión" (Req 9.4)
7. Botón "Sincronizar Emails" también disabled (Req 9.4 caso de borde)
8. Conexión restaurada (event 'online')
9. OfflineBanner desaparece
10. Frontend: refresca datos automáticamente (Req 9.12)
11. Botones de escritura se re-habilitan
```

### 9.2 Actualización de Service Worker

```
1. Nuevo deploy en producción con cambios en frontend
2. Service Worker nuevo se instala en background
3. Event 'waiting' se dispara
4. UI muestra banner: "Nueva versión disponible"
5. Usuario pulsa "Actualizar"
6. skipWaiting() llamado
7. Page reload para activar nuevo SW
8. SW nuevo toma control
9. Precache de nuevos assets
```

### 9.3 Sincronización desde N8N (Online)

```
1. Usuario pulsa "Sincronizar Emails" (online)
2. Frontend: POST /api/sync/sync-emails (con JWT)
3. Backend: POST a N8N webhook (localhost:5678)
4. N8N: Query Gmail API -> Parsea emails -> POST /api/sync/sync-save
5. Backend: Verifica duplicados por email_id
6. Backend: INSERT transacciones nuevas
7. Backend: Retorna {imported, skipped}
8. Frontend: Muestra resultado en Dialog
9. Frontend: Refresca lista de transacciones
```

---

## 10. Estrategia de Pruebas (Test-First — TEST-001)

> **Ciclo obligatorio por tarea:** 🔴 escribir prueba → verificar que **falla** → 🟢 implementar → 🔁 verificar que **pasa**. Ver `tasks.md` para el desglose `T-*` / `I-*` / `V-*`.

| Capa | Framework | Cobertura objetivo |
|---|---|---|
| Frontend unit | Jest + React Testing Library | Componentes UI, hooks (useOffline) |
| Frontend responsive | Jest + RTL + matchMedia mock | Render mobile vs desktop |
| Frontend E2E | Playwright | Instalación PWA, offline read, responsive viewports |
| Service Worker | Workbox CLI + manual | Precache, routing, actualización SW |

**Tests críticos a incluir:**
- Modo offline -> muestra datos cacheados y banner
- Modo offline -> botones de escritura están disabled con tooltip
- Recuperar conexión -> datos se refrescan automáticamente
- Viewport mobile (375px) -> tablas se renderizan como cards, sin scroll horizontal
- Viewport mobile -> drawer funciona como menú hamburguesa/bottom sheet
- Instalación PWA -> manifest válido, íconos correctos, modo standalone
- SW se actualiza -> skipWaiting funciona, banner "nueva versión"

---

## 11. Mapeo Constitucional de la Arquitectura

| Componente arquitectónico | Principio satisfecho |
|---|---|
| JWT en todos los endpoints de escritura | AUTH-001 |
| PostgreSQL local, sin servicios externos | DATA-001 |
| Separación `/src` vs `/backend` | ARCH-001 |
| Service Worker + IndexedDB (caché lectura) + layout responsive | PWA-001 |
| Botón "Sync" on-demand con N8N (requiere conexión) | N8N-001 |
| Headers de seguridad en Caddy | SEC-001 |

---

## 12. Rollout Plan (Fases de Implementación)

### Fase 1: Infraestructura PWA Base
- Configurar Workbox en build de React (CRA: workbox-webpack-plugin o `cra-template-pwa`)
- Crear Service Worker (`src/sw/service-worker.js`)
- Actualizar `manifest.json` completo
- Generar íconos PWA en todos los tamaños
- Registrar SW en `src/index.js` (`serviceWorkerRegistration.js`)

### Fase 2: Caché de Lectura y Estado Offline
- Implementar `readCache.js` con idb (solo lectura)
- Crear `useOffline` hook
- Crear `OfflineContext`
- Crear `OfflineBanner` componente
- Implementar `fetchWithCache` para consultas GET
- Deshabilitar botones de escritura en offline (Req 9.4)

### Fase 3: Optimización Mobile (Responsive)
- Auditar cada página en viewport mobile (375px, 768px)
- Crear `ResponsiveTable` (tabla → cards en mobile)
- Adaptar `DashboardLayout` (drawer → menú mobile)
- Ajustar gráficos Recharts para mobile (alturas, tooltips)
- Asegurar controles accesibles sin scroll horizontal (Req 9.9)
- Gestos táctiles: pull-to-refresh, swipe (Req 9.10)

### Fase 4: Actualización SW e Install Prompt
- Banner "Nueva versión disponible" + skipWaiting (Req 9.6)
- `InstallPrompt` componente (beforeinstallprompt)
- Verificar modo standalone (Req 9.11)
- Refresco automático al reconectar (Req 9.12)

### Fase 5: Testing y Polish
- Tests unitarios (useOffline, render responsive)
- Tests E2E con Playwright (offline read, viewports mobile)
- Auditar PWA con Lighthouse (objetivo: PWA installable, score > 90)
- Optimizar bundle size
- Verificar en dispositivos reales (iOS Safari, Android Chrome)

---

*Versión: 1.0.0*
*Última actualización: 2026-06-07*
