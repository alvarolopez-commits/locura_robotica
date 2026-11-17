# Competición: Meta y Resultados (al estilo de las webs de meta)

Qué cambia respecto a la V1 (explorar mazos):

- **El menú «Competición» abre Meta** (`COMP_V1 = false`). Explorar mazos vive en **Mazos → Explorar mazos** y tiene un botón «Explorar mazos» al final del ranking de Meta. Las rutas antiguas (`#competicion/mazos…`, `/torneos`, `/arquetipo/…`) siguen funcionando.
- **Meta** (por temporada, GD05 / GD06): ranking de presencia por arquetipo (sin cambios), **Resumen** (listas, arquetipos, cuota del top 3), **Cuota por color** (cada lista reparte 1 entre sus colores; suma 100 %) y **Cartas más usadas** (inclusión = listas con la carta / listas con composición conocida; 10 y «Ver las 30 primeras»; sin fichas).
- **Torneos**: agrupados por día y con **podio** (los 3 mejores puestos conocidos con su arquetipo; sin nombres de jugador; si no hay puesto, no se pinta).
- Sin dinero, vistas ni autores: nada de precios, mercado, Pro ni popularidad.

Lógica pura y probada en `comp_stats.js`: `metaSummary`, `colorShare`, `topCards`, `podium` (`tests/meta_resumen.test.js`). UI: `tests/ui_competicion_meta.mjs`.

## Datos y su límite

- GD05 sale de Side-6 (874 listas, hasta el 26 oct 2026); GD06 de WinDecks (56 listas, 1–3 nov 2026). Cada temporada se calcula con su propia muestra y la fecha de actualización sigue visible.
- **Refrescar desde Side-6 hoy no funciona**: `scripts/build_decklists.py` espera los arquetipos antiguos (`xx-aggro/control/midrange`) y Side-6 ahora publica 34 con otros nombres. El script se detiene sin escribir nada (todo o nada). Para actualizar hay que adaptar el importador a la taxonomía nueva y reconstruir `data/archetype_aliases.json`; es un trabajo aparte que cambia los nombres de arquetipo en toda la app.
