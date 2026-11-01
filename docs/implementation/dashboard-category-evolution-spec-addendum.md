# Enmienda SDD — Epic15: evolución de gastos por categoría

**Aceptada:** 2026-10-31 por instrucción del usuario. **Protección innegociable:** no modificar gastos, clasificaciones, períodos persistidos ni esquema. Esta enmienda desarrolla Epic7 y sustituye únicamente la prioridad visual de Req12.4/12.5; conserva sus garantías de consulta y detalle. Epic14 continúa independiente.

Requisitos normativos: [DCE-01–21](../proposals/dashboard-category-evolution.md#4-requisitos-funcionales-propuestos--ears). Contrato exacto: [lecturas e interfaz](dashboard-category-evolution-contract.md). Plan y evidencia: [RED/GREEN/VERIFY](dashboard-category-evolution-plan.md).

| Área | Requisito aceptado |
|---|---|
| Tiempo | Facturación persistida, ventana3/6/12 terminada en el mes seleccionado; orden cronológico y estados pasado/actual/futuro en America/Santiago |
| Fuentes | TC nacional inicial; selección explícita internacional/CC/todas; cobertura desconocida y suma de registros identificada al combinar |
| Integridad | Mismos filtros para gasto, categorías y detalle; pagos/desestimados/proyecciones excluidos; no inventar período/CLP ni deduplicar por similitud |
| Categorías | IDs y nombres existentes, todas las categorías accesibles, grupo sin categoría, sin límites silenciosos de6/10 |
| Experiencia | Matriz categoría×mes y tendencia principal, selección y detalle de la celda correcta; delta absoluto y porcentaje calculable |
| Estados | Cero registrado distinto de cobertura, futuro, error o falta de caché; ignorar respuestas tardías; antigüedad visible |
| Acceso | Auth/resolveSpace, aislamiento de caché por usuario/espacio/filtros y consulta offline de rangos descargados |
| Móvil | Importes completos sin truncado a375px, tabla sin desbordamiento global, controles por teclado y toque |
| Proyección | Salud Financiera conserva magnitud propia: composición y porcentaje derivados del mismo resumen; texto no limitado a100% y ausencia de ingresos explícita |
| Operación | Test-first local con datos sintéticos y cluster efímero; deploy de código/build al servidor existente, sin migraciones ni escrituras financieras |

La selección global inicial del período se conserva. Si apunta al futuro, la vista lo indica en lugar de presentarlo como un mes histórico completo. Los endpoints anteriores conservan su contrato; los nuevos endpoints son GET y no ejecutan efectos de escritura.
