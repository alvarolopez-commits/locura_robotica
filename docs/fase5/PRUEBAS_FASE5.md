# Pruebas · Fase 5 (4 nov 2026)

Entorno: Chrome sin ventana (emulación), servidor estático local, datos de prueba. Cada archivo de interfaz corre con tope de 5 min y 30 s por orden al navegador (`run_sub.mjs`/`run_all.mjs` con `spawnSync` y cierre de pestañas entre archivos). **Un solo worker, sin reintentos.** No se reprodujo el bloqueo de 55 min.

## 1. Qué se ejecutó
| Ejecución | Alcance | Resultado | Cuándo |
|---|---|---|---|
| Línea base completa (`node run_all.mjs`) | 9 de unidad + 4 de Python + 27 de interfaz | **todo pasa** (`linea_base_2026-11-04.txt`) | antes de cambiar nada en la fase |
| Unidad y Python (final) | `collection` 22 · `collection_sync` 15 · `comp_stats` 71 · `decks_sync` 19 · `design_rules` 11 · `digilab_import` 25 · `favorites_sync` 17 · `legality` 43 · `meta` 32 · 4 de Python | **todo pasa** | versión final |
| Interfaz, regresión dirigida | `ui_fase5_a11y` 7 · `ui_comp_windecks` 34 · `ui_comp_d3` 38 · `ui_fase5_recorridos` 14 · `ui_hud_refinado` 27 · `ui_collection_tile` 20 · `ui_fase2_ergonomia` 24 · `ui_fase3_feedback` 24 · `ui_typography` 36 · `ui_fase4_qa` 16 | **todo pasa** (≈5 min) | versión final |
| Interfaz de Competición | `ui_comp_v3` 291 · `ui_comp_f4` 59 | pasan | tras el cambio de fixture, **antes** de los 2 cambios de accesibilidad |
| Barrido (`ui_fase5_barrido`) | 11 pantallas × 360/390/430/768/1440 | 0 desbordamientos, 0 excepciones, 0 respuestas ≥ 400, 0 repetidas | versión final (`barrido_*.json`) |
| Prueba que falla antes / pasa después | `ui_fase5_a11y` | 5 FALLAN → 7/7 (`a11y_antes.txt`, `a11y_despues.txt`) | |

## 2. NO ejecutado (y por qué)
- **Batería completa de interfaz sobre la versión final**: la paré a petición del dueño (plazo de 10 min). Quedan sin repetir tras los 2 cambios de accesibilidad: `ui_comp_v3`, `ui_comp_f4` y el resto de archivos de interfaz (`ui_account`, `ui_cabecera_detalle`, `ui_catalogo_tokens`, `ui_collection_*` salvo `tile`, `ui_deck_copy*`, `ui_filter_order`, `ui_iconos_mazo`, `ui_logo_inicio`, `ui_mis_mazos`, `ui_owned_filter`, `ui_tokens`, `ui_typography_system`). Los cambios son un `aria-labelledby` y un `::after` en `.rule-badge`; riesgo bajo, pero **no verificado por esas pruebas**.
- RLS contra Supabase real; móvil real; Lighthouse; lector de pantalla; contraste calculado; peso de imágenes (PERF-02); modo sin conexión con service worker.
- CMP-01/CMP-03: «crear variante» y comparar contra una lista concreta no existen.

## 3. Checklist de QA (estado)
| ID | Estado | Evidencia / nota |
|---|---|---|
| NAV-01 | PASÓ | `ui_comp_v3`, `ui_fase5_recorridos` |
| NAV-02 | PASÓ | rutas por `#hash`, enlaces directos probados; sin rutas de servidor |
| NAV-03 | PARCIAL | desde Mis mazos y desde lista verificada abre el comparador existente (`ui_comp_windecks`); no compara contra esa lista |
| NAV-04 | PASÓ parcial | `ui_fase2_ergonomia`, `ui_hud_refinado` |
| CAT-01 | NO EJECUTADO | sin prueba dedicada de búsqueda por nombre/código |
| CAT-02 | PASÓ | `ui_filter_order` (línea base) |
| CAT-03 | NO EJECUTADO | sin prueba ni captura del cuadrado bicolor |
| COL-01 / COL-02 | PASÓ | `collection.test`, `ui_collection_*` (línea base), `ui_comp_f4` |
| DECK-01 | PASÓ parcial | `ui_mis_mazos`, `ui_deck_copy` (línea base); borrar con confirmación no re-verificado en esta fase |
| DECK-02 | PASÓ | `legality.test` 43 |
| DECK-03 | PARCIAL | zona pulsable de filas ≈42×42 (F5-11) |
| CMP-01 / CMP-03 | NO APLICA | no implementado (F5-07) |
| CMP-02 | PASÓ | `ui_comp_v3`, `ui_comp_d3` |
| CMP-04 | PASÓ | `decks_sync.test` 19 |
| META-01…06, TOUR-01…03 | PASÓ | `comp_stats.test`, `ui_comp_v3/f4/d3/windecks` |
| ARC-01, ARC-02, ARC-03 | PASÓ (servidor simulado) | `ui_comp_f4`, `ui_comp_d3` |
| SEC-01 | PARCIAL | revisión estática correcta; real NO EJECUTADO |
| SEC-02, SEC-03 | PASÓ | `ui_comp_d3`, `ui_fase5_recorridos` |
| SEC-04, SEC-05 | PASÓ tras F5-01/02 | búsqueda de claves y de nombres; sin código de red hacia MetaSheep |
| UX-01 | PARCIAL | F5-10, F5-11 |
| UX-02 | PASÓ | `aria-label` por barra con % y n (`ui_comp_v3`) |
| UX-03 | PASÓ | cargando / vacío / error probados por separado |
| PERF-01 | PASÓ (limitado) | 0 peticiones repetidas en el barrido |
| PERF-02 | NO EJECUTADO | `loading="lazy"` presente en el código; tamaños y fallback sin medir |
| PERF-03 | PASÓ | topes por orden y por archivo |

## 4. Matriz responsive
Medición automática (desbordamiento horizontal, errores, objetivos, nombres accesibles) en las 11 pantallas × 5 anchos: **sin desbordamiento**. **Revisión visual**: solo de Competición (capturas en `docs/mobile-ux-vnext/competicion-v3` y `fase4-personalizada`, 360/390/430/1440); el resto de pantallas no se revisó visualmente en esta fase.

## 5. Capturas
- Antes (producción, versión previa de Competición): `docs/mobile-ux-vnext/competicion-v3/antes_listas_390.png`, `antes_listas_1440.png`, `antes_overview_390.png`, `antes_overview_1440.png`.
- Después: `meta_*`, `torneos_*`, `gd05_*`, `ficha_*` (regeneradas sin nombres) en `competicion-v3/`; `para_ti_*`, `construibles_*`, `sin_favoritos_*`, `ficha_arquetipo_390` en `fase4-personalizada/`.
