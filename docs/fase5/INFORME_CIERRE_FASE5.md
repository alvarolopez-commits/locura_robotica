# Informe de cierre · Fase 5 (4 nov 2026)

Estado: **todo en local, sin commit, push ni deploy.** Backup previo a editar: `data/meta/backup/pre_cierre_f5/` (diff y archivos nuevos).

## 0 · Lo que faltaba en la entrega
No estaban `GUNDANEO_CIERRE_FASE5_IMPLEMENTACION.zip` ni `02_CRITERIOS_QA.md` (ni en Descargas, Escritorio, Documentos ni `D:\ALVARO`). Se trabajó solo con `01_PROMPT_IMPLEMENTACION.md`. **No se usó «el verificador incluido»**: se escribió uno propio, `scripts/verify_competition_data.js` (18/18).

## 1 · Implementado
| Incidencia | Qué hace ahora | Dónde |
|---|---|---|
| **F5-06 Hecho** | Botón «Hecho» en la cabecera de la ventana del mazo, solo en modo construcción, ≥44×44, con nombre accesible y teclado. Llama a `setBuilding(false)`, cierra la ventana y anuncia «Has salido del modo construcción. Tu mazo sigue como lo dejaste» (sin prometer guardado en la nube). | `dashboard.html` |
| **F5-07 Comparar + variante** | «Comparar mi mazo» recibe la **identidad de la lista** (`#competicion/comparar/<id>`), no el arquetipo. Valida: 50 cartas, códigos del catálogo y legalidad; si falla no ofrece comparar ni variante y explica el motivo. Comparación como multiconjunto por código exacto (`coinciden=min`, `añadir=max(0,lista−mío)`, `retirar=max(0,mío−lista)`); **colección aparte** (`falta=max(0,lista−tengo)`; sin configurar → «—», no cero). Filas con imagen, código, cantidades e indicador de colección; fuente y enlace. **Crear variante**: (a) copia de mi mazo para editar; (b) con la lista aplicada, **solo tras confirmar**. Mazo nuevo con id propio y cartas clonadas; el original no se toca; si el guardado falla no se declara creada (se verifica releyendo el almacenamiento). Sin lista (p. ej. desde Mis mazos) se pide elegirla. | `dashboard.html`, `comp_stats.js` (`compareDecks`, `cloneCards`) |
| **F5-08 Muestra homogénea** | La presencia usa por defecto **solo eventos `dataQuality: top_cut_only`** (por calidad, no por fuente ni número fijo). Rótulo «Presencia entre listas publicadas Top 8/16 · n = 56». El torneo `single_deck` sigue en Torneos/ficha/construibles; un aviso explica que no entra y ofrece «Incluir (mezcla cortes)» → rótulo «…TODAS las listas… (mezcla cortes distintos) · n = 57» + chip + `cov=all` en la URL. Cartas populares: listas completas de cualquier cobertura, con su n (1 < 10). | `comp_stats.js`, `dashboard.html` |
| **F5-09 Taxonomía** | `data/archetype_aliases.json`: tabla explícita y revisable. Cada resultado gana `archetypeOriginal` (fuente) y `archetypeId` (canónico o null); `archetype` no cambia. Solo coincidencia exacta con nombre/alias: **«Kshatriya + Strike Freedom Gundam» y «Kshatriya Banshee» NO se fusionan** (duda anotada en `pendingReview`). Migración idempotente (`scripts/migrate_archetypes.js`); los importadores la aplican. Los enlaces `#competicion/arquetipo/<nombre>` antiguos y por alias siguen funcionando. | `data/*.json`, `scripts/`, `comp_stats.js` |
| Versión | `APP_BUILD` pasa de `2026-11-03.6` a **«Gundaneo v.2»**. | `dashboard.html` |

## 2 · Verificación de la muestra GD06 (datos reales)
6 eventos y 57 resultados visibles · **n principal = 56** (5 eventos top_cut_only) · Mobile Fighter 16/56 = **28,6 %** · lista de WinDecks consultable (Torneos, su ficha, construibles, comparar) · cartas populares n = 1 (< 10). `docs/fase5/verificador_datos.txt`: 18 correctas, 0 problemas.

## 3 · Pruebas ejecutadas (un worker, sin reintentos, 30 s por orden / 5 min por archivo)
| Prueba | Resultado |
|---|---|
| Unidad: `comp_stats` 95 · `digilab_import` 25 · `favorites_sync` 17 · `collection` 22 · `collection_sync` 15 · `decks_sync` 19 · `design_rules` 11 · `legality` 43 · `meta` 32 · Python ×4 | pasan |
| **`ui_comp_j3`** (recorrido J3 completo: torneo → comparar → diferencias → colección → variante → original intacto → recarga; fallo de guardado; colección sin configurar; lista sin composición; 360/430/1440) | **43/43** |
| **`ui_constructor_hecho`** (390/360/430/1440, teclado, persistencia, recarga, sincronización pendiente con servidor simulado) | **46/46** |
| `ui_comp_taxonomia` | 10/10 |
| `ui_comp_v3` 291 · `ui_comp_f4` 59 · `ui_comp_d3` 38 · `ui_comp_windecks` 40 | pasan (actualizadas a los textos y reglas nuevos) |
| Regresión de módulos vecinos: `ui_mis_mazos` 66 · `ui_iconos_mazo` 27 · `ui_deck_copy` 18 · `ui_deck_copysel` 28 · `ui_hud_refinado` 27 · `ui_fase2_ergonomia` 24 · `ui_fase3_feedback` 24 · `ui_fase4_qa` 16 · `ui_collection_deck` 34 · `ui_collection_tile` 20 · `ui_typography` 36 · `ui_cabecera_detalle` 54 · `ui_fase5_a11y` 7 · `ui_fase5_recorridos` 14 · `ui_logo_inicio` 21 | **todas pasan** |

Validación pedida: original y variante con **ids distintos**, cartas independientes y **persistencia tras recarga** → cubierta en `ui_comp_j3` (original idéntico byte a byte en cartas, nombre y fecha).

## 4 · NO ejecutado
- Batería completa de interfaz sobre la versión final: **no se repitieron** `ui_account`, `ui_catalogo_tokens`, `ui_collection_manager/nav/page/sync`, `ui_filter_order`, `ui_owned_filter`, `ui_tokens`, `ui_typography_system`, `ui_comp_*` ya listadas sí. Pasaron antes de este cierre; no se tocó su código, pero no están verificadas contra esta versión.
- Barrido de 11 pantallas × 5 anchos sobre esta versión; revisión visual humana del resto de secciones (solo Competición, el mazo y la colección en 390/430/1440 en las capturas).
- Comparar desde una lista de **GD05 (Side-6)**: el código la resuelve igual, pero no tiene prueba propia.
- RLS real con dos cuentas (falta aplicar `favorites.sql`), móvil físico, Lighthouse, lector de pantalla real.
- Búsqueda por nombre/código, cuadrados bicolores y «borrar con confirmación»: re-verificación pedida, **sin prueba nueva dedicada** (`ui_mis_mazos` y `ui_collection_*` previos pasan).

## 5 · Decisiones y límites a tener en cuenta
- «Hecho» está en la **ventana del mazo** (como pide el prompt): desde el catálogo hay que abrir el mazo primero (1 toque más).
- Comparación por **código exacto**: no hay equivalencias de reimpresión/arte.
- La variante «con la lista aplicada» queda igual a la lista; el nombre y la descripción mantienen el vínculo con mi mazo.
- El favorito sigue usando `temporada|nombre normalizado`; con alias reales habría que migrar su identidad (hoy todos los alias están vacíos).
- La taxonomía no tiene alias reales (todo identidad propia): la equivalencia de Kshatriya queda **pendiente de decisión** con comprobación externa.

## 6 · Pendientes de producción
Aplicar `supabase/favorites.sql` y probar RLS con dos cuentas · prueba en móvil físico · decidir equivalencias de arquetipos · conseguir más listas completas (cartas populares piden ≥ 10).

## 7 · Capturas
`docs/fase5/capturas-cierre/`: `comparador_390/430/1440`, `mazo_hecho_390/430/1440`, `coleccion_390/430`, `meta_390/430/1440`.
