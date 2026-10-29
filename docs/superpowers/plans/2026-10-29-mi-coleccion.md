# Mi colección — plan de implementación

> **Para quien lo ejecute:** usar superpowers:executing-plans (o subagent-driven-development) tarea a tarea. Los pasos usan casillas `- [ ]`.

**Objetivo:** que la persona marque qué cartas tiene (un toque, sin cantidades), rellene mazos iniciales de golpe, vea la etiqueta "TENGO" en esas cartas y vea atenuadas con "No la tengo" las cartas de un mazo que no posee.

**Arquitectura:** un módulo puro nuevo `collection.js` (sin DOM, mismo patrón que `legality.js`/`meta.js`) con un conjunto de números de carta persistido en `localStorage` (`msa_collection`). `dashboard.html` lo instancia una vez (`COLL`) y repinta cuatro sitios cuando cambia: botones de la carta del catálogo, etiqueta TENGO, filas de los mazos (`deckSegments`) y la página Mi colección.

**Stack:** JS sin framework en un solo `dashboard.html`; tests Node (`tests/*.test.js`, mismo mini-arnés que `tests/meta.test.js`) y pruebas de interfaz en Chrome sin interfaz.

**Spec:** `docs/superpowers/specs/2026-10-29-mi-coleccion-design.md`

## Restricciones globales (del spec, tal cual)

- Colores exactos: botón "Añadir a mi colección" `#221e41`; carta ya añadida `#1a4d7a`; papelera `#dce5ed`; aviso "No la tengo" `#d86565`. Sin verde.
- **Sin cantidades.** Colección = conjunto de números de carta.
- Etiquetas "TENGO" y avisos "No la tengo" **solo si hay al menos una carta añadida** (colección "creada").
- Tener o no una carta **no afecta a la legalidad** de un mazo.
- Nombre en toda la interfaz: **"Mi colección"**. ES por defecto y EN. Sin dependencias nuevas.
- Mi colección **no exige iniciar sesión**; sobrevive a cerrar sesión y a recargar.
- Botones con nombre accesible ("Añadir a mi colección · {carta}", "Quitar de mi colección · {carta}"), área táctil ≥ 44 px en las cartas del catálogo, foco visible.
- No cambiar la lógica de legalidad ni el formato de los mazos guardados.
- Mazo inicial = todas las cartas del catálogo con `set === 'STnn'` (ST01–ST14).

## Foco de revisión (casos que el spec implica y ninguna tarea nombra)

1. **Valor corrupto en `localStorage`** (no JSON, o no es una lista): se trata como colección vacía, sin error y sin borrar nada hasta la siguiente escritura.
2. **Números de carta que ya no están en el catálogo**: se ignoran al contar y al listar, sin romper la pantalla.
3. **Mazo inicial a medias** (alguna carta añadida a mano): el botón dice "Añadir mazo" y añade las que faltan; solo con **todas** presentes dice "Tengo el mazo" y al pulsarlo quita todas las de ese ST.
4. **Quitar la última carta**: la colección vuelve a "no creada" y desaparecen al instante etiquetas, avisos y atenuados, sin recargar.
5. **`localStorage` lanza error** (modo privado o lleno) y **cambio de idioma** con colección creada: sigue funcionando en memoria y los textos se repintan.

---

### Tarea 1: Módulo `collection.js` con sus pruebas

**Archivos:**
- Crear: `collection.js`
- Crear: `tests/collection.test.js`

**Interfaces:**
- Produce `Collection.create(host) -> api`, donde `host = { load(): string|null, save(text: string): void }`. `api`:
  - `has(num: string): boolean`, `add(num)`, `remove(num)`, `addMany(nums: string[])`, `removeMany(nums: string[])`
  - `size(): number`, `exists(): boolean` (= `size() > 0`), `list(): string[]` (orden estable, ascendente)
  - `isMissing(num: string): boolean` → `exists() && !has(num)`
  - `hasAll(nums: string[]): boolean` (vacío → `false`)
  - `onChange(fn: () => void): void`; se llama tras cada cambio real, **no** si no cambia nada.
- Produce `Collection.KEY = 'msa_collection'`.

- [ ] **Paso 1: escribir las pruebas que fallan** (`tests/collection.test.js`, mini-arnés copiado de `tests/meta.test.js`, `require('../collection.js')`). Con un `host` en memoria:
  - `add` y `has`: añadir `'ST01-001'` → `has` verdadero; añadirlo otra vez no duplica (`size() === 1`).
  - `remove` de una carta no añadida no cambia nada y **no** dispara `onChange`.
  - `exists()` es falso en vacío, verdadero con 1 carta, falso tras quitar la última (caso 4).
  - `isMissing('GD01-001')` es **falso** con la colección vacía (sin colección no hay avisos) y verdadero con otra carta añadida.
  - `addMany(['ST01-001','ST01-002'])` dispara `onChange` **una sola vez**; `removeMany` igual.
  - `hasAll(['ST01-001','ST01-002'])` falso si falta una; `hasAll([])` falso.
  - Persistencia: tras `add`, `host.save` recibió un JSON con la lista; `Collection.create(mismoHost).has('ST01-001')` es verdadero.
  - Caso 1: `host.load()` devuelve `'{{no json'`, `'{"a":1}'` y `'[1,2]'` → `size() === 0` y no lanza.
  - Caso 5: un `host.save` que lanza no impide que `add` funcione en memoria.

- [ ] **Paso 2: ejecutar y ver que falla** — `node tests/collection.test.js` → falla por módulo inexistente.

- [ ] **Paso 3: implementar `collection.js`** con el mismo envoltorio UMD que `meta.js` (`root.Collection`). Usar un `Set`; al cargar, aceptar solo un array de cadenas; `save(JSON.stringify(list()))` dentro de `try/catch`.

- [ ] **Paso 4: ejecutar y ver que pasa** — `node tests/collection.test.js` → `N pasan · 0 fallan`.

- [ ] **Paso 5: commit** — `git add collection.js tests/collection.test.js && git commit -m "Mi colección: módulo y pruebas"`.

---

### Tarea 2: Cableado en la página, almacenamiento y service worker

**Archivos:**
- Modificar: `dashboard.html` (etiqueta `<script src="collection.js">` junto a `meta.js`, ~línea 1591; instancia `COLL` junto a `lsGet/lsSet`, ~línea 53877)
- Modificar: `sw.js` (`PRECACHE` y `SHELL_VERSION`)

**Interfaces:**
- Consume: `Collection.create(host)` (Tarea 1); `lsGet`/`lsSet` existentes.
- Produce, dentro del script principal: `var COLL` (instancia con `host = { load: () => lsGet(Collection.KEY), save: t => lsSet(Collection.KEY, t) }`) y `function onCollectionChange()`, que de momento solo llama a `repaintCollection()` (a definir en la Tarea 3; hasta entonces, función vacía).

- [ ] **Paso 1:** añadir `'/collection.js'` a `PRECACHE` y subir `SHELL_VERSION` de `'v6'` a `'v7'` (cambia la lista).
- [ ] **Paso 2:** añadir la etiqueta `<script src="collection.js"></script>` antes de `meta.js`; crear `COLL` y registrar `COLL.onChange(onCollectionChange)`.
- [ ] **Paso 3: verificar** — `node --check` del script principal (extraído como en las pruebas anteriores) y abrir `http://localhost:8766/` en Chrome sin interfaz: `typeof Collection === 'object'` y `Object.keys(COLL)` incluye `has`. Sin errores de consola.
- [ ] **Paso 4: commit** — `git commit -m "Mi colección: cableado y precaché"`.

---

### Tarea 3: Botones y etiqueta TENGO en la carta del catálogo

**Archivos:**
- Modificar: `dashboard.html` — función que construye la carta del catálogo (donde hoy se hace `body.appendChild(adderEl(card.number))`, ~línea 54650), CSS de la carta, textos ES/EN.
- Crear: `tests/ui_collection_tile.mjs` (prueba de interfaz en Chrome sin interfaz, a 390 y 1280 px).

**Interfaces:**
- Consume: `COLL` y `onCollectionChange` (Tarea 2).
- Produce: `function collectionEl(card): HTMLElement` (la fila del botón y la papelera), `function repaintCollection(): void` (repinta botones y etiquetas de **todas** las cartas visibles; la reutilizan las Tareas 4 y 5), y la clase CSS `.is-owned` en la carta.

- [ ] **Paso 1: escribir la prueba de interfaz que falla** (`tests/ui_collection_tile.mjs`; mismo arnés CDP de `scratchpad/adder.mjs`): sin colección no existe `.coll-tag`; la primera carta tiene un botón de texto "Añadir a mi colección" con fondo `rgb(34, 30, 65)`; al pulsarlo pasa a "En mi colección" con fondo `rgb(26, 77, 122)`, aparece `.coll-tag` con el texto "TENGO" y una papelera con fondo `rgb(220, 229, 237)`; pulsar la papelera deja la colección vacía y **desaparece** `.coll-tag` en todas las cartas (caso 4); los botones tienen `aria-label` con el nombre de la carta y altura ≥ 44 px; con el idioma en inglés los textos cambian (caso 5).
- [ ] **Paso 2: ejecutar y ver que falla.**
- [ ] **Paso 3: implementar** `collectionEl(card)` y añadirlo bajo `adderEl(...)` (opción "A" de la maqueta); la etiqueta `TENGO` sobre la imagen solo si `COLL.exists() && COLL.has(card.number)`; `repaintCollection` actualiza la clase y los textos sin reconstruir el catálogo. Colores exactos de las restricciones globales. Textos ES: "Añadir a mi colección", "En mi colección", "TENGO"; EN: "Add to my collection", "In my collection", "OWNED".
- [ ] **Paso 4: ejecutar y ver que pasa**, y repetir `node tests/*.test.js` (legalidad, meta, sync) sin regresiones.
- [ ] **Paso 5: commit** — `git commit -m "Mi colección: botón y etiqueta en el catálogo"`.

---

### Tarea 4: "No la tengo" en las listas de mazo

**Archivos:**
- Modificar: `dashboard.html` — `deckSegments(target, entries, edit)` (compartida por la ventana del mazo y el detalle de Mis mazos), CSS, textos.
- Crear: `tests/ui_collection_deck.mjs`.

**Interfaces:**
- Consume: `COLL.isMissing(num)` y `repaintCollection()` (Tareas 1 y 3).
- Produce: la clase `.is-missing` en `.dv-row` y el elemento `.coll-miss` ("No la tengo") dentro de la fila.

- [ ] **Paso 1: escribir la prueba que falla:** con un mazo de 3 cartas y colección con 1 de ellas, hay 2 filas con `.is-missing` (opacidad < 1) y `.coll-miss` con texto "No la tengo" y color `rgb(216, 101, 101)`; con la colección **vacía** no hay ninguna fila atenuada ni aviso; tras añadir la carta que faltaba en el catálogo, la fila deja de estar atenuada **sin recargar**; el estado de legalidad del mazo (`legalOf`) es idéntico con y sin colección.
- [ ] **Paso 2: ejecutar y ver que falla.**
- [ ] **Paso 3: implementar:** en `deckSegments`, si `COLL.isMissing(c.number)` añadir `.is-missing` y `.coll-miss`; `repaintCollection()` también repinta las filas abiertas (la ventana del mazo se re-renderiza con `renderDeckView()` y el detalle con `renderDeckDetail()` si están visibles). Textos ES "No la tengo", EN "Not owned".
- [ ] **Paso 4: ejecutar y ver que pasa** + pruebas de legalidad.
- [ ] **Paso 5: commit** — `git commit -m "Mi colección: aviso No la tengo en los mazos"`.

---

### Tarea 5: Pantalla Mi colección y acceso desde el usuario

**Archivos:**
- Modificar: `dashboard.html` — botón "Mi colección" en la ventana de cuenta (`renderAccount`, debajo de `avatarSection()`, visible con y sin sesión), nueva sección `#collPage` (mismo estilo oscuro que `compPage`/`decksPage`), `openCollPage()`/`closeCollPage()`, ruta `#coleccion`, textos, CSS.
- Crear: `tests/ui_collection_page.mjs`.

**Interfaces:**
- Consume: `COLL`, `repaintCollection()`, el catálogo en memoria (`ALL`, `cardByNumber`).
- Produce: `function starterCards(setId: string): string[]` (números del catálogo con `set === setId`, orden estable), `function openCollPage(): void`, `function closeCollPage(): void`.

- [ ] **Paso 1: escribir la prueba que falla:** el botón "Mi colección" existe en la ventana de cuenta **sin iniciar sesión**; abre la página con título "Mi colección" y el total "N cartas distintas"; pestañas "Mazos iniciales", "Expansiones", "Todas"; hay 14 filas ST01–ST14 con su número de cartas (ST01 → 16, ST09 → 10); pulsar "Añadir mazo" en ST01 añade 16 cartas y el botón pasa a "Tengo el mazo"; pulsarlo otra vez las quita; con una carta de ST01 ya añadida a mano el botón dice "Añadir mazo" y añade solo las que faltan (caso 3); "Expansiones" muestra cartas GD/EB con el botón de la Tarea 3; "Todas" lista lo añadido agrupado por set con papelera; con la colección vacía, "Todas" muestra una frase de ayuda; un número desconocido guardado en `msa_collection` no rompe la pantalla ni cuenta (caso 2); sin errores de consola a 390 y 1280 px.
- [ ] **Paso 2: ejecutar y ver que falla.**
- [ ] **Paso 3: implementar** `starterCards`, la página y el acceso. "Todas" agrupa por `card.set`. El total cuenta solo números presentes en el catálogo.
- [ ] **Paso 4: ejecutar y ver que pasa** y comprobar con el arnés de auditoría (`scratchpad/ux/audit.mjs`) que la nueva pantalla no introduce scroll horizontal ni objetivos < 24 px a 320, 390 y 1440 px.
- [ ] **Paso 5: commit** — `git commit -m "Mi colección: pantalla y acceso desde el usuario"`.

---

### Tarea 6: Cierre y publicación

**Archivos:**
- Modificar: `dashboard.html` (`APP_BUILD`), `docs/superpowers/specs/2026-10-29-mi-coleccion-design.md` (estado).

- [ ] **Paso 1:** subir `APP_BUILD`; ejecutar todos los tests (`node tests/*.test.js`, pruebas de interfaz de las Tareas 3–5) y el script de sintaxis; **0 fallos**.
- [ ] **Paso 2:** revisión final contra el spec punto por punto (colores exactos, "sin colección = como hoy", sin cantidades, mazo inicial a medias, sesión no requerida).
- [ ] **Paso 3:** pedir a la persona permiso para subir a GitHub; solo entonces `git push`.

> **Segunda fase (fuera de este plan):** sincronizar la colección con la cuenta (tabla nueva en Supabase + `decks_sync.js`). Se planifica aparte cuando esta primera entrega esté publicada; necesita un paso en el panel de Supabase.
