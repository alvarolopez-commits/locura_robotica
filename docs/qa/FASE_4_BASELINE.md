# Fase 4 · Línea base (3 nov 2026)

## Estado de las fases anteriores (verificado en el árbol de trabajo, no por la existencia de un `.md`)

| Fase | Estado | Cómo se verificó |
|---|---|---|
| Optimización de la auditoría (catálogo fuera del HTML, capas `--z-*`, tokens) | **Publicada** (`325b4c4`, `b7032ad`) | `data/cards.js` aparte, HTML de ~0,5 MB; `tests/design_rules.test.js` |
| 1 · HUD refinado | **Implementada localmente, sin commit** | bloque `/* ===== HUD refinado … */` en `dashboard.html`; `tests/ui_hud_refinado.mjs` |
| 2 · Ergonomía | **Implementada localmente, sin commit** | `tests/ui_fase2_ergonomia.mjs`; F3 (botón de colección secundario) revertida por conflicto con un test previo |
| 3 · Microinteracciones | **Implementada localmente, sin commit** | `#deckLive`, `announceDeck()`; `tests/ui_fase3_feedback.mjs` |
| Sincronización de mazos + Token en Tipo + `schema.sql` | **Implementada localmente, sin commit** (el esquema SQL sí está aplicado en Supabase) | `tests/decks_sync.test.js`, `tests/ui_tokens.mjs` |

## Punto de partida

- Commit publicado: `b7032ad` («Versión 2026-11-02.7 en el diagnóstico»). El árbol de trabajo tiene cambios sin confirmar en `dashboard.html`, `decks_sync.js`, `supabase/schema.sql`, `tests/` y `docs/`. **Sin commit, push ni despliegue.**
- Service worker: `SHELL_VERSION = 'v13'` (sin cambios en esta fase; no se ha tocado la lista de precarga).
- Comparación «antes» = el commit `b7032ad` extraído con `git archive` en una carpeta aparte; «después» = el árbol de trabajo.

## Entorno

- Chrome 156.0.8078.74 sin interfaz (CDP, sin librerías), Node v24.14.0, Windows 10. **Es emulación**: no hay Android ni iOS reales, ni Lighthouse, ni Playwright.
- Servidor de pruebas local `docs/qa/evidencias/serve.mjs` con compresión **brotli** (como Vercel para HTML/JS/JSON). Una primera pasada sin compresión daba 2,4 MB y 11,2 s hasta la primera carta; con brotli `data/cards.js` pasa de 1,2 MB a 92 KB y el escenario es comparable al real. Las cifras de red de este informe son del servidor local, no de Vercel.
- Condiciones fijas para antes/después: 390×844, DPR 2, móvil; CPU 4× más lenta; red «4G lenta» (150 ms de latencia, 1,6 Mbps de bajada, 750 kbps de subida); contexto de navegador nuevo en cada repetición (sin caché, sin service worker, sin datos del usuario); **5 repeticiones, se muestra la mediana y el rango**.
- Escenarios: carga en frío (primera visita), carga con caché y service worker, carga sin conexión tras la precarga, latencia de 7 interacciones, memoria tras 20 aperturas y cierres de la ficha.
- Datos de prueba solo en `localStorage` del perfil aislado: ningún dato de cuentas reales, ninguna escritura en Supabase.

## Mediciones originales («antes», `b7032ad`)

| Escenario | Métrica | Mediana (rango) |
|---|---|---|
| Carga en frío | FCP | 688 ms (680–712) |
| | Primera imagen de carta en el DOM | 2 759 ms (2 739–2 787) |
| | CLS | 0,064 (0,064 en las 5) |
| | Transferido | 793 KB (721–868) |
| | Tareas largas | 1 de ~190 ms |
| Carga con caché | FCP | 228 ms |
| | Primera imagen de carta en el DOM | 499 ms |
| Sin conexión | Catálogo | 48 cartas, mazo local conservado, 3 tareas largas (~450 ms) |
| Interacciones (con caché, CPU 4×) | buscar «zaku» | 78 ms |
| | borrar la búsqueda | 86 ms |
| | filtro rápido de color | 143 ms |
| | añadir desde la rejilla | 36 ms |
| | abrir ficha | 94 ms |
| | añadir en la ficha | 50 ms |
| | abrir ventana del mazo | 98 ms |
| Memoria (20 ciclos de ficha) | heap tras GC | 2,87 → 2,99 MB; nodos y listeners sin crecimiento (0) |
| DOM | nodos en la apertura | 1 737 |

Tabla completa con «antes» y «después»: [`FASE_4_RESULTADOS.csv`](FASE_4_RESULTADOS.csv).

## Objetivos

Los del brief: sin regresión material, sin errores ni pérdida de datos, mejoras solo donde hubiera un cuello de botella medido. No se fijaron presupuestos numéricos antes de ver la línea base.
