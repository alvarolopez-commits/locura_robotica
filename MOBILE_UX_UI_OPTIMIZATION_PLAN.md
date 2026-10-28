# Plan de optimización UX/UI móvil — Locura robótica

Base: [`MOBILE_UX_UI_AUDIT.md`](MOBILE_UX_UI_AUDIT.md). **La implementación (fase 3) no empieza hasta tener autorización.**
Todo vive en `dashboard.html` (CSS + JS de una sola página); sin dependencias nuevas.

## Lotes y orden

### Lote 1 — Objetivos táctiles y accesibilidad (P1/P2: #1, #2, #3, #4, #5, #9)
- **Componentes:** `.fv.is-link`, `.dc-del`, `.db-top-logo`, `.deck-count`, `.hamburger`, `.tag.chip`, `.clearbtn`, `.dv-sbtn`, `.ds-btn`, `.fx-box`, etiquetas de `#tabbar`, `.dv-meta`.
- **Cambios:** `min-height`/`width` 44 px en `@media (pointer:coarse)`; Link como objetivo de 44 px; tipografía mínima 12 px.
- **Mejora esperada:** cero objetivos < 24 px y ninguno < 44 px en táctil; texto < 12 px = 0.
- **Riesgo:** filas de chips más altas (más scroll en filtros); cabecera algo más alta. Revisar que la rejilla no pierda la 2.ª columna a 320.
- **Validación:** volver a pasar `audit.mjs` (mismas 91 combinaciones) y exigir `tinyTargets = 0`, `smallText = 0`.

### Lote 2 — Componente único de cantidad (P1: #6)
- **Componentes:** `deckCtlEl` (ficha), `renderDeckView` (`.dv-sbtn`), `stepperEl` (`.deck-stepper` en detalle de mazo).
- **Cambios:** un único estilo de "− n + papelera" (círculo 44 px, borde azul, + verde con copias, papelera rosa a la derecha) con variante para fondos oscuros.
- **Dependencias:** Lote 1 (tamaños).
- **Riesgo:** el detalle de mazo a 320 px necesita la fila bajo el nombre (ya resuelto en esta pasada).
- **Validación:** capturas comparadas de las 3 pantallas; prueba funcional +/−/papelera en cada una.

### Lote 3 — Primera impresión y contenido (P1: #7, #8, #10; P2: #12, #13)
- **Componentes:** `#warmToast`, `#quickFilters`, fondos de Mis mazos/detalle, placeholder del buscador, botones del detalle de mazo.
- **Cambios:** aviso de descarga como píldora sobre la barra inferior; chips de color en dos líneas (o scroll con indicio); velo sobre la foto o paneles opacos; placeholder corto en ≤375; botones a una línea.
- **Riesgo:** el aviso no debe tapar la barra inferior ni el botón "Ver N cartas" de filtros.
- **Validación:** primera visita sin caché a 320/390 con `h1` visible; contraste AA en los textos de los paneles; los 5 colores visibles a 320.

### Lote 4 — Consistencia tipográfica y navegación (P2: #11, #14)
- **Cambios:** clase `.code` para códigos de set (Inter completo o ajuste de tamaño del subconjunto); botones de la home que hagan lo mismo que las pestañas; acceso visible a Competición si se decide.
- **Validación:** revisión visual de chips SET y titulares de Competición; mismos destinos desde ambos accesos.

### Lote 5 — Rendimiento (P1: #15)
- **Componentes:** `render()` del catálogo, `scripts/embed_data.py`, `sw.js`.
- **Cambios:** pintar la rejilla por lotes (p. ej. 60 cartas y más al acercarse al final con `IntersectionObserver`) manteniendo filtros, contador y transición de carta; opcionalmente sacar los datos a un JSON cacheado por el service worker.
- **Riesgo (alto):** la transición carta → ficha → carta busca la carta por número en el DOM (si no está pintada, usa el cierre de respaldo, que ya existe); búsquedas y filtros deben seguir mostrando el total correcto; funcionamiento sin conexión.
- **Validación:** repetir la medición con CPU ×4 y red lenta: elementos al arrancar < 5 000, DOMContentLoaded por debajo de los 2,4 s actuales; pruebas de legalidad/efectos verdes; recorrido completo sin conexión.

## Criterios generales de aceptación
- 0 px de scroll horizontal en 320–1440 (como ahora).
- 0 errores de consola y 0 recursos rotos en todos los recorridos.
- Escritorio (1440) sin regresiones visuales.
- `node tests/legality.test.js`, `node tests/meta.test.js`, `python -I tests/test_effects.py` y `tests/test_abilities.py` en verde tras cada lote.
