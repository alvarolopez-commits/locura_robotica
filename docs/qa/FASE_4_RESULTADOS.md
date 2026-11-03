# Fase 4 · Resultados (3 nov 2026)

Línea base, entorno y condiciones: [`FASE_4_BASELINE.md`](FASE_4_BASELINE.md). Tabla completa antes/después: [`FASE_4_RESULTADOS.csv`](FASE_4_RESULTADOS.csv). Scripts y datos sin procesar: [`evidencias/`](evidencias/). Todo medido en Chrome 156 sin interfaz con emulación móvil; **no hay medidas en dispositivos reales**.

## Resumen ejecutivo

- **No se encontró un cuello de botella de rendimiento que justificara cambios de optimización**, así que no se tocó nada con ese fin (ni `decoding`, ni precarga, ni el service worker).
- **Mejoras medidas** (5 repeticiones, mediana): desplazamiento de diseño (CLS) de la primera carga **0,064 → 0,012**; en la ventana del mazo los controles por debajo de 44 px pasan de 10–21 a 7 (el resto son los chips de 40 px por decisión de diseño).
- **Sin cambio medible**: primera carta visible tras la primera carga (**2,76 s → 2,77 s**), transferido (**793 KB → 799 KB**), nodos DOM (1737 → 1740), memoria tras 20 aperturas y cierres de la ficha (sin crecimiento de nodos ni de listeners), carga sin conexión (48 cartas y mazo conservado en las dos).
- **Diferencias pequeñas en las interacciones** (CPU 4× más lenta): buscar 78 → 81 ms, filtro rápido 143 → 151 ms, añadir 36 → 40 ms, abrir ficha 94 → 106 ms, abrir ventana del mazo 98 → 106 ms. El filtro, buscar y añadir se solapan con la variación entre repeticiones; **abrir la ficha (+12 ms) es consistente y no se ha podido atribuir** a ninguna de las reglas de las fases 1–3 (A/B de 5 variantes: ninguna cambia el resultado). Queda como observación.
- **Un fallo real encontrado y corregido** (no de rendimiento): pedir cerrar la ficha (×, Escape o tocar fuera) mientras la carta aún "volaba" hacia ella se ignoraba y la ficha se quedaba abierta. Ahora se cierra al aterrizar. Test: `tests/ui_fase4_qa.mjs`.
- **Un ajuste táctil**: el nombre del mazo en la barra del mazo (abre el mazo) medía 34 px de alto; ahora tiene 44 px de zona pulsable sin mover el diseño.

## Métricas no comparables

- **LCP**: con el título más pequeño de la fase 1, el elemento LCP cambia (texto del título → imagen de carta en algunas repeticiones). Mediana en frío 688 → 684 ms, pero el rango «después» llega a 5,3 s en 2 de 5 repeticiones. No es una regresión de carga —la primera carta aparece a la vez en las dos versiones—, pero la métrica no es comparable.
- **Borrar la búsqueda**: la versión publicada no podía (la lupa repetía la búsqueda); por eso no hay «antes» comparable de esa acción.

## Recorridos F01–F12

| ID | Recorrido | Estado | Evidencia / motivo |
|---|---|---|---|
| F01 | Primera visita → Catálogo | **PASSED** | primera carta a 2,8 s en 4G lenta, 0 errores de consola (`perf_*.json`) |
| F02 | Buscar → filtrar → borrar | **PASSED** (estado vacío solo revisado en código) | `ui_filter_order`, `ui_hud_refinado`, `ui_fase2_ergonomia`; el estado «sin resultados» existe en el código y no se capturó |
| F03 | Ficha → scroll → cerrar | **PASSED** | scroll y filtros conservados; `ui_fase4_qa` (cierre durante el vuelo), `ui_fase3_feedback` (4 aperturas seguidas) |
| F04 | Añadir desde la ficha → mazo | **PASSED** | `ui_fase3_feedback`, `ui_iconos_mazo` |
| F05 | Copias y límite | **PASSED** | 3 copias + 2 toques rápidos = 4; con 50 cartas no se añade; `legality.test.js` 43/43 |
| F06 | Guardar / reabrir / editar mazo | **PASSED** (solo local) | recarga y actualización conservan el mazo (`sw_update.mjs`); sin cuenta real |
| F07 | Mi colección | **PASSED** | ~360 comprobaciones `ui_collection_*` |
| F08 | Meta Lab y Competición | **PASSED** abrir/navegar · contenido de Meta Lab **no revisado visualmente** | matriz de anchuras (abre en todas, 0 errores), `ui_comp_*`, `meta.test.js` 32/32 |
| F09 | Sin conexión → volver | **PASSED** tras la precarga · primera carga sin conexión **NOT RUN** (no aplica) | `sw_update.mjs`: arranca, 48 cartas, mazo local, Mis mazos y Mi colección, 0 imágenes rotas |
| F10 | Cuenta y sincronización | **PASSED** con Supabase simulado · **BLOCKED** con Supabase real | tests unitarios y de UI con servidor falso (59 comprobaciones); no hay cuenta de prueba aislada ni segundo dispositivo |
| F11 | Animaciones de la fase 3 | **PASSED** | `ui_fase3_feedback` 24/24; latencias en el CSV |
| F12 | Actualizar la PWA | **PASSED** con una limitación | publicada → actual sin bucle, sin versiones mezcladas, mazo conservado y arranque sin conexión con la versión nueva. **`sw.js` no cambia (v13)**: no se ha ejercido un reemplazo del service worker en sí, solo la actualización de la página y de `decks_sync.js` |

## Matriz visual (320, 360, 375, 390, 430, 768, 1440 px)

Nueve pantallas por anchura (catálogo, búsqueda, filtros, ficha, mazo, Mis mazos, Mi colección, Competición, Meta Lab): **0 desbordes horizontales, 0 elementos con texto menor de 12 px, 0 errores de consola** en las dos versiones. Datos: `evidencias/matrix_antes.json` y `matrix_despues.json`.

## Pruebas ejecutadas

`node tests/design_rules.test.js`, `legality`, `meta`, `collection`, `collection_sync`, `decks_sync` y todos los `tests/ui_*.mjs` (26 grupos) con `run_all`; resultado final en verde. **No ejecutados**: tests Python de efectos/abilities, Lighthouse, Playwright, dispositivos reales.

## No verificado / pendiente

- Android Chrome e iOS Safari reales; teclado virtual abierto; orientación horizontal; tamaño de fuente del sistema elevado; trazas de scroll (jank) y de INP.
- Sincronización con Supabase real y con dos dispositivos.
- Contenido visual de Meta Lab y estado «sin resultados» del catálogo.
- Chips de filtro, selector de orden y «Limpiar filtros» miden 40 px (decisión de diseño documentada).

## Estado

**Validado localmente · pendiente de validación física.**
