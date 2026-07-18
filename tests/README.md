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
