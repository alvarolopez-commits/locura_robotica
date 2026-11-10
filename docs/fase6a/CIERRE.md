# Cierre de la Fase 6A · estado de las puertas

Fecha: 10 nov 2026. Este documento separa lo **comprobado**, lo **preparado** y lo **pendiente**; no da por hecho nada que no se haya ejecutado.

## Puertas

| Puerta | Estado | Evidencia |
|---|---|---|
| 1 · Estado real y deduplicación | **Aprobada** | `tests/pipeline.test.js` 47/47 (huella sin tipo, tipo inferido, conflictos de tipo, reimportación idempotente, enriquecimiento sin sumar a n, datos personales, publicación atómica, rollback). Reimportación por consola sobre una copia: sin cambios y sin duplicados. |
| 2 · Supabase favoritos | **Preparada, no aplicada** | SQL revisado contra el esquema real, rollback, verificador y pruebas del material. Falta aplicarla en staging y pasar el verificador con dos cuentas reales. Ver [SUPABASE_FAVORITOS.md](SUPABASE_FAVORITOS.md). |
| 3 · QA en móvil físico | **Pendiente de prueba física** | Checklist y plantilla de incidencias en [QA_MOVIL_FISICO.md](QA_MOVIL_FISICO.md). No hay ninguna prueba hecha. |

## Supabase: tres estados distintos
| | SQL preparado | Aplicado en staging | Aplicado en producción |
|---|---|---|---|
| `supabase/favorites.sql` (migración base) | sí | no verificado | no verificado |
| `supabase/favorites_security.sql` (permisos) | sí | **no** | **no** |
| Prueba de aislamiento A/B por la Data API | verificador preparado | **no ejecutada** | n/a |

## Pruebas ejecutadas
Comandos y resultados de esta sesión (todos en local, sin red real):

| Comando | Resultado |
|---|---|
| `node tests/pipeline.test.js` | 47 pasan · 0 fallan |
| `node tests/detector.test.js` (rama 6B) | 23 pasan · 0 fallan |
| `node tests/security_static.test.js` | 8 pasan · 0 fallan |
| `node tests/rls_check.test.mjs` | 8 pasan · 0 fallan |
| `node tests/comp_stats.test.js` · `digilab_import` · `favorites_sync` · `design_rules` | 95 · 25 · 17 · 11, 0 fallan |
| `node scripts/verify_competition_data.js` | 18 correctas · 0 con problemas |
| UI: `ui_comp_v3.mjs` · `ui_comp_windecks.mjs` (última ejecución, antes de la 6A) | 291 · 40, 0 fallan |

## Incidencias

| ID | Gravedad | Descripción | Estado |
|---|---|---|---|
| S-01 | P2 | `save_favorites` ejecutable por `PUBLIC`/`anon` (falla con `not_authenticated`, sin exposición de datos) | Corregido en SQL; **sin aplicar** |
| S-02 | P2 | Mismo patrón en `create_deck`, `replace_deck_cards`, `set_card_quantity`, `duplicate_deck` y `save_collection` | **Abierto** (parche gemelo tras validar S-01) |
| S-03 | P3 | Permisos de `authenticated` en la tabla de favoritos implícitos | Corregido en SQL; **sin aplicar** |
| S-04 | P3 | `UPDATE` directo permite saltar el control de revisión de la RPC (solo su propia fila) | Aceptado, documentado |
| M-01 | — | Prueba en móvil físico (iOS y Android) | **No verificable** desde aquí: pendiente de prueba física |
| D-01 | P3 | `scripts/import_digilab.js` escribe directo en los datos publicados, sin pasar por la cola | Abierto (retirar al activar la fuente) |
| D-02 | P3 | El conector de DigiLab no se probó contra la API real (no hay clave ni permiso) | No verificable |
| K-01 | P3 | Equivalencia «Kshatriya Banshee» y «Kshatriya + Strike Freedom Gundam» sin verificar | Se mantienen **separados**, sin alias |

## Bloqueos para iniciar la Fase 6B real
* **Permiso y clave de DigiLab** (no están): sin ellos el detector solo corre con datos locales.
* Decisión de producto: la 6B ya está construida y apagada; activarla no depende de más código.
* Ninguno técnico pendiente en la 6A. Para publicar cambios de Supabase hace falta que la persona propietaria los aplique en staging y luego en producción.
