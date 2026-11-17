# Competición: Meta y Resultados (al estilo de las webs de meta)

Qué ofrece la sección:

- **El menú «Competición» abre Meta**. Explorar mazos vive en **Mazos → Explorar mazos** y tiene un botón «Explorar mazos» al final del ranking de Meta. Las rutas antiguas (`#competicion/mazos…`, `/torneos`, `/arquetipo/…`) siguen funcionando.
- **Meta** (por temporada, **GD06** y **GD05**, las dos desde Side-6): ranking de presencia por arquetipo, **Resumen** (puestos, arquetipos, cuota del top 3), **Cuota por color** (cada arquetipo pesa por sus puestos y reparte su peso entre sus colores; suma 100 %) y **Cartas más usadas** (estimación a la baja: puestos del arquetipo × adopción de la carta en su perfil; sin fichas). «Cambios recientes» compara cada temporada con la anterior.
- **Torneos**: agrupados por día y con **podio** (los 3 mejores puestos conocidos con su arquetipo; sin nombres de jugador). Son los torneos de las listas de ejemplo, no todos los de la temporada.
- **Ficha de arquetipo**: las cartas populares salen del **perfil de Side-6** del arquetipo (cientos de listas), no de las pocas listas de ejemplo.
- Sin dinero, vistas ni autores: nada de precios, mercado, Pro ni popularidad.

Lógica pura y probada en `comp_stats.js`: `metaSummary`, `colorShare` (con peso), `topCards`, `estimateTopCards`, `podium` (`tests/meta_resumen.test.js`). UI: `tests/ui_competicion_meta.mjs`.

## Cómo se actualizan los datos

```bash
python -I scripts/build_decklists.py   # descarga las 34 páginas de arquetipo de Side-6 (2,5 s entre peticiones, caché de 12 h) → data/decklists.json
python -I scripts/build_meta.py        # sin peticiones: lee la caché → data/meta.json (presencia por set + perfiles de cartas)
```

Los dos son «todo o nada»: si algo cambia en la fuente, se detienen sin escribir nada. Las páginas quedan en `data/meta/raw/` (ignorada por git). Tras actualizar no hay que subir `SHELL_VERSION`: el service worker sirve los JSON en red primero.

### Qué sale de cada página de Side-6 (formato web de nov 2026)

- `decks`: listas de ejemplo (hasta unas 15 por arquetipo) con las 50 cartas y sus puestos. Se guarda, de cada lista, su puesto más reciente dentro de la ventana de datos (desde 31 jul 2026), con el **set** de su ventana (GD05, GD06…). Nunca nombres de jugador.
- `windows`: una por ventana de set (`GD05`, `GD05:ST11-14`, `GD06`…) con los puestos del arquetipo, el total de puestos de la ventana y, si hay listas suficientes, un `consensus` por carta. Las ventanas intermedias cuentan para el set de la ventana principal (`GD05:ST11-14` → GD05).
- **Presencia** (`eraDecks`): puestos del arquetipo por set. **Perfil de cartas**: consenso del set más reciente (solo GD05/GD06) y, si no lo hay, las listas de ejemplo (si son al menos 5, marcado `sampleBased`); si tampoco, sin perfil.

### Si Side-6 vuelve a cambiar

Los arquetipos ya no son «xx-aggro/control/midrange»: son personajes («Mikazuki Barbatos 1st Form», «Strike Freedom») y cubos «BG Other». Si cambia otra vez el formato, `build_decklists.py` se detiene con un mensaje claro (índice con menos de 25 arquetipos, página sin `decks`…). Las pruebas del formato están en `tests/test_decklists.py` y `tests/test_meta_build.py`.

## Notas de la actualización del 17 nov 2026

- GD05 pasó de 8 219 a 11 847 puestos (se suman las ventanas `GD05` y `GD05:ST11-14`, hasta el 6 nov) y GD06 trae 848 puestos del 6 al 15 nov (34 arquetipos).
- **Los nombres de arquetipo cambian en toda la app** (Explorar, Meta, COMPARAR). Las listas de ejemplo bajan de 874 a 324 porque la fuente nueva da menos listas por arquetipo.
- `data/archetype_aliases.json` (nombres de WinDecks como «Mobile Fighter») no se ha tocado: sigue sirviendo a las listas de torneos del archivo `competition_events.json`, que ya no alimentan Meta ni Torneos de GD06 (el archivo sigue alimentando Explorar y «Crear desde mis cartas»).
- **Modo archivo** (diagnóstico y pruebas): con `localStorage.msa_comp_src = 'file'`, el archivo de torneos manda en los sets donde tiene torneos y Side-6 solo rellena el resto. Las pruebas de la lógica de temporadas de archivo (`ui_comp_*`) lo activan para seguir cubriéndola con datos reales.
- La prueba `tests/meta.test.js` mide «mismo par de colores» con 0,80 en vez de 0,95: con arquetipos por personaje, dos de colores distintos comparten más cartas (sale ≈ 0,84).
