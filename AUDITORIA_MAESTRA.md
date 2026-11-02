# Auditoría maestra — Locura robótica

**Fecha:** 2 nov 2026 · **Alcance:** `dashboard.html` (app publicada en Vercel) + JS auxiliares + carpetas v2/v3.
**Método:** criterios de `impeccable` (audit, craft-floor), detector `impeccable detect`, análisis estático del código y las mediciones de render de las dos auditorías previas (28 oct: 119 combinaciones ancho×pantalla). **No se ha vuelto a renderizar la app en esta pasada**: lo marcado como "medido" viene de esas auditorías; lo demás es análisis de código.
**Nota:** `design-taste-frontend` queda fuera como criterio: su propio texto lo limita a landings y portfolios, no a UI de producto.

## Puntuación (0–4 por dimensión, escala de impeccable)

| Dimensión | Nota | Hallazgo clave |
|---|---|---|
| Accesibilidad | 3 | Buen foco, 101 atributos aria, movimiento reducido. Falta texto <12 px, objetivos <44 px y `lang` no detectado en el HTML estático (verificar). |
| Rendimiento | 2 | HTML de 1,9 MB con 1,74 MB de datos incrustados; ~24 900 elementos en el DOM (medido el 28 oct). |
| Responsive | 3 | 0 scroll horizontal y 0 errores en 119 combinaciones (medido). Quedan ergonomías táctiles finas. |
| Theming | 3 | 131 variables y sistema tipográfico completo, pero 219 colores hex y 181 `rgba()` fuera de tokens. |
| Integridad de implementación | 3 | Lenguaje HUD coherente; deriva menor (easing, z-index, `!important`, versiones duplicadas). |
| **Total** | **14/20** | **Bueno: atacar rendimiento primero.** |

## Veredicto de integridad
**Pasa.** Hay un sistema propio reconocible (cortes diagonales `--cut`, paleta navy/sky/rose, Inter + cifras Inter Digits) y un sistema tipográfico en variables. No es una plantilla genérica.

## Hallazgos del detector (`impeccable detect`, 7 en total)
- **P2 · Easing con rebote** `cubic-bezier(.2,1.5,.35,1)` ×4. Sustituir por `--ease-out` (ya existe).
- **P2 · Transición de `width`** provoca reflow. Usar `transform: scaleX` o `grid-template-columns`.
- **P3 · Raster enterrado** (fondo con opacidad ~0): carga un archivo que no se ve. Verificar y quitar.
- **A verificar · contraste 1,0:1 (#fff sobre #fff)**: probablemente falso positivo de texto sobre degradado/imagen; comprobar en render.

## Hallazgos del análisis de código
**P1 — Rendimiento**
1. `CARDS_DATA` (1,74 MB) está incrustado en `dashboard.html`, y el mismo dato vive además en `data/*.json` (168 MB en carpeta). Cargar el catálogo desde JSON cacheado por el service worker y dejar el HTML en ~250 KB. *Comando: `/impeccable optimize`.*
2. Se pintan las 1086 cartas a la vez (~24 900 nodos; mitigado con `content-visibility:auto`). Virtualizar o paginar por lotes. *Pendiente ya anotado en el ledger: Expansiones pinta ~130 cartas de golpe.*

**P2 — Theming / deriva**
3. 74 colores hex distintos y 181 `rgba()` literales. Los repetidos (`#fff` ×55, `#221e41` ×17, `#1a4d7a` ×8, `#f4a6a6` ×6) deben pasar a tokens (`--panel`, `--navy`, `--rose`…).
4. Tamaños de fuente fuera de escala: 12.5, 13.5, 14.5, 11.5 px conviven con los 21 valores. Fijar la escala a los tokens `--text-*`.
5. `z-index` hasta 200 y 11 `!important`: definir capas con nombre (nav, hoja, modal, toast).
6. 6 bordes laterales >1 px (patrón vetado por craft-floor en tarjetas/alertas): revisar.

**P2 — Higiene del proyecto**
7. `gundam-dashboard-v2` y `-v3` (110 MB cada una, del 29 sep) y `dashboard.html`/`all_cards.json` sueltos en la raíz son versiones obsoletas. Archivar fuera del proyecto activo; `launch.json` aún las lista.
8. No existían `PRODUCT.md`, `DESIGN.md` ni `CLAUDE.md` (se crean ahora).

**Pendientes heredados (auditorías 28 oct)**: objetivos <44 px (cabecera 42, chips 40), texto 11,5 px en cajas de efecto, dos caminos a "Mis mazos"/"Nuevo mazo", foto de fondo bajo paneles translúcidos.

## Lo que funciona (mantener)
Barra inferior móvil, hojas modales, un único componente de lista de mazo (`deckSegments`), tests de UI y de tokens (`tests/ui_tokens.mjs`, `ui_typography*.mjs`), service worker con precache versionado, no publicar sin permiso.

## Orden recomendado
1. Datos fuera del HTML + carga por lotes (rendimiento).
2. Tokenizar colores y escala de fuentes; convertir las reglas de `DESIGN.md` en tests.
3. Easing/`width`/z-index/`!important`.
4. Objetivos táctiles y texto <12 px.
5. Archivar v2/v3.

## Estado tras la pasada del 2 nov 2026 (implementado y probado)
| Punto | Estado | Detalle |
|---|---|---|
| Catálogo incrustado (P1·1) | **Hecho** | `CARDS_DATA` sale a `data/cards.js` (1,2 MB minificado). `dashboard.html` pasa de 2,0 MB a 0,5 MB. El service worker lo precarga y lo sirve desde caché, actualizándolo por detrás. `scripts/embed_data.py` ya lo genera así. |
| 1086 cartas a la vez (P1·2) | **Ya resuelto antes** | El catálogo pinta por tandas de 48 (~1700 nodos al abrir, medido) y Mi colección también (con añadido incremental). |
| Easing con rebote | **Hecho** | El único que quedaba (`.sp-br`, splash) usa `--ease-out`. |
| Transición de `width` | **Hecho** | La barra de descarga sin conexión anima `transform: scaleX`. |
| Raster enterrado | **No reproducido** | El único fondo raster (`decks-hero.webp`) se ve con opacidad .3; no hay ninguno a ~0. |
| Colores repetidos (P2·3) | **Parcial** | `#fff`, navy, sky, rose, `#1a4d7a`, `#dce5ed`, `#d86565` → tokens (`--white`, `--navy`, `--sky`, `--rose`, `--blue-deep`, `--soft`, `--miss`): 92 sustituciones. Quedan los `rgba()` y hex de un solo uso. |
| Escala tipográfica (P2·4) | **Parcial** | Nada por debajo de 12 px (los 11,5 px de la barra inferior y su globo → 12). Siguen existiendo tamaños fuera de token. |
| z-index e `!important` (P2·5) | **Hecho** | 21 capas con nombre (`--z-page` … `--z-splash`); `!important` solo en `[hidden]` y "reducir movimiento". |
| Bordes laterales (P2·6) | **Hecho** | El aviso "Te faltan cartas" usa un contorno de 1 px; los únicos bordes de 2 px que quedan son adornos (`::before/::after`). |
| Archivar v2/v3 (P2·7) | **Hecho** | Movidas (no borradas) a `../_archivo/` junto con `dashboard.html` y `all_cards.json` sueltos. No existía ningún `launch.json`. |
| Reglas de DESIGN.md como tests | **Hecho** | `tests/design_rules.test.js` (11 comprobaciones; fallaban 7 con el CSS anterior). |
| Objetivos táctiles | **Sin cambios necesarios** | En pantallas táctiles los chips ya miden 44 px; el selector de idioma mide 44 px en conjunto. |

Comparación visual antes/después (capturas a 390 y 1440 px de catálogo, Mi colección, ficha, ventana del mazo y Mis mazos): idénticas píxel a píxel salvo el aviso "Te faltan cartas" (franja lateral → contorno).
