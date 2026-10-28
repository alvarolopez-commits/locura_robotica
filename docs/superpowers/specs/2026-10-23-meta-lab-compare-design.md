# Meta Lab / COMPARAR — diseño V1

Fecha: 2026-10-23. Proyecto: Locura robótica (`dashboard.html`, una sola página, JS plano, ES por defecto + EN).
Especificación de producto de origen: `C:\Users\34656\Downloads\locura_robotica_meta_lab_compare.md` (la "spec"). Este documento fija **qué se construye en V1 y cómo se alimenta de datos**; donde la spec y este documento difieran, manda este documento.

Convención: **[DECIDIDO]** lo dijo o aprobó Álvaro. **[MI DECISIÓN]** es una propuesta mía que Álvaro puede cambiar.

## 1. Intención

Álvaro construye mazos de 50 cartas en la app. Quiere que, justo al completar las 50 cartas, pueda pulsar **COMPARAR** y ver cómo encaja su mazo con lo que realmente se juega en competitivo: a qué arquetipo se parece, qué cartas son habituales, cuáles faltan, cuáles son raras y por qué. La promesa de la spec: *"No solo sabemos qué cartas existen. Sabemos cómo se están jugando"* y *"te enseñamos dónde encaja tu mazo sin obligarte a copiar el meta"*.

Todo número debe venir de evidencia real, con muestra, ventana y fuente a la vista. Nada de puntuaciones opacas (spec §0).

## 2. Objetivos V1

1. **[DECIDIDO]** El botón **COMPARAR** aparece cuando el mazo en construcción llega a 50 cartas (no hace falta guardarlo antes). Con menos de 50 no aparece. También estará en las fichas de "Ver mis mazos" para mazos de 50.
2. Informe "Meta Lab" con: arquetipo más parecido + % de similitud + nº de listas + nivel de evidencia; arquetipos candidatos (hasta 4); comparación de composición; desglose por carta (adopción, copias medias, rol Core/Common/Flex/Off-meta/Nueva/Datos insuficientes); "Cartas habituales que no estás jugando"; "Elecciones poco habituales"; paquetes detectados; "¿Por qué?" en cada métrica; fuente y fecha de los datos.
3. Un mazo ilegal también se puede comparar, con el aviso de spec §3. Legalidad y competitividad nunca se mezclan; el rojo queda reservado a reglas rotas, las etiquetas de meta son informativas.
4. Modos de comparación: arquetipo más cercano (por defecto), elegir arquetipo, mismo par de colores, todo el meta.
5. Etiquetado honesto del contexto: "GD05 + ST11–ST14 · PRE‑GD06", fecha de recogida y ventana de datos.

## 3. No objetivos

- **[DECIDIDO]** No se descargan las ~13.000 listas una a una. Se trabaja con los **perfiles agregados por arquetipo** de Side‑6.
- Fuera de V1 (spec V2–V4): eventos y puestos propios, top‑cut/ganadores, gráficos de tendencia, filtros de región/majors, partidas seguidas (TCGGather), win rates, matchups, cobertura de counters, colección, **MEJORAR MAZO** y vista previa de cambios, historial de versiones, alertas, simulador de manos.
- No hay puntuación de "calidad" del mazo. No se calcula win rate de cartas. No se edita nunca el mazo del usuario desde Meta Lab.
- No hay backend ni consulta en vivo: la app sigue siendo estática.

## 4. Fuente de datos y su límite

**[DECIDIDO]** Fuente: Side‑6 (`https://side-6.com/en/archetypes/` y cada `/en/archetypes/{slug}/`, más `/en/meta/` para el resumen). Recon hecho el 2026‑10‑23:

- `robots.txt` permite todo; no se ve API, exportación ni términos de uso. La web declara que no está afiliada a Bandai.
- Cada página de arquetipo se sirve renderizada en HTML (≈3 MB) e incluye por carta: número de carta (`ST11-009`), nombre, porcentaje de listas que la llevan, copias medias y nivel; reparto por tipo (unidades, pilotos, comandos, bases), curva de nivel/coste, reparto de color, nº de listas, ≈40 listas de ejemplo con copias y puesto, y enlaces a páginas de lista (`/en/decklists/{hash}`) y de evento (`/en/events/{id}/`).
- **Límite importante (comprobado en `bp-aggro`):** el perfil por carta es el "Popular Cards (top 40)" de cada arquetipo, no la lista completa de ~50 cartas. Una carta fuera del top 40 no tiene porcentaje exacto: solo se sabe que está por debajo de la adopción de la carta nº 40 de ese arquetipo (cota superior). La página dice tener ≈40 listas de ejemplo, pero en el HTML solo viene **una lista completa por arquetipo** (las demás son variaciones sin cartas); las demás listas están en páginas aparte `/en/decklists/{hash}` que V1 no descarga. Por tanto `sampleDecks` tiene como mucho 1 elemento y **no se puede basar la detección de paquetes en co‑ocurrencia de listas**.
- Hay 30 arquetipos en el índice (los 10 pares de colores × Aggro / Midrange / Control) con nombres tipo "BW Control", "BP Midrange" (color + estilo). La spec usa nombres de TCGGather ("G/R Char's Zaku II") que **no** existen aquí. **[MI DECISIÓN]** Se usan los nombres de Side‑6, mostrados como "B/W Control", "B/P Midrange"; el slug de Side‑6 es el identificador (ojo: "GR Midrange" tiene slug `rg-midrange`).
- Ventanas: Side‑6 solo filtra por set (GD03/GD04/GD05/histórico) y muestra su propia ventana (p. ej. "12 semanas"). **No hay 14/30/60/90 días.** **[MI DECISIÓN]** En V1 no hay selector de periodo: se muestra la ventana real de los datos tal como la declara la fuente. El selector de 14/30/60/90 queda para V2.
- Sin eventos con país: casi todo es Japón. No hay filtro de región en V1.

**Riesgo asumido, a conocimiento de Álvaro:** los porcentajes de adopción y copias medias son métricas derivadas por Side‑6, no datos crudos nuestros (la spec §43 prefiere métricas propias). Se mitiga con: uso personal y no comercial, atribución visible en la UI y en el informe, pocas peticiones (unas decenas) y espaciadas, guardar procedencia (URL + fecha) en cada dato, y diseñar la ingesta para poder sustituir la fuente sin tocar la UI. Si Side‑6 publica términos o una API, se revisan antes de seguir.

## 5. Datos y pipeline

Siguiendo el patrón actual (scripts en `scripts/`, datos en `data/`, incrustados en el HTML por `scripts/embed_data.py`):

- **Todo o nada [MI DECISIÓN]:** si faltan arquetipos o cambia la estructura de alguna página, el script aborta sin escribir `meta.json` y dice qué falló; no se generan snapshots parciales.
- `scripts/scrape_meta.py`: descarga el índice y cada arquetipo con User‑Agent identificable, ≥2 s entre peticiones, caché de HTML crudo en `data/meta/raw/` (no se vuelve a pedir lo ya descargado el mismo día), y falla con mensaje claro si la estructura de la página cambia.
- `scripts/parse_meta.py`: HTML → `data/meta.json`. Debe ser testeable con HTML guardado.
- `data/meta.json`:
  ```
  { snapshot: { id, retrievedAt, source: {id, name, url, sourceType:"tournament_database"},
                formatLabel: "GD05 + ST11–ST14 · PRE-GD06", windowLabel, windowFrom?, windowTo? },
    archetypes: [ { id (slug), name, colors:["B","W"], deckCount, eventCount?, sourceUrl,
                    cards: { "ST11-009": { adoption: 0.95, avgCopies: 3.97 } },
                    typeMix?, sampleDecks: [ { placement, sourceUrl, cards:{number:qty} } ] } ] }
  ```
  Las cartas se identifican **siempre por número de carta**, nunca por nombre (spec §45). Comprobado: el catálogo tiene 1086 números únicos, sin versiones paralelas ni reimpresiones con número distinto; si Side‑6 usara números que el catálogo no tiene, se registran. Números que no existan en el catálogo se registran y se informan, no se descartan en silencio.
- **[MI DECISIÓN]** Los snapshots anteriores se conservan (`data/meta/history/`) para que, a partir de la segunda recogida, pueda calcularse tendencia en puntos porcentuales. En la primera versión no hay tendencia y la columna no se muestra.
- Incrustado en `dashboard.html` como `META_DATA` por `embed_data.py` (con la misma comprobación de ida y vuelta), y cacheado offline por el service worker (subir `SHELL_VERSION`).

## 6. Cálculo (módulo `meta.js`, UMD como `legality.js`, con tests en Node)

Todo debe poder explicarse en el panel "¿Por qué?".

- **Adopción por arquetipo** = lo que dice el perfil (`adoption`); **copias medias** = `avgCopies` (solo entre listas que llevan la carta, como en spec §16.2). Copias esperadas por lista = `adoption × avgCopies`.
- **Similitud** [MI DECISIÓN]: Jaccard ponderado **sobre las cartas del perfil top 40** del arquetipo. Por cada carta c del perfil: `u` = copias del usuario, `e` = copias esperadas, `w` = adopción. `similitud = Σ w·min(u,e) / Σ w·max(u,e)`. Las cartas del usuario fuera del perfil no entran en la fórmula; se informa aparte de cuántas de las 50 cartas están cubiertas por el top 40 ("cobertura") y esa cobertura se muestra junto a la similitud. Pondera más lo central, tiene en cuenta cantidades (3 copias frente a 3,9 de media da similitud parcial alta, no error) y no usa solo coincidencia de nombres. Se muestra siempre con el texto de spec §7 ("no es probabilidad de ganar").
- **Arquetipos candidatos**: se calcula la similitud contra todos los arquetipos y se muestran los 4 mejores. Si el mejor es inferior a un umbral configurable (arranque: 25 %) se muestra el estado "No encontramos un arquetipo claro" de spec §52 con las opciones mismo color / meta global. Nunca se fuerza una respuesta única.
- **Roles de carta** (umbrales de spec §14, configurables): Core ≥75 %, Common 50–74,9 %, Flex 20–49,9 %. Carta fuera del top 40 del arquetipo → **Off‑meta** si la evidencia del arquetipo es suficiente, mostrando "por debajo del X %" (X = adopción de la carta nº 40), nunca un porcentaje inventado. Si una carta sí está en el top 40 pero con adopción <20 %, se muestra como **Flex bajo** (poco habitual) y entra en "Elecciones poco habituales" [MI DECISIÓN: cubre el hueco 10–19,9 % de la spec]. **NEW**: la carta pertenece a un set cuya fecha de lanzamiento es posterior a la fecha de datos del snapshot (el catálogo ya tiene el campo `set` por carta; **las fechas de lanzamiento no existen aún**, se añaden en una tabla pequeña `data/sets.json` con fuente oficial: GD06 = 2026‑10‑30, el resto desde la web oficial). No se usa "reciente" de forma difusa. **DATOS INSUFICIENTES**: muestra del arquetipo bajo el umbral. **TECH no se asigna en V1** (la spec dice que no se puede deducir por adopción). Off‑meta nunca se presenta como "malo".
- **Evidencia** (spec §15, configurable): ALTA ≥100 listas, MEDIA 30–99, BAJA 10–29, INSUFICIENTE <10, según `deckCount` del arquetipo. Evidencia por carta = evidencia de su arquetipo.
- **Adopción global** [MI DECISIÓN]: media de adopción ponderada por `deckCount` de todos los arquetipos. Se etiqueta como aproximada si los arquetipos no cubren todas las listas del snapshot.
- **Composición** (spec §12): unidades/pilotos/comandos/bases, coste medio, unidades Lv5+, unidades tempranas, y las categorías funcionales ya existentes en `tags` (p. ej. "robo de cartas", "daño directo"). El valor de meta se obtiene sumando `adopción × copias medias` sobre el perfil, así no se inventa ningún dato de referencia. Si no hay dato, se omite la fila.
- **Cartas habituales que no juegas**: cartas Core/Common del arquetipo seleccionado en las que el usuario juega menos que la media redondeada, con adopción, copias medias y muestra (spec §18; criterio exacto de umbral a fijar en el plan, con test E).
- **Elecciones poco habituales**: cartas del usuario con adopción baja o ausentes del perfil, con el texto neutro de spec §19.
- **Paquetes** (spec §20, test C): objetivo, que no se recomiende quitar una carta rara si forma parte de una sinergia intencionada. **Qué cuenta como paquete (decisión del plan):** (a) una Unidad del mazo y el Piloto de su campo `link` presentes a la vez, y (b) 3 o más cartas del mazo que comparten el mismo rasgo (`trait`), cuando alguna de ellas es poco habitual. Debe poder mostrarse como "paquete detectado: A + B" junto a las cartas poco habituales implicadas. En V1 no hay recomendaciones de recorte; solo información.

## 7. Interfaz

- Mantiene el estilo actual (HUD, teal, esquinas cortadas, Zen Kaku Gothic New / Big Shoulders Display). Etiquetas de rol en tonos teal/ámbar/gris; **nunca rojo** (reservado a legalidad).
- Entrada: `COMPARAR` junto a la barra de estado de 50/50 del mazo en construcción y en las fichas de mazos completos.
- Pantalla "Meta Lab": cabecera (nombre del mazo, colores, 50 cartas, chip de legalidad existente, arquetipo más cercano, similitud, listas, evidencia, contexto de snapshot), selector de modo de comparación, y pestañas **Resumen / Cartas / Diferencias** (Rendimiento y Matchups no aparecen en V1).
- Escritorio: tabla de cartas con columnas de spec §13 (sin Top‑cut ni Tendencia). Móvil: tarjetas por carta con chips (spec §50).
- Textos del ES/EN dentro del diccionario i18n actual. Estados vacíos de spec §52/§53. Mensaje de carga de spec §4.
- **Calibración [MI DECISIÓN]:** el umbral de "arquetipo claro" (25 %) es solo un punto de partida. Se calibra con los mazos reales ya guardados por Álvaro y con listas de ejemplo de Side‑6 antes de darlo por bueno.
- Pie con la fuente (Side‑6, enlace, fecha de recogida) y, en cada métrica, "¿Por qué?" con: nº de listas que la contienen sobre el total, copias medias, ventana, fuente.
- **Frontera de set (test H)**: si el usuario tiene cartas de un set posterior al snapshot (p. ej. GD06 tras el 30 oct 2026), esas cartas salen como NEW y se muestra un aviso de que el meta es anterior a ese set. Nunca se mezclan en un mismo conjunto de datos homogéneo.

## 8. Restricciones y reglas de trabajo

- **[DECIDIDO]** Nada se sube a GitHub/Vercel ni se publica hasta que Álvaro lo diga. Todo queda en local.
- Sin backend. Funciona offline con los datos incrustados. Sin dependencias nuevas de ejecución.
- La procedencia (fuente, URL, fecha) nunca se pierde. Reproducible: borrar `META_DATA` y regenerarlo con los scripts debe dar el mismo resultado.
- Tests: `tests/meta.test.js` (similitud, roles, evidencia, composición, frontera de set, mazos sin datos), `tests/test_meta_parse.py` con HTML de ejemplo guardado, y las pruebas A–H de spec §61 que apliquen a V1 (G no aplica: no hay matchups).
- Los datos de ejemplo de spec §37–41 son solo semilla de desarrollo y **no** se incrustan como verdad.

## 9. Criterios de aceptación V1

- Con 49 cartas no hay botón; con 50 sí.
- Un mazo que replica un arquetipo conocido devuelve ese arquetipo primero, con similitud alta, nº de listas y evidencia.
- Un mazo híbrido devuelve varios candidatos y no fuerza uno.
- Una carta rara que forma paquete con otras del mazo no genera ninguna recomendación de quitarla.
- Una carta nueva (set posterior al snapshot) sale NEW, nunca OFF‑META.
- Si falta una carta con ≥75 % de adopción aparece en "Cartas habituales que no estás jugando" con adopción, copias medias y muestra.
- 3 copias frente a 3,9 de media se muestra como "Tú 3 / Meta 3,9", sin etiqueta de error.
- Cualquier cifra tiene su "¿Por qué?" y su fuente.
- Sin datos suficientes se muestran los estados de spec §52/§53, no estadísticas inventadas.

## 10. Lo que se deja al constructor

Algoritmo exacto de detección de paquetes; umbral exacto de "habituales que faltan"; formato de caché y reintentos del scraper; diseño visual detallado de la pantalla dentro del estilo existente; nombre final de las etiquetas en inglés.
