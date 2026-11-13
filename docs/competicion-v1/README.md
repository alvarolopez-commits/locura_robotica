# Competición V1 y «Crear desde mi colección»

Dos iteraciones de prueba, sin publicar, en la misma rama (`feat/desde-mi-coleccion-v1`, que incluye la de Competición). Ambas reutilizan los datos y el componente de lista que ya existían.

## Competición V1 · explorar mazos
Ruta: **Competición → arquetipo → lista → cartas → Copiar mazo**. El menú abre `#competicion/mazos`; Meta y Torneos siguen en sus rutas de siempre (`#competicion`, `/torneos`, `/arquetipo/…`, `/torneo/…`, `/comparar/…`) y desde la portada hay un enlace «Ver Meta y Torneos». Para volver a que el menú abra Meta y Torneos basta con `COMP_V1 = false` en `dashboard.html`.

* **Cómo se identifica una lista completa:** `CompStats.deckStatus` = suma exactamente 50 cartas y todos los códigos existen en el catálogo. Solo esas listas salen (de torneo; las de comunidad no se mezclan).
* **Reutilizable hoy:** 875 de 931 posibles (94,0 %): 874/874 de `data/decklists.json` (Side-6) y 1 de los 57 resultados de `competition_events.json` (el resto solo tiene arquetipo y puesto). Salen 31 arquetipos.
* **Arquetipo** = nombre + temporada (los GD05 de Side-6 y los GD06 no se mezclan). Orden: actividad más reciente. Carta del arquetipo: la que más listas incluyen (desempate: menos presente en el resto, Unidad/Piloto antes, código). Miniaturas de cada lista: unidades y pilotos con 2+ copias que menos aparecen en las otras listas del arquetipo. Todo determinista.
* **Sin** jugadores, puestos, porcentajes ni «50 cartas» en las tarjetas. La fecha es la del evento y ordena; sin fecha, la lista va al final con «Fecha no disponible».
* **Copiar mazo** crea siempre un mazo nuevo (nombre «<arquetipo> · Copia», renombrable), comprueba que lo guardado coincide con la lista y, si no, no dice que se copió.
* Estados: cargando, vacío («Todavía no hay listas completas disponibles»), sin coincidencias del buscador, error con «Reintentar» (y aviso de conexión) e imagen que falta (recuadro con el nombre).

## Crear desde mi colección
Entrada rosa en **Mi colección** (`--collection-builder: #CD9FC8`, icono `icons/avatar-de-perfil.png`, el PNG suministrado sin tocar y añadido a la precarga: `SHELL_VERSION` v16) y **Competición → «Desde mis cartas»**. Es la misma pantalla (`#competicion/mias`).

1. **Elegir (1–3 cartas).** Solo salen los Pilots/Units con al menos una copia en la colección (nada preseleccionado). Filtro de color, búsqueda por nombre/código, Pilots/Units y LR (solo en Units). Cada elegida es **Imprescindible** (por defecto) o **Me gustaría incluirla**; la cuarta no entra y no borra nada.
2. **Link.** Al elegir un Pilot salen las Units compatibles (primero las que tienes, después las que no; por nombre antes que por rasgo) con «Añadir a búsqueda» explícito (entran como «Me gustaría incluirla»). Quitar el Pilot quita sus propuestas, no las Units ya añadidas.
3. **Buscar mazos.** Por código exacto, sobre las listas completas de arriba. Primero las que traen **todas** las imprescindibles; dentro, más deseadas y después la más reciente. Si no hay ninguna: «No hay listas publicadas con todas tus cartas imprescindibles» y el botón «Explorar coincidencias parciales» (con aviso de que no es un mazo probado con la combinación completa y con ✓/✗ por carta). Nunca se relaja en silencio.
4. **Ver lista / copiar:** el mismo componente de lista, con un aviso de cuántas cartas distintas tienes.

Estado en la URL: `#competicion/mias[/buscar | /lista/<clave>]?s=GD01-087.m,GD01-001.w[&p=1]` (códigos y prioridad; recargar o ir atrás lo recupera).

### Link: límites conocidos
`Meta.linkMatch/linkUnitsFor` (extraído de `detectPackages`, que mantiene su comportamiento) lee el campo `link` de la Unidad: `[Nombre]` = Piloto con ese nombre, `(Rasgo) Trait` = Piloto con ese rasgo, separados por « / » (vale cualquiera). La igualdad es **exacta** (sin mayúsculas), así que «Banagher» no enlaza con «Banagher Links» ni un rasgo parecido cuenta: puede haber falsos negativos (un Piloto con otro nombre impreso), nunca falsos positivos. Solo se leen los rasgos entre paréntesis y no se comprueba color ni nivel. Sin Link («-») no hay compatibilidad.

### Colores
Si la combinación elegida rompe el límite de colores se avisa (`Legality.maxAddable`, sin reglas nuevas) pero se puede buscar igualmente.

## Lo que NO hace / pendiente
* No genera mazos ni inventa composiciones; no usa resultados ni win rate; no cambia la colección ni ningún mazo hasta «Copiar mazo».
* Las listas de comunidad no entran (solo torneo: Side-6 y las completas de `competition_events.json`). Hoy solo hay 1 lista completa del archivo de torneos propio.
* El estado «cargando colección» solo cubre catálogo sin cargar o cuenta sin sincronizar y colección vacía; **no se ha probado con una sincronización real** (no hay cuenta de prueba aquí).
* Sin probar en móvil físico.

## Archivos
`dashboard.html` (vistas, CSS, textos, rutas), `meta.js` (Link), `comp_stats.js` (criterios y búsqueda), `sw.js` (precarga + v16), `icons/avatar-de-perfil.png`, `tests/desde_coleccion.test.js`, `tests/ui_desde_coleccion.mjs`, `tests/ui_competicion_v1.mjs`.
