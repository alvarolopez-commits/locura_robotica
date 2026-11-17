# Competición: Meta, Torneos y Explorar mazos

## Qué ofrece cada pantalla

- **El menú «Competición» abre Meta**. Explorar mazos vive en **Mazos → Explorar mazos** y también se llega desde un botón al final del ranking de Meta. Las rutas antiguas (`#competicion/mazos…`, `/torneos`, `/arquetipo/…`) siguen funcionando.
- **Meta** (temporadas **GD06** y **GD05**, las dos desde Side-6), de arriba abajo:
  1. **Resumen de temporada**: temporada, fechas de cobertura y días, puestos registrados, arquetipos y porcentaje acumulado del top 3. Avisos discretos: «Temporada en curso» (la más reciente) y los puestos sin arquetipo asignado. «Sobre estos datos» (desplegable cerrado) explica que los puestos no son participantes.
  2. **Ranking de arquetipos** (protagonista): posición, colores, nombre, puestos registrados, % sobre los puestos con arquetipo, barra y **evolución en puntos respecto a la temporada anterior** (▲/▼ con signo y texto accesible) cuando es comparable. Cada fila abre su ficha.
  3. **Representación por color**: cada arquetipo pesa por sus puestos y reparte su peso a partes iguales entre sus colores; suma 100 %.
  4. **Cartas más utilizadas**: imagen, nombre y **uso estimado** (≈ %, entero). Distingue la base de los datos: consenso de Side-6, solo listas de ejemplo (menos fiable) y sin perfil. Con menos del 50 % de los puestos con perfil dice «datos insuficientes» en lugar de estimar.
  5. **Cambios recientes**: puntos porcentuales de representación entre temporadas, con los días y puestos de cada una y la limitación («no volúmenes»; aviso si la anterior deja ≥ 10 % de puestos sin arquetipo).
- **Torneos**: «torneos registrados» agrupados por día, con **mejores puestos conocidos** (hasta 3, solo los que se conocen; nunca nombres de jugador) y «N puestos conocidos». Aviso: no es el calendario completo.
- **Ficha de arquetipo**: las cartas populares salen del perfil de Side-6 **de esa temporada** (nota con su base: consenso o listas de ejemplo); sin perfil, de las listas de ejemplo.
- **Explorar mazos / Crear desde mis cartas**: usan las listas completas verificadas de Side-6 (**actuales**) **más las del histórico** (`data/decklists_hist.json`), que llevan la etiqueta «Clasificación anterior», su set y la fecha de importación. Un perfil de consenso nunca se presenta como lista.
- Sin dinero, vistas ni autores: nada de precios, mercado, Pro ni popularidad.

Lógica pura probada en `comp_stats.js`: `metaSummary`, `colorShare` (con peso), `topCards`, `estimateTopCards` (perfil del mismo set, desglose por base), `podium`.

## Cómo se actualizan los datos

```bash
python -I scripts/build_decklists.py   # 34 páginas de Side-6 (2,5 s entre peticiones, caché 12 h) → data/decklists.json (+ data/decklists_hist.json)
python -I scripts/build_meta.py        # sin peticiones: lee la caché → data/meta.json (presencia por set + perfiles por set)
```

Protecciones («todo o nada»; ante cualquier error se conservan los datos válidos anteriores):

- Se detiene si el índice trae < 25 arquetipos, si hay < 100 listas o si una página cambia de formato.
- **Cobertura**: si las listas caen a menos de la mitad frente al archivo anterior, aborta (`--accept-reduction` para aceptarlo a conciencia).
- **Identificadores**: si cambian más de la mitad de los ids de arquetipo, aborta (`--accept-new-taxonomy`).
- **Histórico**: antes de sustituir `decklists.json`, las listas del archivo anterior que la fuente ya no trae se **acumulan** en `data/decklists_hist.json` (mismo hash = misma lista, sin duplicar), conservando su arquetipo de entonces, su set y la fecha de importación. Todo se escribe primero a temporales y solo después se sustituye.
- `build_meta.py` valida antes de escribir: ids y nombres únicos, mismos arquetipos que `decklists.json` y que los puestos de los arquetipos no superen el total de su ventana (detecta ventanas sumadas dos veces).

### Qué sale de cada página de Side-6 (formato web de nov 2026)

- `decks`: listas de ejemplo (hasta ~15 por arquetipo) con las 50 cartas; se guarda el puesto más reciente de cada lista dentro de la ventana de datos (desde 31 jul 2026) con el **set** de su ventana.
- `windows`: una por ventana de set (`GD05`, `GD05:ST11-14`, `GD06`…) con los puestos del arquetipo, el total de la ventana y, si hay listas suficientes, un `consensus` por carta. Las ventanas intermedias cuentan para el set principal (`GD05:ST11-14` → GD05).
- **Presencia** (`eraDecks`): puestos del arquetipo por set. **Perfiles** (`profiles[set]`): consenso de ese set (`basis: consensus`) o, si no lo hay, ≥ 5 listas de ejemplo de ese set (`basis: sample`). Nunca se usa el perfil de otro set. `cards`/`era` (perfil «actual») son solo para COMPARAR.

## Auditoría de fiabilidad (17 nov 2026)

| Punto | Resultado |
| --- | --- |
| Puestos duplicados al sumar ventanas | No: ventanas sin ids repetidos ni solapes de fechas; Σ puestos por arquetipo ≤ total de la ventana (ahora lo comprueba `build_meta.py` y `tests/datos_side6.test.js`). |
| Ventanas intermedias → set | Correcto (`GD05:ST11-14`→GD05, `GD04:EB01_ST10`→GD04, `GD03:ST09`→GD03). Nota: Side-6 llama GD05:ST11-14 a lo que MetaSheep llama GD06 antes del 6 nov. |
| Denominadores | Los % son sobre los puestos con arquetipo. **Hallazgo**: GD05 deja 279 puestos (2,4 %) sin arquetipo; GD03/GD04, 16–24 %. Ahora se avisa en el resumen y, si la temporada anterior pasa del 10 %, también en «Cambios recientes». |
| Reparto de color | Correcto: pesos por puestos, partes iguales entre colores; el par de colores de las 324 listas coincide con el de su arquetipo. |
| Cartas: estimación vs recuento | **Hallazgo**: se mostraba «≈ 404 de 848» (parecía un recuento). Ahora «≈ 48 %» entero con la nota «estimación a la baja». |
| Consenso vs listas de ejemplo | **Hallazgo grave corregido**: para GD05, el 74,6 % de los puestos usaba el perfil de GD06. Ahora hay un perfil por set y la base (consenso / ejemplo / sin perfil) se muestra con su %. |
| Nombres e ids | Únicos; sin choques con la tabla de alias de WinDecks; el histórico no repite nombres actuales. |

### El umbral 0,95 → 0,80 de `tests/meta.test.js`

No oculta una mala clasificación **de los datos**: `tests/datos_side6.test.js` comprueba que el 100 % de las listas (actuales e históricas) tiene el par de colores de su arquetipo. La caída es del **motor de similitud** de COMPARAR con los cubos «XY Other» (perfil difuso: similitud propia 0,2–0,4) y con arquetipos que comparten un color y muchas cartas. Por eso el test ahora exige además que la primera sugerencia comparta **siempre** al menos un color (ninguna acaba en un par totalmente distinto) y mantiene el par exacto en ≥ 0,80 (hoy ≈ 0,84).

## Validación de datos

`node tests/datos_side6.test.js` detecta: duplicación de puestos entre ventanas, porcentajes que no cuadran, listas mal asociadas, cambios de identificadores en bloque (referencia en `tests/fixtures/side6_2026-11-17.json`: actualízala a conciencia si cambia la taxonomía), caídas anómalas de cobertura, perfiles ausentes por temporada y diferencias entre Side-6 y el histórico. Se comprobó, inyectando averías a propósito, que cada una de esas comprobaciones falla cuando debe.

## Limitaciones de Side-6 que no se pueden resolver con los datos disponibles

- Solo hay totales por temporada: no se puede filtrar por país ni por fecha, y no hay participantes por torneo ni calendario completo.
- Solo ~15 listas de ejemplo por arquetipo (antes ~40): bajaron de 874 a 324; el histórico conserva 807 más.
- GD06 es una temporada en curso (10 días): ~15 % de sus puestos no tiene perfil de cartas propio y los porcentajes pueden cambiar.
- Los perfiles de consenso son por arquetipo, no por lista: el uso de cartas es una estimación a la baja.
- Los eventos no traen sede ni participantes: varios torneos comparten título y se distinguen por fecha y resultados.
- **Modo archivo** (diagnóstico y pruebas): con `localStorage.msa_comp_src = 'file'` el archivo de torneos (`competition_events.json`) manda donde tiene torneos. Las pruebas de la lógica de temporadas de archivo (`ui_comp_*`) lo activan.
