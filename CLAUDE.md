# Locura robótica — guía para Claude

- Lee `PRODUCT.md` y `DESIGN.md` antes de tocar UI; `AUDITORIA_MAESTRA.md` tiene el estado y las prioridades.
- App publicada: `dashboard.html` (+ `legality.js`, `meta.js`, `collection*.js`, `decks_sync.js`, `sw.js`). Datos en `data/` (el catálogo va en `data/cards.js`, generado con `python scripts/embed_data.py`; no se incrusta en el HTML), imágenes en `images/`.
- Reglas de diseño comprobadas por `tests/design_rules.test.js` (sin rebotes, sin animar tamaños, texto ≥12 px, capas `--z-*`, sin `!important` salvo `[hidden]`/reducir movimiento, colores repetidos en tokens).
- Pruebas: `tests/*.test.js` (unidad) y `tests/ui_*.mjs` (UI). Ejecuta las relacionadas antes de dar algo por hecho.
- Si cambias la lista de precarga, sube `SHELL_VERSION` en `sw.js`.
- **No hagas commit, push ni despliegue sin que se pida expresamente.**
- Las versiones antiguas (`gundam-dashboard-v2/-v3`, `dashboard.html` y `all_cards.json` sueltos) están en `../_archivo/`: no se editan.
- Idioma de la interfaz y de los commits: español.
