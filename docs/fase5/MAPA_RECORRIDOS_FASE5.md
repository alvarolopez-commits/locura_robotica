# Mapa de recorridos · Fase 5

Rutas reales (navegación por `#hash`, sin rutas de servidor; recargar una ruta de detalle no da 404 de cliente):

| Destino | Cómo se llega (móvil) | Hash |
|---|---|---|
| Catálogo | pestaña «Catálogo» (barra inferior) | — |
| Mis mazos | pestaña «Mazos» (`#tbDecks`) | — |
| Mi colección | pestaña «Colección» | `#coleccion` |
| Competición › Meta | ☰ → Competición (2 toques) | `#competicion` |
| Competición › Torneos | pestaña «Torneos» dentro de Competición | `#competicion/torneos` |
| Ficha de arquetipo | tocar una fila del ranking, de «Para ti» o de «Mejores resultados» | `#competicion/arquetipo/<nombre>` |
| Ficha de torneo | tocar una tarjeta de torneo | `#competicion/torneo/<id>` |
| Comparador | botón «Comparar →» (barra del mazo o detalle) o «Comparar mi mazo» en una lista completa | (capa, sin hash) |

El estado de Competición (pestaña, temporada, filtros, ficha) va en la URL; favoritos y «visto» no (privacidad).

## Recorridos (solo lo observado en ejecución)
| ID | Pasos reales | Resultado | Evidencia |
|---|---|---|---|
| J1 Meta → filtro → arquetipo → torneo → atrás | Abrir Competición (☰ + Competición: 2 toques; la fila n.º 1, Mobile Fighter, y su n ya están a la vista) · «Más filtros» (1) · elegir Top 8 (1) · tocar fila (1) · tocar «Mejores resultados» (1) · atrás ×2 | **PASÓ**: filtros y scroll intactos al volver | `ui_comp_v3.mjs` (NAV-01), `ui_fase5_recorridos.mjs` |
| J2 Catálogo → carta → mazo → guardar | 1 toque por copia en «+» (6 «+» y 1 «−» = 7 toques en la prueba); el guardado es automático, sin botón; límite de 4 respetado; persiste tras recargar | **PASÓ** | `recorridos_j2_j6.txt` |
| J3 Lista completa → comparar → colección → variante | «Comparar mi mazo» abre el comparador existente (mazo propio intacto); cobertura de colección en la ficha (`49/50`); **«crear variante» no existe** | **PARCIAL / NO EJECUTADO** (variante) | `ui_comp_windecks.mjs`; F5-07 |
| J4 Resultado GD06 sin composición | Cuenta en presencia; sin «Copiar» ni «Comparar» (ni botones desactivados), mensaje «Composición de cartas no disponible» y enlace a la fuente | **PASÓ** | `ui_comp_v3.mjs`, `ui_comp_d3.mjs` |
| J5 Favorito → Para ti → recarga → otro dispositivo | Invitado: local; con sesión (Supabase **simulado**): sube, se une y se propaga; sin migración: degrada con aviso en «Tu cuenta» | **PASÓ con servidor simulado**; real: NO EJECUTADO | `ui_comp_d3.mjs`, `favorites_sync.test.js` |
| J6 Error de red / recarga / atrás | Recarga en una ficha vuelve a la misma ficha con filtros; atrás/adelante coherentes; fallo 503 de datos → mensaje con «Reintentar» y la otra temporada usable; recuperación sin recargar; mazos guardados intactos | **PASÓ** | `recorridos_j2_j6.txt` |

Fricciones observadas: no hay salida del modo construcción (F5-06); «Comparar» no compara con la lista concreta (F5-07).
