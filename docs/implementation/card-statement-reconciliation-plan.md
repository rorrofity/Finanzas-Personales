# Estados de tarjetas por correo — plan y evidencia

**Estado:** implementación y validación completas; despliegue y activación pendientes. Especificación CSR escrita antes del código el 2026-11-01 America/Santiago. [Contrato](card-statement-reconciliation-contract.md).

1. Inspección privada de PDF nativos y N8N instalado; confirmar Gmail/API disponibles sin revelar claves.
2. TDD del extractor determinista local con fixtures, estructura multipágina CLP/USD y validaciones.
3. TDD de servicio/ingesta autenticada/idempotencia/conciliación sin escrituras financieras; migración aditiva033.
4. UI privada de resultados y detalle; pruebas de permisos, móvil/temas, estado actual y PWA.
5. Plantilla de workflow sin secretos, publicación vía API y prueba controlada del camino de adjuntos.
6. Construcción en servidor, instalación lector local,033 y configuración privada. Verificar ejemplos reales y nueve tablas financieras intactas; repetir y confirmar idempotencia.
7. Publicar evidencia no financiera y mantener repo/servidor sincronizados.

## Validación completada

- Backend: **548 pruebas / 25 suites**. Frontend: **250 / 30 suites**. Lector Python: **40 pruebas**. Navegador: **129 aprobadas / 13 omisiones previstas por viewport**; PWA: **7**. Total: **975 pruebas aprobadas** (548 backend de regresión más una nueva prueba, 17 casos finales del workflow).
- RED→GREEN de parser nativo/descifrado, ambas monedas, multipágina/adicionales, cuotas, signos, subtotales/ecuaciones y layout incompleto. Reauditoría corrigió abonos/traspasos internacionales contradictorios y PAN en textos con referencias adyacentes. Documentos reales aceptados privadamente con todas las secciones válidas; ningún dato real en fixtures.
- Extractor Node verifica stdin privado, límites y timeout; los caracteres UTF-8 partidos entre chunks se conservan y fallos EPIPE terminan el proceso.
- Servicio/matcher/rutas: metadata-only, identidad simétrica conservadora, procedencia bancaria, competencia de candidatos, reintento inválido→válido, deduplicación, revisiones y ACL. Workflow: pruebas de filtros exactos, todas las partes PDF, no mutación de correo ni mensajes salientes y salida mínima sin importes; plantilla idéntica al generador.
- PostgreSQL efímero: migración aditiva/idempotente, comparación viva, reenvío/concurrencia/versiones, conflicto de fuente, rollback real y recuperación. Nueve tablas financieras y configuración de tarjetas/importaciones intactas, incluidas notas, categorías y precisión de timestamps. Nunca carga .env ni accede a Gmail/base existente.
- [QA visual con fixtures](card-statement-reconciliation-qa/evidence.json): 375 px Claro/Oscuro y 1440 px, sin desplazamiento lateral, errores JS, peticiones inesperadas o escrituras. Captions/estado inválido nullable del último build revalidados con 16 recorridos CSR (2 omisiones previstas) y 7 PWA; unidad frontend completa final aprobada.

Comandos: `npm run test:backend -- --runInBand`, `CI=true npm run test:unit -- --runInBand`, `python -B -m unittest discover -s backend/services/cardStatements/tests -p 'test_*.py'`, `node tests/integration/card-statement-reconciliation.integration.cjs`, `DASHBOARD_BUILD_DIR=/private/tmp/finanzas-card-statements-final npm run test:dashboard`. Build final: `CI=true GENERATE_SOURCEMAP=false BUILD_PATH=/private/tmp/finanzas-card-statements-final npm run build`.

## Preparación operativa

N8N instalado y API existente accesible; se reutiliza su credencial Gmail sin extraerla ni publicarla. La referencia de publicación es activeVersionId; active es obsoleto en esta versión. Nueva plantilla separada con polling cada minuto y rama manual de los dos últimos mensajes autorizados; ejecuciones sin adjuntos persistidos. Lector Python instalado aisladamente con versiones probadas, sin IA ni OCR externo. Configuración privada, migración033, lectura real, publicación y comparación final se documentarán al verificarse.

## Ajuste verificado en el recorrido real

N8N 2.7.5 obtiene el correo completo con simple:false, pero descarga adjuntos únicamente con options.downloadAttachments:true. La primera prueba controlada detectó ausencia de binarios sin realizar ingestas. Prueba RED→GREEN adicional exige descarga explícita en generador y plantilla; 17 pruebas finales del flujo aprobadas. Se actualiza únicamente el workflow nuevo y se repite el recorrido real antes de cerrar.
