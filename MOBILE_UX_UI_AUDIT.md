# Auditoría UX/UI móvil — Locura robótica

**Fecha:** 28 oct 2026 · **Alcance:** `dashboard.html` completo (catálogo, filtros, ficha de carta, ventana del mazo, Mis mazos, detalle de mazo, Competición, nuevo mazo, menú).
**Método:** Chrome sin interfaz con emulación de dispositivo (no dispositivos reales) a 320, 360, 375, 390, 430, 768 y 1440 px; 13 pantallas por ancho recorridas como un usuario (abrir menú, filtros, ficha, mazo, Competición…), con mediciones automáticas en cada una (desbordes, tamaño de objetivos táctiles, texto < 12 px, fuentes realmente usadas, errores de consola, recursos rotos) y una medición de carga con CPU ×4 y red lenta. Capturas en [`docs/mobile-audit/`](docs/mobile-audit/).

> Las puntuaciones son una valoración experta basada en lo observado, no un benchmark automático.

---

## 1. Resumen ejecutivo

La app ya es **mobile-first de verdad**: barra de pestañas inferior, ficha como hoja inferior, filtros en hoja con botón fijo "Ver N cartas", rejilla de 2 columnas desde 320 px y contenido que se reorganiza (no se encoge) en tableta y escritorio. **No hay desbordes horizontales en ningún ancho ni pantalla, ni errores de consola, ni recursos rotos.** El soporte de movimiento reducido, foco visible y `lang` están bien resueltos.

Lo que separa la app de un acabado "de producción" es sobre todo **ergonomía táctil fina y consistencia**:

- Varios controles quedan por debajo de 44 px (cabecera a 42 px, chips a 40 px, papelera de la ficha a 36 px) y **uno incumple el mínimo WCAG 2.2 de 24 px** (el campo "Link" pulsable de la ficha mide 21 px de alto).
- El mismo control "− n + papelera" tiene **tres estilos distintos** según la pantalla, y en el detalle de mazo la papelera caía debajo del contador, descentrada (**corregido** en esta pasada, ver §3).
- Texto de 11,5 px en las cajas de efecto, en las etiquetas de la barra inferior y en metadatos de la ventana del mazo.
- El aviso de "Guardando las cartas para usarlas sin conexión" tapa el título y parte de la cabecera durante la primera visita.
- En Mis mazos/detalle, la foto de fondo pasa por detrás de paneles translúcidos y baja el contraste del contenido.

**Cambios ya aplicados en esta pasada (pedidos expresamente):** todas las cifras de la app en **Inter** (subconjunto 0‑9 con `unicode-range`, verificado con las fuentes que realmente pinta Chrome) y alineación de los controles del detalle de mazo en una sola fila.

---

## 2. Puntuaciones

| Categoría | Nota | Justificación (evidencia) |
|---|---|---|
| Adaptación móvil | **88** | 0 px de scroll horizontal en las 91 combinaciones ancho×pantalla; rejilla 2 col. desde 320; ficha y filtros como hojas. Resta: chips de color cortados sin indicación a ≤375, placeholder del buscador truncado, botón "Añadir cartas" en dos líneas a 320. |
| Navegación y usabilidad | **84** | Barra inferior de 4 pestañas con estado activo, "Volver" en cada pantalla secundaria, Esc/clic fuera cierran. Resta: dos caminos a "Mis mazos" (botón de la home + pestaña) y a "Nuevo mazo" (botón + pestaña) con comportamientos distintos; Competición solo desde el menú hamburguesa. |
| Interacción táctil | **72** | Botones principales a 44 px y feedback de pulsación. Resta: cabecera 42 px, chips 40 px (34 px en escritorio), papelera de ficha 36 px, steppers 40 px, campo Link 21 px (< 24 px WCAG). |
| Consistencia visual | **76** | Lenguaje HUD coherente (cortes en diagonal, tipografía display). Resta: 3 estilos de stepper, mezcla de cortes diagonales y círculos en controles hermanos, mezcla de letras condensadas + cifras Inter en códigos ("ST01", "GD05 + ST11–ST14"). |
| Tipografía y legibilidad | **78** | Jerarquía clara y cuerpo de 14–16 px. Resta: 11,5 px en cajas de efecto (hasta 18 por pantalla en Competición), etiquetas de la barra inferior y `dv-meta`; texto sobre foto en Mis mazos. |
| Datos en móvil | **82** | Competición en pestañas con barras, "pp" y evidencia; resumen del mazo en filas. Resta: tablas de Competición sin jerarquía resumida arriba en 320; ningún gráfico usa interacción táctil más allá del scroll. |
| Accesibilidad | **74** | Foco visible, `aria-live` en contadores, `aria-pressed` en chips, movimiento reducido. Resta: objetivo de 21 px, contraste reducido sobre la foto de fondo, texto < 12 px. |
| Rendimiento móvil | **70** | Medido (CPU ×4, red lenta, sin caché): FCP 0,89 s, DOMContentLoaded 2,4 s; HTML de **1,74 MB** (datos incrustados) y **24 906 elementos** en el DOM porque se pintan las 1086 cartas a la vez (mitigado con `content-visibility:auto` y `loading=lazy`). |
| **Calidad global UX/UI móvil** | **79** | Base sólida y sin roturas; el salto a "premium" pasa por ergonomía táctil, consistencia de controles y peso del DOM. |

---

## 3. Incidencias detectadas

Severidad: **Crítica** (roto/inaccesible) · **Alta** · **Media** · **Baja**.

### Corregido en esta pasada

| # | Ubicación | Problema | Estado |
|---|---|---|---|
| C1 | Global | Cifras en tipografías distintas según componente | **Hecho:** Inter para todas las cifras. Verificado: Chrome pinta los dígitos de `#deckPillCount` y `#resultcount` con Inter y las letras con la fuente original. |
| C2 | Detalle de mazo (Mis mazos → mazo) | La papelera caía debajo de "− n +" y quedaba descentrada respecto al contador ([antes](docs/mobile-audit/390_10_detalle_mazo.png)) | **Hecho:** "− n + papelera" siempre en una fila, alineada a la derecha; si no cabe junto al nombre baja entera ([después](docs/mobile-audit/fix_390_detalle_mazo.png), [escritorio](docs/mobile-audit/fix_1440_detalle_mazo.png)). Verificado a 320/390/768/1440: los 4 botones en la misma línea y dentro de la fila. |

### Pendientes

| # | Ubicación | Problema | Impacto | Sev. | Recomendación | Implementación | Validación |
|---|---|---|---|---|---|---|---|
| 1 | Ficha → campo **Link** (`.fv.is-link`) | Objetivo pulsable de 21 px de alto | Incumple WCAG 2.2 (2.5.8, 24 px); difícil de acertar con el pulgar | **Alta** | `min-height:44px`, `display:inline-flex; align-items:center`, padding vertical | CSS `.fv.is-link` | Medir ≥44 px a 320–1440 |
| 2 | Ficha → papelera (`.dc-del`) | 36×36 px junto a +/− de 44 | Pulsaciones fallidas en una acción destructiva | **Alta** | 44×44 con el icono igual | CSS `.dc-del` | Medir 44×44 |
| 3 | Cabecera: logo, contador de mazo, hamburguesa | 42 px de alto | Por debajo del objetivo de 44 px en los controles más usados | Media | Altura 44 px (la barra ya mide 64) | CSS `.db-top-logo`, `.deck-count`, `.hamburger` | Medir 44 px |
| 4 | Chips (colores, filtros, `clearFilters`) | 40 px en móvil, 34 px en escritorio | Objetivos pequeños y muy juntos | Media | 44 px en `pointer:coarse`; mantener 34 con ratón | CSS `.tag.chip`, `.clearbtn` con `@media (pointer:coarse)` | Medir en emulación táctil |
| 5 | Steppers de ventana del mazo y detalle (`.dv-sbtn`, `.ds-btn`) | 40×40 px | Igual que #4 | Media | 44 px en `pointer:coarse` | CSS | Medir |
| 6 | Controles "− n + papelera" | **Tres estilos**: círculo azul con borde (ficha), círculo azul + papelera rosa (ventana del mazo), círculo navy relleno (detalle de mazo) | El usuario reaprende el mismo control en cada pantalla | Media | Un único componente visual (el de la ficha) con variante oscura para fondos navy | CSS `.dc-btn` / `.dv-sbtn` / `.dp-card .ds-btn` | Captura comparada de las 3 pantallas |
| 7 | Aviso "Guardando las cartas…" (`#warmToast`) | En la primera visita tapa el título y parte de los botones de la home durante la descarga ([captura](docs/mobile-audit/320_01_inicio.png)) | Oculta contenido principal justo en la primera impresión | Media | Moverlo encima de la barra inferior (zona muerta) o compactarlo a una línea; que no tape el `h1` | CSS `#warmToast` | Primera visita a 320/390: `h1` visible |
| 8 | Chips de color bajo el buscador (≤375 px) | La fila se corta ("BLANC…") sin indicar que hay más | Parece un fallo de maquetación | Media | Permitir 2 líneas (`flex-wrap`) o añadir degradado de borde + `scroll-snap` | CSS `#quickFilters` | 320/360/375: los 5 colores visibles o señal de scroll |
| 9 | Texto < 12 px | 11,5 px en `.fx-box` (cajas de efecto), etiquetas de la barra inferior, `.dv-meta` | Lectura difícil en pantallas pequeñas y con zoom de sistema bajo | Media | 12–12,5 px; en la barra inferior 12 px | CSS | Recuento de texto < 12 px = 0 |
| 10 | Mis mazos / detalle de mazo | Foto de fondo detrás de paneles translúcidos ([captura](docs/mobile-audit/390_09_mis_mazos.png)) | Baja el contraste de nombres, contadores y metadatos | Media | Paneles más opacos (≥ 92 %) o velo oscuro sobre la imagen | CSS `.dp-*` / `.dv-*` fondo | Contraste AA en textos de los paneles |
| 11 | Códigos de set con letras + cifras | Tras el cambio a Inter, "ST01" o "GD05 + ST11–ST14" mezclan letras condensadas con cifras Inter más anchas ([captura](docs/mobile-audit/320_11_competicion.png)) | Ritmo visual irregular en chips y titulares | Baja | Para los códigos, usar Inter en el token completo (clase `.code`), o ajustar `size-adjust` del subconjunto | CSS + clase en los chips de set y titulares de formato | Revisión visual de chips SET y Competición |
| 12 | Buscador (≤375 px) | Placeholder truncado ("…texto de ha") | Pista incompleta | Baja | Texto más corto en móvil ("Nombre, número o texto") | i18n `searchPh` + `matchMedia` o atributo distinto | 320: placeholder completo |
| 13 | Detalle de mazo a 320 px | "Añadir cartas" se parte en dos líneas ([captura](docs/mobile-audit/320_10_detalle_mazo.png)) | Botones hermanos con alturas distintas | Baja | `white-space:nowrap` + padding menor, o apilar ambos botones a ancho completo por debajo de 360 | CSS | 320: ambos botones a una línea |
| 14 | Navegación | Dos entradas a "Mis mazos" y a "Nuevo mazo" (botones de la home + pestañas) con comportamientos distintos; Competición solo en el menú | Modelo mental duplicado; Competición poco descubrible | Baja | Mantener los botones de la home como atajo pero que hagan exactamente lo mismo que la pestaña; valorar Competición como acceso visible | JS de los botones | Recorrido: mismo destino desde ambos |
| 15 | Rendimiento | HTML de 1,74 MB y ~25 000 elementos (todas las cartas pintadas a la vez) | Arranque más lento en gama media; memoria | Media | Pintar por lotes (p. ej. 60 cartas + carga al hacer scroll) o virtualizar la rejilla; mover los datos a un JSON cacheado por el service worker | JS `render()`, `embed_data.py`, `sw.js` | Repetir medición: elementos < 5 000 al arrancar, DCL menor |

No se han encontrado incidencias **críticas** (P0): no hay layouts rotos, desbordes, controles inaccesibles por completo ni fallos de funcionalidad en los recorridos probados.

---

## 4. Backlog priorizado

**P0 — Críticas:** ninguna detectada.

**P1 — Alto impacto:** #1 (Link 21 px), #2 (papelera de ficha), #6 (unificar steppers), #7 (aviso de descarga), #8 (chips cortados), #10 (contraste sobre foto), #15 (peso del DOM).

**P2 — Pulido visual:** #3, #4, #5 (subir a 44 px en táctil), #9 (texto 12 px), #11 (códigos de set), #12 (placeholder), #13 (botón en dos líneas), #14 (accesos duplicados).

---

## 5. Recomendaciones detalladas por componente

**Ficha de carta.** La estructura (imagen + columna de control a la derecha, nombre, mazo destino, KPIs, efectos) funciona bien desde 320. Subir la papelera a 44 px, convertir el campo Link en un botón real de 44 px con icono de flecha, y mantener la hoja sin cambios de layout.

**Controles de cantidad.** Un único componente "− n + papelera": círculos de 44 px, borde azul, + verde cuando hay copias (ya hecho en la ficha), papelera en rosa a la derecha. Reutilizarlo en ventana del mazo y detalle de mazo con una variante para fondo oscuro.

**Barra inferior.** Correcta y siempre visible; subir las etiquetas a 12 px y comprobar que el contenido final de cada pantalla queda por encima de la barra.

**Aviso de descarga offline.** Es útil pero aparece en el peor sitio (arriba, sobre el título). Mejor como píldora compacta justo encima de la barra inferior, con la barra de progreso integrada.

**Mis mazos.** Las tarjetas de mazo son claras; el problema es el fondo. Un velo `rgba(15,13,32,.75)` sobre la foto o paneles opacos resuelven el contraste sin perder la imagen.

---

## 6. Mejoras de interacción específicas de móvil

- **Gesto de cierre de la ficha:** arrastrar la hoja hacia abajo (ya tiene el "asa" dibujada) para cerrarla, además de la X.
- **Fila de chips desplazable con indicio:** degradado en el borde derecho y `scroll-snap` para los colores.
- **Botón "Volver arriba"** en el catálogo tras varias pantallas de scroll (1086 cartas).
- **Retroalimentación háptica** (`navigator.vibrate(10)` donde exista) al añadir/quitar copias; opcional y respetando movimiento reducido.

---

## 7. Evidencia visual

| Pantalla | Captura |
|---|---|
| Inicio 320 (aviso de descarga sobre el título, chips cortados) | [320_01_inicio](docs/mobile-audit/320_01_inicio.png) |
| Catálogo 320 | [320_02_grid](docs/mobile-audit/320_02_grid.png) |
| Ficha 320 / abajo | [320_06_ficha](docs/mobile-audit/320_06_ficha.png) · [320_07_ficha_abajo](docs/mobile-audit/320_07_ficha_abajo.png) |
| Filtros 320 | [320_05b_filtros_abiertos](docs/mobile-audit/320_05b_filtros_abiertos.png) |
| Detalle de mazo antes / después | [390 antes](docs/mobile-audit/390_10_detalle_mazo.png) · [390 después](docs/mobile-audit/fix_390_detalle_mazo.png) · [320 antes](docs/mobile-audit/320_10_detalle_mazo.png) · [1440 después](docs/mobile-audit/fix_1440_detalle_mazo.png) · [768 antes](docs/mobile-audit/768_10_detalle_mazo.png) |
| Ventana del mazo 390 | [390_08_ventana_mazo](docs/mobile-audit/390_08_ventana_mazo.png) |
| Mis mazos 390 | [390_09_mis_mazos](docs/mobile-audit/390_09_mis_mazos.png) |
| Competición 320 | [320_11_competicion](docs/mobile-audit/320_11_competicion.png) |
| Nuevo mazo 320 | [320_12_nuevo_mazo](docs/mobile-audit/320_12_nuevo_mazo.png) |
| Escritorio 1440 | [1440_01_inicio](docs/mobile-audit/1440_01_inicio.png) |

**Qué no se ha probado:** dispositivos reales (solo emulación de Chrome), Safari/iOS, orientación horizontal, zoom de texto del sistema al 200 % y lectores de pantalla.

---

## 8. Resultado tras la implementación (fase 3, 28 oct 2026)

Repetidas las mismas mediciones (7 anchos × 13 pantallas, con emulación táctil) y una medición de carga igual a la inicial (CPU ×4, red lenta, sin caché ni service worker).

| Métrica | Antes | Después |
|---|---|---|
| Scroll horizontal / desbordes | 0 / 0 | 0 / 0 |
| Objetivos < 24 px | 1 (campo Link, 21 px) | **0** (Link 44 px) |
| Objetivos < 44 px en móvil táctil | cabecera, chips, papelera de ficha, steppers, chip de legalidad, borrar mazo… | **0** (en escritorio con ratón los chips siguen a 34 px, a propósito) |
| Texto < 12 px | cajas de efecto, barra inferior, `dv-meta`, chip de legalidad | **0** |
| Elementos en el DOM al arrancar | 24 906 | **1 621** |
| Imágenes al arrancar | 1 089 | **51** |
| DOMContentLoaded | 2,4 s | **1,6 s** |
| First Contentful Paint | 0,89 s | **0,81 s** |
| Errores de consola / recursos rotos | 0 / 0 | 0 / 0 |

| # | Estado |
|---|---|
| 1, 2, 3, 4, 5, 9 | **Hecho** (44 px en táctil, 12 px mínimo). |
| 6 | **Hecho:** el mismo control "− n + papelera" (círculos de 44 px con borde azul, + verde con copias, papelera rosa) en ficha, ventana del mazo y detalle de mazo. |
| 7 | **Hecho:** el aviso de descarga va sobre la barra inferior en móvil (encima de la tarjeta de instalar si está) y en la esquina inferior derecha en escritorio; ya no tapa el título. |
| 8 | **Hecho:** los chips de color pasan a dos líneas si no caben. |
| 10 | **Hecho:** paneles del detalle de mazo opacos sobre la foto. |
| 12, 13 | **Hecho:** placeholder corto en ≤375 px; "Añadir cartas" en una línea a 320 px. |
| 15 | **Hecho (parte de pintado):** la rejilla pinta 48 cartas y añade más al acercarse al final; con los mismos filtros (cambio de idioma o de mazo) conserva lo ya pintado. Búsqueda, filtros, contador, insignias y la transición de carta probados. **Pendiente:** sacar los datos incrustados a un JSON cacheado (sigue habiendo 1,7 MB de HTML). |
| 11 | **No aplicado:** dejar los códigos de set fuera de Inter contradice "todas las cifras en Inter"; queda a decisión. |
| 14 | **Revisado:** los botones de la home y las pestañas ya llevan al mismo sitio; sin cambios. |
| Ventana del mazo a < 375 px | Si "− n + papelera" no cabe junto al nombre, baja a su propia línea alineada a la derecha. |
