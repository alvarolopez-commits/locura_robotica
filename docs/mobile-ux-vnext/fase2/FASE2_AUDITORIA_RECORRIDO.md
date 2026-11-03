# Fase 2 · Auditoría del recorrido (2 nov 2026)

Medido con Chrome sin interfaz (emulación móvil, `prefers-reduced-motion: reduce`), app local en `http://localhost:8766`, datos solo en `localStorage` (mazo de prueba de 16 cartas, modo construcción). **No es una prueba en dispositivo real.** Script: `fase2_audit.mjs` (guardado fuera del repositorio, en el scratchpad de la sesión).

## Gate 1 · HUD refinado: PASÓ

- Implementado en el árbol de trabajo (bloque `/* ===== HUD refinado … */` al final del `<style>` de `dashboard.html`).
- Batería completa en verde antes de empezar: 23 grupos, incluido `tests/ui_hud_refinado.mjs` (29/29).
- Identidad: navy/sky/paper y cortes diagonales intactos; 2 columnas desde 320 px; barra inferior con sus 5 botones reales (Catálogo, Filtros, Nuevo, Mazos, Colección; no se ha cambiado); ficha, filtros y mazo siguen siendo hojas.
- Capturas de la línea base: `antes/antes_<ancho>_<estado>.png` a 320×568, 375×667, 390×844 y 430×932 (1 catálogo, 2 búsqueda, 3 filtros, 4 ficha, 5 mazo, 6 límite de copias).

## Tareas T1–T8

| ID | Tarea | Pasos/toques | Observado (igual en los 4 tamaños salvo donde se indica) |
|---|---|---|---|
| T1 | Buscar por nombre | escribir | Resultados en vivo ("22 de 1086" con "zaku"). El buscador sigue visible (pegajoso). **El botón de la lupa no hacía nada útil** (repetía la búsqueda) y el «×» nativo está oculto: para borrar había que borrar a mano o usar "Limpiar filtros", que borra también los filtros. |
| T2 | Filtrar y abrir una carta | 4 (Filtros · Tipo · Unidad · Ver N) + 1 | Al cerrar la ficha se conservan scroll (p. ej. 1552 → 1552 a 390) y filtros (679 → 679). Cierre de la ficha a 44×44 arriba a la derecha; + − papelera a 44×44 junto a la carta. |
| T3 | Añadir una copia | 1 | El contador de la cabecera pasa de 16 a 17 y la ficha muestra 1. Correcto. |
| T4 | Superar el límite | — | Al llegar a 4 el + se deshabilita y la ficha explica "4 / 4 en el mazo · Límite alcanzado". Correcto. |
| T5 | Abrir el mazo | 1 (contador de la cabecera) | Correcto. |
| T6 | Cambiar copias en el mazo | 1 | Totales coherentes (20 → 19 en la ventana y en la cabecera). **− + papelera: 30×30 visibles y 34×44 pulsables**, por debajo de 44×44. |
| T7 | Volver al catálogo | 1 (Volver) | Se conservan scroll y filtros. Correcto. |
| T8 | Con teclado abierto | — | **No verificable**: la emulación sin interfaz no abre el teclado virtual. Solo se comprobó que el buscador es pegajoso y no queda fuera de pantalla. Revisar en un móvil real. |

Errores de consola durante todo el recorrido: 0.

## Hallazgos (frecuencia × impacto × esfuerzo)

| ID | Pantalla | Hallazgo | Evidencia | Severidad | Cambio mínimo | Riesgo |
|---|---|---|---|---|---|---|
| F1 | Catálogo · buscador | No se puede borrar la búsqueda desde el campo; la lupa no hace nada (la búsqueda ya es en vivo) | T1, `searchBtn` → `runSearch` | Media (tarea muy frecuente) | Reutilizar el mismo botón: lupa sin texto, «×» "Borrar búsqueda" con texto; solo borra la búsqueda | Bajo |
| F2 | Mazo · filas | − + papelera pulsables a 34×44 | T6 | Media | 32 px visibles, 44×44 pulsables sin solaparse | Bajo: el nombre pierde ~22 px a 375–430 (los datos pasan a 2 líneas) |
| F3 | Ficha | "Añadir a mi colección" (navy a todo el ancho) compite con el + de copias del mazo | captura `antes_*_4_ficha` | Baja | Propuesta (no aplicada: un test fija ese botón en navy por decisión previa) | — |
| — | Ficha | Cierre arriba a la derecha, lejos del pulgar | T2 | Baja | Sin cambio: hay scrim y Escape; el swipe para cerrar no se añade (conflicto con el scroll, como indica el brief) | — |
| — | Teclado | No verificable en emulación | T8 | — | Revisión manual | — |
