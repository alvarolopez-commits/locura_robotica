# Meta Lab / COMPARAR Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cuando un mazo llega a 50 cartas, el botón COMPARAR abre un informe que lo compara con los perfiles competitivos por arquetipo de Side‑6 (similitud, roles de carta, cartas que faltan, elecciones poco habituales, paquetes, procedencia).

**Architecture:** Un scraper en Python descarga las 30 páginas de arquetipo de Side‑6 y un parser las convierte en `data/meta.json`; `embed_data.py` lo incrusta en `dashboard.html` como `META_DATA`. Un motor puro `meta.js` (UMD, como `legality.js`) calcula todas las métricas a partir de mazo + perfil + catálogo. La interfaz (`dashboard.html`) solo pinta lo que devuelve `Meta.compare`.

**Tech Stack:** Python 3 (stdlib: `urllib`, `re`, `html`, `unittest`), JS plano sin dependencias, Node para tests (`node tests/meta.test.js`, mismo estilo que `tests/legality.test.js`), Chrome headless/built‑in browser para verificación visual.

**Spec:** `docs/superpowers/specs/2026-10-23-meta-lab-compare-design.md` (diseño aprobado) y, como origen, `C:\Users\34656\Downloads\locura_robotica_meta_lab_compare.md`. Si difieren, manda el diseño.

## Global Constraints

- **No hacer `git commit`, `git push`, desplegar a Vercel ni publicar artefactos.** Álvaro lo prohibió hasta que diga lo contrario. Donde otros planes dicen "commit", aquí hay un "checkpoint" que solo ejecuta tests.
- Sin backend ni dependencias de ejecución nuevas. La página debe funcionar offline con `META_DATA` incrustado.
- Las cartas se identifican siempre por `number` (p. ej. `ST11-009`), nunca por nombre.
- Procedencia en cada dato: fuente, URL de la página, `retrievedAt`. La UI cita Side‑6 con enlace y fecha.
- Rojo reservado a legalidad. Las etiquetas de meta usan teal/ámbar/gris (clase propia, no `.rule-badge`).
- Textos en el diccionario i18n actual (`t()` con ES por defecto y EN). Nada de textos sueltos en el JS de pintado.
- Umbrales (valores literales del diseño, deben vivir en un único objeto `Meta.DEFAULTS`): rol Core ≥ 0.75, Common ≥ 0.50, Flex ≥ 0.20; evidencia HIGH ≥ 100 listas, MEDIUM ≥ 30, LOW ≥ 10, INSUFFICIENT < 10; "arquetipo claro" ≥ 0.25 (provisional); Off‑meta por debajo del top 40.
- Respeta el estilo del código existente (ES5 con `var`, comentarios en español, ids `kebab`/camel como los actuales).
- Scraper cortés: User‑Agent `LocuraRobotica/1.0 (personal, non-commercial)`, ≥2 s entre peticiones, caché de HTML en `data/meta/raw/`, sin correo del usuario en cabeceras.

## Review Focus

Entradas que el diseño implica y ninguna tarea prueba de forma natural; cada una tiene su test en la tarea indicada.

1. Mazo con números de carta que ya no existen en el catálogo (localStorage antiguo): se ignoran y se informan, sin lanzar error. → Task 5.
2. `META_DATA` ausente o con 0 arquetipos (scraper nunca ejecutado): el botón COMPARAR no aparece y no hay excepción. → Task 7.
3. Arquetipo con `deckCount` 0, sin cartas o con una sola carta: similitud 0, sin división por cero ni NaN. → Task 4.
4. Mazo con cartas de GD06 (set posterior al snapshot): salen como NEW, el aviso de frontera aparece y no se mezclan con datos. → Task 5.
5. Cambiar de idioma o editar el mazo con el informe abierto: el informe se repinta o se cierra si el mazo deja de tener 50 cartas, sin quedar obsoleto. → Task 7.

---

## File Structure

| Archivo | Responsabilidad |
|---|---|
| `data/sets.json` (nuevo) | Fecha de lanzamiento por set |
| `scripts/parse_meta.py` (nuevo) | HTML de Side‑6 → dicts (puro, sin red) |
| `scripts/scrape_meta.py` (nuevo) | Red + caché + todo‑o‑nada + escribe `data/meta.json` |
| `data/meta.json`, `data/meta/history/` (generados) | Snapshot actual y anteriores |
| `scripts/embed_data.py` (modificar) | Incrusta `META_DATA` y `SET_DATES` |
| `meta.js` (nuevo) | Motor puro `Meta.*` |
| `dashboard.html` (modificar) | Botón, pantalla Meta Lab, i18n, estilos |
| `sw.js` (modificar) | Precache de `/meta.js`, `SHELL_VERSION` → `v3` |
| `tests/test_meta_parse.py`, `tests/fixtures/meta/*.html`, `tests/meta.test.js` (nuevos) | Pruebas |

---

### Task 1: Fechas de lanzamiento de sets

**Files:**
- Create: `data/sets.json`
- Modify: `scripts/embed_data.py`
- Test: `tests/meta.test.js` (primer bloque, ver Task 4)

**Interfaces:**
- Produces: `data/sets.json` = `{ "sets": { "GD05": {"releaseDate":"2026-07-24","source":"<url>"}, ... } }` para todos los sets del catálogo (EB01, GD01–GD06, ST01–ST14). Variable incrustada `SET_DATES` = el objeto `sets`.

- [ ] **Step 1:** Consulta las fechas oficiales en `https://www.gundam-gcg.com/en/products/` (y la página de cada set). GD06 = `2026-10-30`, GD05 = `2026-07-24`. Anota la `source` de cada una. Si algún set no tiene fecha verificable, déjalo fuera y dilo en el informe final.
- [ ] **Step 2:** Extiende `embed_data.py` para incrustar `SET_DATES` (mismo patrón `embed/extract`, cierre `"\n};"`, `after_var="ABILITY_CONFIG"`) y comprobar el ida y vuelta.
- [ ] **Step 3:** Ejecuta `python scripts/embed_data.py`. Esperado: imprime los sets y no falla la aserción.
- [ ] **Step 4: Checkpoint:** `python tests/test_abilities.py` y `node tests/legality.test.js` siguen en verde.

---

### Task 2: Parser de páginas de Side‑6

**Files:**
- Create: `scripts/parse_meta.py`, `tests/test_meta_parse.py`, `tests/fixtures/meta/bp-aggro.html`, `tests/fixtures/meta/index.html`
- Test: `tests/test_meta_parse.py`

**Interfaces:**
- Produces (en `scripts/parse_meta.py`):
  - `parse_index(html: str) -> list[str]` → slugs de arquetipo ordenados y sin duplicados (`/en/archetypes/{slug}`, 30 esperados).
  - `parse_archetype(html: str, slug: str, url: str) -> dict` →
    ```
    {"id": slug, "name": "B/P Aggro", "colors": ["B","P"], "style": "Aggro",
     "deckCount": 151, "eventCount": int|None, "windowLabel": "Aug 3 – Oct 25, 2026 (12 weeks)",
     "sourceUrl": url,
     "cards": {"ST11-009": {"adoption": 0.93, "avgCopies": 3.97}, ...},   # "Popular Cards (top 40)"
     "cutoff": 0.xx,            # adopción de la carta nº 40 (o la última listada)
     "sampleDecks": [ {"placement": "3rd", "sourceUrl": str|None, "cards": {"GD05-050": 4}} ]  # 0 o 1 elemento
    }
    ```
- Reglas: `name` se muestra con barra entre colores ("BP Aggro" → "B/P Aggro"; ojo `rg-midrange` es "GR Midrange" en el texto: usa el texto de la página para el nombre y el slug como `id`). `adoption` en 0‑1. Si el HTML no contiene la sección "Popular Cards" lanza `ValueError` con el slug.

- [ ] **Step 1:** Guarda fixtures reales recortados a su marcado relevante (cabecera con "N decklists", "Data window", sección "Popular Cards (top 40 - N decklists)", y "Sample Decklist" con su Mainboard). Genera `index.html` con los enlaces de arquetipo. Los originales están descargables con `curl -A "LocuraRobotica-research (personal, non-commercial)" https://side-6.com/en/archetypes/bp-aggro/`; no hace falta guardar los 3 MB, solo lo que el parser lee, **con el marcado real sin reescribir**.
- [ ] **Step 2: Write the failing tests** en `tests/test_meta_parse.py` (unittest, mismo estilo que `test_abilities.py`):
  - `test_index_devuelve_30_slugs_y_contiene_bp_aggro`: `len == 30`, `"bp-aggro" in slugs`, `"rg-midrange" in slugs`.
  - `test_deck_count`: `deckCount == 151` para el fixture de bp-aggro.
  - `test_cartas_populares`: `cards["ST11-009"] == {"adoption": 0.93, "avgCopies": 3.97}` y `len(cards) == 40`.
  - `test_cutoff_es_la_menor_adopcion`: `cutoff == min(c["adoption"] for c in cards.values())`.
  - `test_ventana`: `"Aug 3" in windowLabel and "12 weeks" in windowLabel`.
  - `test_sample_deck_suma_50`: si `sampleDecks` no está vacío, `sum(cards.values()) == 50` y cada número cumple `^[A-Z]{2}\d{2}-\d{3}$`.
  - `test_html_sin_perfil_falla`: `parse_archetype("<html></html>", "x", "u")` lanza `ValueError`.
- [ ] **Step 3:** Ejecuta `python -I tests/test_meta_parse.py`. Esperado: FAIL (`ModuleNotFoundError`).
- [ ] **Step 4:** Implementa `parse_index` y `parse_archetype` con `re`; en el HTML los textos útiles son "N.NN × copies per deck" y "NN % of decks" junto al número de carta (ver `ST11-009` en el fixture).
- [ ] **Step 5:** Ejecuta de nuevo. Esperado: todos PASS.
- [ ] **Step 6: Checkpoint:** también `python tests/test_abilities.py`.

---

### Task 3: Scraper todo‑o‑nada y snapshot

**Files:**
- Create: `scripts/scrape_meta.py`
- Modify: `scripts/embed_data.py` (incrustar `META_DATA`)
- Generate: `data/meta.json`, `data/meta/raw/`, `data/meta/history/`
- Test: `tests/test_meta_parse.py` (añadir clase `Scraper` con red simulada)

**Interfaces:**
- Consumes: `parse_index`, `parse_archetype` (Task 2); `data/all_cards.json`.
- Produces: `build_snapshot(fetch, today, cards) -> dict` y CLI `python scripts/scrape_meta.py`. `data/meta.json`:
  ```
  { "snapshot": { "id": "2026-10-23", "retrievedAt": "<ISO>", "dataDate": "2026-10-23",
                  "formatLabel": "GD05 + ST11–ST14 · PRE-GD06",
                  "source": {"id":"side6","name":"Side-6","sourceType":"tournament_database","url":"https://side-6.com/en/archetypes/"}},
    "archetypes": [ ...salida de parse_archetype... ],
    "unknownCards": ["XX01-001", ...] }   # números de Side-6 que no están en el catálogo
  ```
- `fetch` es una función `url -> str` inyectable (en tests devuelve los fixtures; en producción hace la petición con caché y espera ≥2 s).

- [ ] **Step 1: Write the failing tests** (`Scraper`): con `fetch` falso que devuelve el fixture para 30 slugs → snapshot con 30 arquetipos y `unknownCards == []`; con `fetch` que devuelve HTML vacío para un slug → `build_snapshot` lanza `RuntimeError` que **nombra el slug** y no se crea archivo; con menos de 25 slugs en el índice → `RuntimeError`.
- [ ] **Step 2:** Ejecuta `python -I tests/test_meta_parse.py`. Esperado: FAIL en `Scraper`.
- [ ] **Step 3:** Implementa `build_snapshot` y la CLI: escribe `data/meta.json` solo si todo salió bien; copia el `meta.json` anterior a `data/meta/history/{snapshot.id}.json` antes de sobrescribir. `formatLabel` sale de una constante en el script (`FORMAT_LABEL`), con comentario de que hay que revisarla al salir un set nuevo.
- [ ] **Step 4:** Extiende `embed_data.py` con `META_DATA` (el objeto completo de `meta.json`; si el archivo no existe incrusta `{"snapshot":null,"archetypes":[]}`), cierre `"\n};"`, `after_var="SET_DATES"`.
- [ ] **Step 5:** Ejecuta el scraper real: `python scripts/scrape_meta.py` (≈60 s por la espera entre peticiones) y luego `python scripts/embed_data.py`. Esperado: 30 arquetipos, imprime `unknownCards`. Si hay números desconocidos, anótalos en el informe final (no abortar).
- [ ] **Step 6:** Pruebas verdes. **Checkpoint:** `python -I tests/test_meta_parse.py`.

---

### Task 4: Motor `meta.js` — evidencia, roles, similitud, ranking, perfiles combinados

**Files:**
- Create: `meta.js`, `tests/meta.test.js`
- Test: `tests/meta.test.js`

**Interfaces:**
- Produces (todas en `Meta`, UMD `root.Meta`):
  - `Meta.DEFAULTS` = `{ roleCore:0.75, roleCommon:0.5, roleFlex:0.2, evidence:{high:100,medium:30,low:10}, clearArchetype:0.25, missingMinAdoption:0.5 }`
  - `Meta.evidenceLevel(deckCount, cfg?) -> 'high'|'medium'|'low'|'insufficient'`
  - `Meta.similarity(userCards: {num:qty}, archetype) -> {value:number(0-1), coverage:number(0-1), matchedCards:number}`: Jaccard ponderado sobre `archetype.cards` (`w = adoption`, `e = adoption*avgCopies`, `Σ w·min(u,e) / Σ w·max(u,e)`); `coverage` = copias del usuario con carta en el perfil / total de copias del usuario. Perfil vacío o denominador 0 → `value 0` (nunca NaN).
  - `Meta.rankArchetypes(userCards, archetypes, cfg?) -> [{archetypeId, similarity, coverage, evidence}]` ordenado desc, máx. 4 en `top`, más `clear: boolean` (mejor ≥ `clearArchetype`).
  - `Meta.mergeProfiles(archetypes, id, label) -> archetype` combinado ponderando por `deckCount` (`adoption` = Σ adoption·deckCount/Σ deckCount, contando 0 donde la carta no aparece; `avgCopies` ponderada por listas con la carta; `cutoff` = máximo de cutoffs). Para "mismo par de colores" y "todo el meta".
  - `Meta.globalAdoption(archetypes) -> {num: fraction}` (igual que `mergeProfiles` de todo).

- [ ] **Step 1: Write the failing tests** (`node tests/meta.test.js`; cabecera copiada del estilo de `legality.test.js`: `test/eq` helpers, contador final y `process.exit(1)` si falla). Usa perfiles sintéticos:
  - `evidenceLevel(100)=='high'`, `(99)=='medium'`, `(30)=='medium'`, `(29)=='low'`, `(10)=='low'`, `(9)=='insufficient'`.
  - `similarity` de un mazo idéntico al perfil (copias = `round(avgCopies)`, adopción 1) → `value > 0.9`; mazo sin ninguna carta del perfil → `value == 0`, `coverage == 0`.
  - Cantidad importa: perfil `{A:{adoption:0.9, avgCopies:3.9}}`; usuario con 1 copia → valor menor que con 4 copias, y ambos > 0.
  - Review Focus 3: perfil `{}` y perfil con `deckCount:0` → `value === 0` y `Number.isFinite`.
  - `rankArchetypes` devuelve los mejores primero, `top.length <= 4`, `clear:false` si el mejor < 0.25.
  - `mergeProfiles` de dos arquetipos de 100 y 300 listas con la carta A al 100 % y 0 % → adopción 0.25.
- [ ] **Step 2:** `node tests/meta.test.js`. Esperado: FAIL (`Cannot find module '../meta.js'`).
- [ ] **Step 3:** Implementa lo anterior en `meta.js` (ES5, sin DOM).
- [ ] **Step 4:** `node tests/meta.test.js`. Esperado: todo PASS.
- [ ] **Step 5: Checkpoint:** `node tests/legality.test.js`.

---

### Task 5: Motor `meta.js` — roles por carta, composición, faltan, poco habituales, frontera de set, paquetes y `compare`

**Files:**
- Modify: `meta.js`, `tests/meta.test.js`
- Test: `tests/meta.test.js`

**Interfaces:**
- Consumes: todo lo de Task 4; `SET_DATES` (`{GD06:{releaseDate}}`), catálogo `cardMap` (`number → card` con `type,lv,cost,color,tags,trait,link,name,set`).
- Produces:
  - `Meta.roleOf(number, ctx) -> {role:'core'|'common'|'flex'|'flex_low'|'off_meta'|'new'|'insufficient_data', adoption:number|null, avgCopies:number|null, upperBound:number|null, sampleSize:number, evidence:string}`. `ctx = {archetype, cardMap, setDates, snapshotDate, cfg}`. Orden de reglas: set con `releaseDate > snapshotDate` → `new`; evidencia `insufficient` → `insufficient_data`; carta en perfil → core/common/flex/flex_low por adopción; fuera del perfil → `off_meta` con `upperBound = archetype.cutoff`.
  - `Meta.composition(userCards, archetype, cardMap) -> [{key, user:number, meta:number|null}]` con claves `units, pilots, commands, bases, avgUnitCost, unitsLv5, earlyUnits` más una por cada `tag` funcional del catálogo presente en el mazo. `meta` = Σ adopción·copias medias de las cartas del perfil que cumplen la condición (`null` si el perfil no cubre ninguna carta del tipo).
  - `Meta.missingCommon(userCards, archetype, cfg) -> [{number, adoption, avgCopies, userCopies}]`: cartas con `adoption >= missingMinAdoption` y `userCopies < Math.round(avgCopies)`, por adopción desc, máx. 12.
  - `Meta.unusual(userCards, archetype, ctx, packages) -> [{number, copies, role, packageId|null}]`: cartas del usuario con rol `flex_low` u `off_meta`; cada una lleva `packageId` si pertenece a un paquete.
  - `Meta.detectPackages(userCards, cardMap) -> [{id, name, cards:[number], reason:'link'|'trait'}]`: `link` = Unidad del mazo cuyo `link` (`"[Amuro Ray]"`) nombra un Piloto del mazo (comparar nombre sin corchetes); `trait` = grupo de ≥3 cartas distintas que comparten un mismo rasgo `(Xxx)` del campo `trait`, y solo si alguna es poco habitual (esto se filtra en `compare`, no aquí).
  - `Meta.setBoundary(userCards, cardMap, setDates, snapshotDate) -> {crossed:boolean, sets:[codes], cards:[numbers]}` (cartas de sets con `releaseDate > snapshotDate`).
  - `Meta.compare(deck, mode, opts) -> MetaComparison` donde `deck = {name, cards}`, `mode = {type:'closest'|'colors'|'archetype'|'all', archetypeId?}`, `opts = {meta, cardMap, setDates, legality?, cfg?}`. Devuelve:
    ```
    { snapshot, mode, legality, ranking:{top,clear}, selected:{id,name,deckCount,evidence,windowLabel,sourceUrl},
      composition, cardAnalysis:[{number,userCopies,role,adoption,avgCopies,globalAdoption,upperBound,sampleSize,evidence}],
      missingCommon, unusual, packages, boundary, ignoredCards:[numbers fuera del catálogo], sourceUrl }
    ```

- [ ] **Step 1: Write the failing tests** (los de la spec §61 que aplican a V1, con perfiles sintéticos y un catálogo mínimo; GD06 con `releaseDate 2026-10-30`, snapshot `2026-10-23`):
  - **Test D (carta nueva):** una carta de GD06 → `role === 'new'`, nunca `off_meta`.
  - Evidencia insuficiente (`deckCount: 6`) → `insufficient_data`.
  - **Test E:** carta con adopción 0.91 que el usuario no lleva → aparece en `missingCommon` con `adoption`, `avgCopies` y `userCopies:0`.
  - **Test F:** Char Aznable `adoption .91, avgCopies 3.9`, usuario 3 copias → `cardAnalysis` da `userCopies 3`, `avgCopies 3.9`, rol `core`; no aparece nada tipo error/`illegal`.
  - **Test C (paquete off‑meta):** Unidad rara + su Piloto (por `link`) fuera del perfil → `unusual` los lista con `packageId` no nulo, `packages.length >= 1`, y no existe ninguna clave `remove`/`cut`/`recommendation` en el resultado.
  - **Test B (híbrido):** mazo mitad perfil A, mitad perfil B → `ranking.top.length >= 2` y `ranking.clear` coherente; no se fuerza un único arquetipo.
  - **Test A:** mazo = lista de ejemplo de un arquetipo real de `data/meta.json` (si existe; si no, `test.skip` con mensaje) → ese arquetipo es el primero del ranking.
  - Review Focus 1: mazo con un número `ZZ99-999` inexistente → `ignoredCards` lo contiene y `compare` no lanza.
  - Review Focus 4: mazo con una carta de GD06 → `boundary.crossed === true` y la carta sale `new`.
  - **Test H:** `snapshotDate '2026-10-23'` con mazo GD06 no mezcla: `cardAnalysis` de esa carta tiene `adoption === null`.
  - `composition`: con perfil que cubre solo unidades, `meta` de `pilots` es `null` (no 0).
  - `compare` con `mode:{type:'colors'}` usa `mergeProfiles` de los arquetipos cuyo par de colores coincide con los dos colores del mazo; con mazo monocolor usa los arquetipos que contengan ese color.
- [ ] **Step 2:** `node tests/meta.test.js`. Esperado: FAIL (funciones no definidas).
- [ ] **Step 3:** Implementa las funciones. `compare` solo orquesta; `snapshotDate` sale de `meta.snapshot.dataDate`. `globalAdoption` de cada carta usa Task 4.
- [ ] **Step 4:** `node tests/meta.test.js`. Esperado: todo PASS.
- [ ] **Step 5: Checkpoint:** `node tests/legality.test.js`.

---

### Task 6: Integración en la página y offline

**Files:**
- Modify: `dashboard.html` (cargar `meta.js` justo tras `legality.js`, línea ~920), `sw.js`
- Test: verificación en navegador

**Interfaces:**
- Consumes: `Meta` global, `META_DATA`, `SET_DATES`.
- Produces: función `metaReady() -> boolean` (`typeof Meta !== 'undefined' && META_DATA && META_DATA.archetypes.length > 0`) y `compareDeck(deckId, mode) -> MetaComparison|null` (envoltorio de `Meta.compare` con `cardMap()`).

- [ ] **Step 1:** Añade `<script src="meta.js"></script>` tras `legality.js`. En `sw.js` añade `'/meta.js'` a `PRECACHE` y sube `SHELL_VERSION` a `'v3'`.
- [ ] **Step 2:** Define `metaReady` y `compareDeck` junto al bloque de legalidad (`~línea 36750`).
- [ ] **Step 3:** Verifica en el navegador (servidor local): en la consola, `compareDeck(activeDeckId, {type:'closest'})` con un mazo de prueba devuelve el objeto sin excepción y sin errores de consola.
- [ ] **Step 4: Checkpoint:** `node tests/meta.test.js` verde.

---

### Task 7: Pantalla Meta Lab (UI, i18n, estados)

**Files:**
- Modify: `dashboard.html` (HTML de `#metaModal`, CSS, i18n ES/EN, JS de pintado, botones)
- Test: verificación en navegador y Chrome headless (escritorio 1280 y móvil 390)

**Interfaces:**
- Consumes: `compareDeck`, `metaReady`, `paintLegalChip`, `legalOf`, `t()`, `el()`, `activeDeck()`, `deckTotal(deck)`, `DECKS`, `building`, `updateBuildBar`, `renderDecksGrid`, `renderDeckDetail`, `refreshLegalChips`.
- Produces: `openMeta(deckId)`, `closeMeta()`, `renderMeta()` (repinta con el estado actual `metaState = {deckId, mode, tab}`), botones `#bbCompare` (en `#buildBar`), `#dpCompare` (en el detalle de mazo) y un botón pequeño `COMPARAR` en las fichas de `renderDecksGrid` solo si `deckTotal(deck) === 50`.

- [ ] **Step 1:** Botones: visibles solo si `metaReady() && deckTotal(deck) === 50`. Engánchalos en `updateBuildBar`, `renderDeckDetail` y `renderDecksGrid`. Con 49 o 51 cartas no existen en el DOM.
- [ ] **Step 2:** `#metaModal` pantalla completa en móvil y panel ancho en escritorio, mismo patrón de apertura/cierre que `#legalModal` (apertura con `void offsetWidth`, no `requestAnimationFrame`; Esc y botón cerrar; trampa de foco como `trapTab`). Pantalla de carga breve con los textos de spec §4 (≈400 ms, solo estética).
- [ ] **Step 3:** Contenido, en este orden:
  1. Cabecera: nombre del mazo, colores, 50 cartas, chip de legalidad (`paintLegalChip`); si es ilegal, el aviso de spec §3.
  2. Contexto: `formatLabel`, ventana (`windowLabel`), fecha de recogida; aviso de frontera si `boundary.crossed`.
  3. Arquetipo más cercano, similitud, cobertura ("las 40 cartas más jugadas cubren X de tus 50"), nº de listas, evidencia, con tooltip "¿Qué significa N %?" (texto de spec §7). Si `!ranking.clear` muestra el estado de spec §52 con botones de modo.
  4. Selector de modo: Más cercano / Mismo color / Elegir arquetipo (desplegable con los 30) / Todo el meta.
  5. Pestañas **Resumen** (candidatos + composición), **Cartas** (tabla en escritorio, tarjetas con chips en móvil), **Diferencias** ("Cartas habituales que no estás jugando", "Elecciones poco habituales" con el texto neutro de spec §19, "Paquetes detectados" con el texto de spec §19).
  6. Cada métrica con botón "¿Por qué?" que muestra: listas que contienen la carta sobre el total, copias medias, ventana, fuente.
  7. Pie: "Datos de Side‑6" con enlace a la página del arquetipo y fecha de recogida.
- [ ] **Step 4:** Estados: sin arquetipo claro (§52), evidencia insuficiente o baja (§53 con botón "Comparar por color"/"Todo el meta"), carta `NEW`/`insufficient_data`/`off_meta` con su etiqueta y la cota "por debajo del X %". Las etiquetas de rol usan una clase propia (`.meta-role.core|common|flex|flex_low|off_meta|new|insufficient_data`) en teal/ámbar/gris, nunca rojo.
- [ ] **Step 5:** i18n: añade `meta:{…}` a los diccionarios ES y EN de `t()`; al cambiar de idioma con el informe abierto, `renderMeta()` repinta (Review Focus 5). Si el mazo deja de tener 50 cartas con el informe abierto, `closeMeta()`.
- [ ] **Step 6: Verificación en navegador.** Prepara en `localStorage` (`msa_decks`) tres mazos de prueba: uno copiado de la lista de ejemplo de `bp-aggro` (cartas reales de `META_DATA`), uno con 25 cartas de dos arquetipos distintos, y uno con una carta de GD06. Comprueba y anota:
  - 49 cartas: no hay botón; 50: sí (barra de construcción, detalle y ficha).
  - Mazo bp‑aggro: primer candidato `B/P Aggro`, similitud alta, evidencia coherente con `deckCount`.
  - Mazo híbrido: ≥2 candidatos y sin forzar uno.
  - Mazo GD06: carta `NEW` y aviso de frontera.
  - `META_DATA.archetypes = []` simulado: ningún botón y sin errores de consola (Review Focus 2).
  - Cambio ES↔EN y cierre al quitar una carta con el informe abierto.
  - Captura en Chrome headless a 1280 y 390 de ancho; sin desbordes, sin rojo en etiquetas de meta.
  - `read_console_messages` sin errores.
- [ ] **Step 7: Checkpoint:** `node tests/meta.test.js`, `node tests/legality.test.js`, `python tests/test_abilities.py`, `python -I tests/test_meta_parse.py` en verde. Deja el navegador sin datos de prueba en `localStorage`.

---

### Task 8: Cierre

**Files:**
- Modify: `docs/superpowers/specs/2026-10-23-meta-lab-compare-design.md` (solo si algo del diseño cambió durante la construcción)

- [ ] **Step 1:** Repasa el diseño §2 y §9 punto por punto contra lo construido y anota cualquier hueco en el informe.
- [ ] **Step 2:** Informa a Álvaro: qué se hizo, `unknownCards` si los hubo, fechas de sets que no se pudieron verificar, el umbral de 25 % calibrado con qué mazos y su resultado, y que **todo sigue sin subirse** a GitHub/Vercel.

---

## Self-review

- **Cobertura del diseño:** §2.1 botón a 50 → T7·S1; §2.2 informe → T4, T5, T7; §2.3 ilegal comparable → T7·S3; §2.4 modos → T4 (`mergeProfiles`), T5 (`compare`), T7·S3; §2.5 contexto → T3 (`formatLabel`), T7·S3; §4 datos → T2, T3; §5 pipeline y todo‑o‑nada → T3; §6 cálculos → T4, T5; §7 UI → T7; §8 tests/offline → T1, T3, T6; §9 criterios → T5 (A–F, H) y T7·S6. Tendencia, selector de periodo, regiones, eventos y matchups: fuera de V1 por diseño.
- **Tipos:** `Meta.compare` devuelve las claves que consume T7 (`ranking.top/clear`, `selected`, `cardAnalysis`, `missingCommon`, `unusual`, `packages`, `boundary`, `ignoredCards`); `roleOf` usa los mismos ids de rol que la clase CSS `.meta-role.*`.
- **Proporción:** el plan describe interfaces y pruebas, no cuerpos de funciones, salvo la fórmula de similitud que el diseño fija.
