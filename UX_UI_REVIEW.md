# Revisión UX/UI y responsive — Locura robótica

**Fecha:** 28 oct 2026 · **Alcance:** `dashboard.html` (catálogo, filtros, ficha, ventana del mazo, Mis mazos y detalle, Meta Lab, cuenta, Competición con sus 6 pestañas).
**Método:** Chrome sin interfaz con emulación de dispositivo (**no dispositivos reales**) a **320, 375, 390, 430, 768, 1024 y 1440 px**; 17 pantallas por ancho = **119 combinaciones**, recorridas con un script que hace los clics como un usuario y mide en cada una: scroll horizontal, elementos fuera del viewport, objetivos táctiles < 44 px y < 24 px, texto < 12 px, textos recortados, elementos tapados por barras fijas, contraste WCAG y errores de consola. Se ejecutó dos veces: **antes** (versión publicada, commit `a28e5a9`) y **después** (esta revisión). Capturas: [`docs/ux-review/`](docs/ux-review/).

> Esta revisión continúa la auditoría móvil anterior ([`MOBILE_UX_UI_AUDIT.md`](MOBILE_UX_UI_AUDIT.md)); su plan ya había resuelto la mayoría de problemas estructurales, por eso el diagnóstico de partida ya es bueno y las mejoras de esta pasada son de refinamiento.

---

## 1. Diagnóstico inicial

La base ya era sólida: **0 scroll horizontal, 0 elementos fuera de pantalla y 0 errores de consola en las 119 combinaciones**, navegación móvil con barra inferior, hojas modales y rejillas adaptativas. Los fallos que la medición sí encontró:

| Medición (119 combinaciones) | Antes |
|---|---|
| Scroll horizontal global | 0 |
| Elementos fuera del viewport | 0 |
| Errores de consola | 0 |
| Objetivos < 24 px (mínimo WCAG 2.2 AA) | **49** apariciones (enlaces de fuente, 19 px de alto) |
| Texto < 12 px | **56** apariciones (insignias de regla 11 px, un `span` de Competición) |
| Textos recortados sin `…` | 12 (botón de Arquetipos, chips de rasgos largos) |
| Fallos de contraste de texto (evaluable) | 0 |

Además, la revisión visual de las capturas detectó problemas que el script no mide:

## 2. Problemas encontrados y prioridad

**P0** — ninguno (no hay roturas funcionales).

**P1**
1. **Detalle de "Mis mazos"**: seguía con un diseño distinto (por colores → 4 columnas, steppers de 44 px) a la ventana del mazo (por tipos, fila compacta). Dos pantallas para lo mismo, con controles diferentes y los 4 botones de acción cortados a 320–390 px ("Añadir carta", "Eliminar maz…").
2. **Barra de búsqueda pegajosa en 320 px** ocupaba ~27 % de la pantalla porque los chips de color pasaban a dos filas, tapando las cartas al hacer scroll.
3. **Aviso "No se pudo guardar · Reintentar"** visible en la cabecera del mazo: ruido y alarma para un estado que la app recupera sola.
4. **Alturas desiguales en el catálogo**: el aviso "Máx. 4/4" y las insignias de regla empujaban el selector de copias, que quedaba a distinta altura en cada tarjeta de la fila.
5. **Etiquetas de rasgos largas recortadas** sin aviso en la barra lateral de escritorio ("Earth Sphere Unified Nation · 1").

**P2**
6. Enlaces de fuente de 19 px de alto (< 24 px WCAG).
7. Texto de 11 px (insignias de regla, estadísticas, KPI de Competición, etiquetas de efecto).
8. Botón "Ver listas de torneo" cortado a 375 px.
9. Foto de fondo de Mis mazos/Competición con opacidad .42: rostros y brillos justo detrás de notas de 13 px.
10. En pantallas anchas, el nombre de la carta y sus botones quedaban a ~800 px de distancia en la ventana del mazo.
11. Código y CSS muertos tras varias iteraciones (stepper antiguo, columnas por color).

## 3. Mejoras implementadas

- **Un solo componente de lista de mazo** (`deckSegments`) compartido por la ventana del mazo y el detalle de Mis mazos: segmentos Unidades / Pilotos / Bases / Comandos, fila *copias · color · carta · − + papelera*, unidades ordenadas por AP+HP y luego AP. Se retiraron `stepperEl`, el stepper antiguo y **37 reglas CSS** huérfanas.
- Botones de acción del detalle de mazo en **cuadrícula 2×2** en móvil (una fila en tableta/escritorio).
- Chips de color del buscador en **una sola fila deslizable** (la barra pegajosa baja a ~122 px a 320 px).
- Aviso de error de guardado **retirado** (los mazos siguen en el dispositivo y la nube reintenta sola; el estado sigue visible en "Tu cuenta").
- Selector de copias **primero** en cada tarjeta del catálogo, "Máx. 4/4" eliminado: todas las tarjetas de una fila alineadas (medido: desfase 0 px a 390 y 1440).
- Texto mínimo **12 px** en insignias, estadísticas, KPI y etiquetas de efecto.
- Enlaces de fuente con **zona táctil de 45 px** (el texto no se mueve).
- Botones pequeños de la lista del mazo (30 px visibles, a petición expresa) con un **área pulsable de 34 × 44 px** (`::after`) sin pisar al botón vecino.
- Chips de filtro de la barra lateral y botones de Competición **parten el texto** en lugar de recortarlo.
- Foto de fondo de las páginas oscuras a opacidad .30 (mejor legibilidad).
- Ancho máximo 920 px para las listas de mazo en pantallas anchas.
- Nombre del mazo en construcción: **un clic abre el mazo y doble clic / doble toque / F2 lo renombra** en el sitio (Enter guarda, Esc cancela), sustituyendo el botón "Ver mazo".

> Otros cambios de esta sesión pedidos por la persona usuaria (no parte de esta auditoría): filtros de Competición como desplegables sin título, orden y rótulos del filtro SET ("Cabezones feos"), filtro Activación eliminado, **+** directo en el catálogo, etiqueta "Tengo" eliminada, segmentos por tipo en la ventana del mazo.

## 4. Cambios específicos para móvil

- Barra de búsqueda más baja a 320–375 px (chips en una fila deslizable).
- Detalle de mazo: acciones 2×2, filas de una línea (copias · color · carta · botones) y, por debajo de 340 px, botones en su propia línea.
- Fila compacta ≤ 430 px: miniatura 36 px, nombre 14 px, círculo de copias 32 px.
- Zonas táctiles ampliadas por pseudo-elemento donde el diseño pedía controles pequeños.
- Doble toque sin zoom accidental en el nombre del mazo (`touch-action: manipulation`).

## 5. Componentes y archivos modificados

Solo **`dashboard.html`** (HTML + CSS + JS embebidos) y los documentos nuevos `UX_UI_REVIEW.md` y `docs/ux-review/*.png`.
Funciones: `deckSegments` (nueva), `renderDeckView`, `renderDeckDetail`, `adderEl`, `syncSteppers`, `paintSaveState`, `updateBuildBar`, listeners de `#bbName`.
CSS: `.dv-*` (fila de mazo), `.dp-actions`, `.quick`, `.sb-chips .tag.chip`, `.dl-actions`, `.comp-sources a`, `.decksPage::before`, `.rule-badge`, `.dd-stat`, `.dl-kpi`, `.bb-namebtn/.bb-nameinput`.

## 6. Comprobaciones realizadas y resultados

Auditoría automática **antes → después** sobre las mismas 119 combinaciones (los últimos retoques —chips que parten el texto, botón de Arquetipos, nombre del mazo— se hicieron después de la pasada completa y se comprobaron aparte en las pantallas afectadas):

| Medición | Antes | Después |
|---|---|---|
| Scroll horizontal | 0 | **0** |
| Fuera del viewport | 0 | **0** |
| Errores de consola | 0 | **0** |
| Objetivos < 24 px | 49 | **0** |
| Texto < 12 px | 56 | **0** |
| Recortes sin `…` | 12 | 11 en la pasada completa; **0** en las pantallas afectadas tras el último arreglo (comprobado en 375 y 1440, no se repitió la pasada completa) |
| Contraste < 4.5:1 (texto sobre fondo opaco) | 0 | **0** |

Otras pruebas:
- Alineación del selector de copias por fila: desfase **0 px** (390 y 1440).
- Orden AP+HP de unidades: **correcto** en un mazo de 24 unidades.
- Nombre del mazo: clic abre el detalle; doble clic edita; Enter guarda; Esc cancela (390 y 1280).
- Tests unitarios: legalidad **43/43**, Meta **32/32**, sincronización **18/18**.
- Revisión visual manual de capturas a 320, 390, 430, 768, 1024 y 1440 px.

## 7. Problemas pendientes y limitaciones reales

- **No se probó en dispositivos físicos** (iOS Safari, Android Chrome): solo emulación. El comportamiento del teclado virtual, el doble toque real y el rendimiento en móviles de gama baja quedan sin verificar.
- Objetivos < 44 px (recomendación AAA, no exigida por WCAG AA): los enlaces de fuente miden 39–45 px de ancho; las insignias de regla 32 px de alto; los botones − + papelera de la lista de mazo se ven de 30 px **por petición expresa** (con área de pulsación de 34 × 44 px).
- **Contraste sobre la foto de fondo** no es medible con el script (se ignoran fondos con imagen); se redujo la opacidad pero no hay cifra.
- Los chips de **Rasgos** (cientos) siguen en una caja con scroll interior de 380–420 px dentro de la hoja de filtros: scroll anidado, funcional pero mejorable.
- **Peso del DOM** (≈ 25 000 elementos al pintar las 1086 cartas) y HTML de 1,8 MB: sin tocar en esta pasada (riesgo de regresión alto sin pruebas en dispositivo).
- **Competición** solo se alcanza desde el menú hamburguesa; no se movió a la barra inferior porque cambia la arquitectura de navegación y requiere tu decisión.
- La métrica "tapados" se ve afectada por superposiciones legítimas (barra inferior fija, páginas que cubren el catálogo), por lo que no se usó como criterio de aceptación.

## 8. Recomendaciones futuras por orden de impacto

1. **Añadir Competición a la navegación inferior** (o a un acceso visible en la home): es una función principal y hoy está a dos toques.
2. **Probar en 2–3 dispositivos reales** y medir carga con CPU/red lentas tras el cambio.
3. **Paginar o virtualizar el catálogo** (renderizar ~48 tarjetas y cargar más al hacer scroll) para bajar el DOM de 25 000 a < 5 000 elementos.
4. **Buscador dentro del grupo Rasgos** y sustituir su scroll interior por una lista a pantalla completa en móvil.
5. **Convertir los datos a JSON externo cacheado** (HTML de 1,8 MB → < 300 kB) para mejorar el primer pintado.
6. Unificar en un único componente los tres estilos de selector de copias que aún conviven (catálogo, ficha, lista de mazo).
7. Dar a las insignias de regla (`Restringida`, exclusivas) 40–44 px de alto o un área táctil ampliada.
8. Tokens de espaciado y de radio documentados (hoy hay radios y cortes en diagonal definidos caso por caso).
