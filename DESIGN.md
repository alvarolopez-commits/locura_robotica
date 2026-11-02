---
name: Locura robótica
description: HUD de cartas oscuro-azulado con cortes diagonales, tipografía Inter y cifras Inter Digits.
colors:
  navy: "#221e41"
  navy-2: "#2c2757"
  paper: "#eef2f5"
  panel: "#ffffff"
  tone: "#e3eaef"
  line: "#c6d3dc"
  fg-1: "#221e41"
  fg-2: "#2e4a62"
  fg-3: "#4b6880"
  accent: "#3e707c"
  sky: "#8bcdff"
  rose: "#f4a6a6"
  card-blue: "#3b6ea5"
  card-green: "#4a7a52"
  card-red: "#b5544a"
  card-purple: "#7a5b9c"
  card-white: "#aeb4c2"
typography:
  body: { fontFamily: "Inter", fontSize: "15px", fontWeight: 400, lineHeight: 1.55 }
  caption: { fontFamily: "Inter", fontSize: "12px", fontWeight: 500, lineHeight: 1.4 }
  section-title: { fontFamily: "Inter", fontSize: "22px", fontWeight: 700, lineHeight: 1.3 }
  display-md: { fontFamily: "Inter Digits", fontSize: "clamp(34px,10.5vw,48px)", fontWeight: 700 }
spacing: { pad-mobile: "14px", pad-tablet: "20px", pad-desktop: "28px" }
rounded: { cut: "10px", cut-l: "18px" }
---

## Overview
Interfaz clara de lectura (papel #eef2f5) con cabecera y marcos navy. El carácter lo da el **corte diagonal** (`--cut`) en botones y paneles, no el redondeo. Solo tema claro (`color-scheme: only light`) por decisión de producto.

## Colors
Usar siempre tokens. Los cinco colores de carta (`card-*`) son semánticos: no se reutilizan como decoración. Texto secundario con `fg-2`/`fg-3`, nunca gris neutro. Contraste mínimo 4.5:1 en cuerpo.

## Typography
Todo el texto sale de las variables `--text-*` (display, page-title, section-title, card-title, body, body-sm, nav, button, label, caption, kpi, metric, table). **Prohibido** declarar `font-size` suelto; mínimo 12 px. Cifras siempre en Inter (`Inter Digits`).

## Layout
Rejilla de 2 columnas desde 320 px. Padding de página 14 / 20 / 28 px según ancho. Ancho máximo de listas de mazo 920 px. Barra superior `--top-h`, barra inferior `--tab-h`, ambas con `safe-area-inset`.

## Elevation & Depth
Sombras con desplazamiento y desenfoque; nunca halos de color de radio cero ni sombras duras. `backdrop-filter` solo en barras fijas.

## Shapes
Corte diagonal 10 px (controles) y 18 px (paneles). No mezclar cortes y círculos en controles hermanos.

## Components
- **Lista de mazo:** solo `deckSegments` (Unidades / Pilotos / Bases / Comandos; fila copias · color · carta · − + papelera).
- **Contador de copias:** un único estilo en toda la app; objetivo táctil 44 px (zona pulsable mayor que el trazo visible).
- **Hojas:** ficha de carta, filtros y mazo son hojas inferiores en móvil.
- **Chips de filtro:** una fila deslizable; partir texto largo, nunca recortarlo sin `…`.

## Do's and Don'ts
**Sí:** tokens, `--ease-out`, estados (hover, foco, deshabilitado, cargando, error, vacío) en cada control, objetivos ≥44 px, texto ≥12 px.
**No:** colores hex sueltos, easing con rebote, animar `width/height/padding`, `z-index` fuera de las capas definidas, `!important`, bordes laterales >1 px, texto sobre foto sin velo suficiente, eyebrow sobre títulos, tarjetas anidadas.
