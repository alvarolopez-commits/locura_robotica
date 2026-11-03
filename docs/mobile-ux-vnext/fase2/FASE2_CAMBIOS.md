# Fase 2 · Cambios (2 nov 2026)

Todo en local: sin commit, push ni despliegue. Sin tocar `legality.js`, `data/`, `collection*.js`, `decks_sync.js` ni Supabase en esta fase.

## Implementado

1. **F1 · Borrar la búsqueda desde el buscador** (`dashboard.html`): el botón `#searchBtn` ya existente muestra la lupa sin texto y un «×» tonal con texto (`aria-label` "Borrar búsqueda" / "Clear search"). Al pulsarlo borra solo la búsqueda (los demás filtros siguen) y deja el foco en el campo; sin texto, lleva el foco al campo. Función `paintSearchBtn()`, llamada al escribir, al limpiar filtros y al cambiar de idioma.
2. **F2 · − + papelera del mazo a 44×44** (CSS): `.dv-sbtn` 32 px visibles con `::after` de 6 px por lado; `.dv-step` con 12 px entre botones para que las zonas no se solapen.

## No implementado (y por qué)

- **F3 · "Añadir a mi colección" como secundaria en la ficha:** se probó (fondo `--tone`), pero `tests/ui_collection_tile.mjs` fija ese botón en navy `#221e41` por una decisión de diseño anterior. No se reescribe el test para que pase: queda como propuesta para que la decida el usuario.

- **Swipe para cerrar la ficha:** el brief lo desaconseja por conflicto con el scroll interno.
- **Mover el cierre de la ficha abajo:** sería un control nuevo o una reorganización de la hoja; ya hay scrim y Escape.
- **Avisos / toasts:** el feedback actual (contador con progreso, número en la ficha, "Límite alcanzado") ya es correcto y honesto; no se añade otro sistema.
- **Teclado virtual (T8):** no verificable sin dispositivo real.

## Archivos

- `dashboard.html`: botón del buscador (2 iconos), textos `searchClear`, `paintSearchBtn()` y 3 bloques de CSS dentro del bloque del HUD refinado.
- `tests/ui_fase2_ergonomia.mjs` (nuevo): borrar búsqueda conservando filtros y foco, 44×44 sin solape, totales del mazo. Contra la versión publicada falla; contra la actual pasa 27/27.
- `docs/mobile-ux-vnext/fase2/`: estos documentos y las capturas `antes/` y `despues/`.

## Recorrido: ¿menos pasos?

Mismo número de pasos en T2–T7. En T1, borrar la búsqueda pasa de "seleccionar y borrar el texto a mano" (o "Limpiar filtros", que también quitaba los filtros) a **1 toque** que conserva los filtros. El resto de mejoras son de precisión (zonas táctiles) y jerarquía, no de pasos.
