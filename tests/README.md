# Tests — Finanzas Personales PWA

Pruebas siguiendo la metodología **Test-First (TEST-001)**: se escriben ANTES de la
implementación y deben fallar primero.

> **Regla de oro:** Las pruebas corren SIEMPRE contra el entorno **LOCAL**.
> Nunca apuntar a producción (`finanzas.rocketflow.cl`).

## Estructura

```
tests/
├── e2e/                    # Pruebas End-to-End (Playwright)
│   ├── helpers/
│   │   └── auth.js         # Login programático para E2E
│   ├── smoke.spec.js       # Baseline: app carga (Fase 0)
│   └── ...                 # Specs por feature (Fases 1-4)
└── README.md               # este archivo

src/                        # Pruebas UNITARIAS colocadas junto al código
└── **/__tests__/*.test.js  # (ejecutadas por react-scripts test / Jest)
```

> **Nota:** Las pruebas unitarias se colocan dentro de `src/` (convención de
> Create React App + Jest, que solo escanea `src/`). Las E2E viven en `tests/e2e/`.

## Requisitos previos (local)

1. **PostgreSQL local** corriendo con la base `finanzas_personales`.
2. **`.env`** configurado en la raíz del proyecto.
3. **Credenciales de prueba** definidas (ver `.env.test.example`):
   ```bash
   export E2E_USER_EMAIL="tu-usuario-de-prueba@local"
   export E2E_USER_PASSWORD="tu-password"
   ```

## Comandos

```bash
# E2E — Playwright (levanta `npm run dev` automáticamente si no hay server)
npm run test:e2e            # ejecuta todas las E2E (headless)
npm run test:e2e:ui         # modo UI interactivo
npm run test:e2e:headed     # con navegador visible

# Unitarias — Jest (react-scripts)
npm run test:unit           # ejecuta pruebas unitarias en src/
```

## Ciclo Test-First por tarea

1. **🔴 RED** — escribir la prueba y ejecutarla → debe **fallar**.
2. **🟢 GREEN** — implementar el mínimo código para que **pase**.
3. **🔁 VERIFY** — re-ejecutar la suite → todo en **verde**, sin regresiones.

Ver `docs/tasks.md` para el desglose de tareas `T-*` / `I-*` / `V-*`.

## Evolución de gastos por categoría — Epic15

Estas verificaciones no necesitan ni deben usar la base local histórica o producción:

```bash
# Unitarias: frontend e información de salud financiera; DB/lecturas simuladas
npm run test:unit -- --runInBand
npm run test:backend -- --runInBand

# SQL/API real: crea un cluster PostgreSQL efímero, si hay binarios PostgreSQL locales
npm run test:dashboard:integration

# Build y E2E con API ficticia; únicamente loopback y frontend estático
CI=true BUILD_PATH=/private/tmp/finanzas-dashboard-implementation-build REACT_APP_API_BASE_URL='' npm run build
DASHBOARD_BUILD_DIR=/private/tmp/finanzas-dashboard-implementation-build npm run test:dashboard
```

La configuración dedicada no acepta `E2E_BASE_URL` y no inicia el backend. Los fixtures bloquean destinos externos, peticiones API no declaradas y métodos de escritura. La integración crea su propia instancia PostgreSQL, carga datos ficticios y pone las lecturas bajo sesión read-only; comprueba que los registros y categorías no cambien y elimina la instancia al terminar. No carga `.env` ni utiliza credenciales reales.

Los casos incluyen períodos históricos/cruce de año, ventanas3/6/12, todas las categorías, fuentes, centavos, matriz/detalle, estados de cobertura, meses futuros, permisos, caché aislada, offline, respuestas tardías y cifras completas a375px. La PWA conserva sus verificaciones en `tests/pwa-build/` y cuenta además con pruebas unitarias que impiden que Workbox reutilice caché por URL entre espacios para los endpoints del dashboard.
