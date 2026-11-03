# Fase 3 · Microinteracciones (2 nov 2026)

Todo en local: sin commit, push ni despliegue. Sin tocar `legality.js`, `data/`, sincronización ni Supabase.

## Estado de partida

- Fase 1 (HUD refinado) y fase 2 (ergonomía) implementadas en el árbol de trabajo. Batería completa en verde salvo `ui_collection_tile` (2 fallos), causado por F3 de la fase 2. Se deshizo F3 y el test vuelve a pasar (20/20).
- Lo que ya existía y se conserva: efecto de pulsación (`.rip`) en botones, chips, pestañas y contador; animación `tick` del número en la ficha y en la ventana del mazo; salto (`bump`) del contador de la cabecera; hojas con velo y apertura animada; reducción de movimiento global.

## Inventario y decisiones

| Componente | Estado encontrado | Cambio | Riesgo |
|---|---|---|---|
| Anuncio del resultado al añadir/quitar | Un `aria-live` por cada número (`.dc-n` en la ficha y `.ad-n` en **cada carta** de la rejilla); solo anunciaban el número, sin carta ni mazo | Una sola región `#deckLive` (`role=status`) con "Carta: N copias en «Mazo»", "· Límite alcanzado" al llegar al máximo, el motivo real del motor si no se puede añadir, o "Quitada del mazo". Se quitan los `aria-live` de los números | Bajo (no toca el estado; solo lee el mazo ya cambiado) |
| Número de la carta del catálogo | No se animaba (la ficha y la ventana del mazo sí) | Misma animación `tick` (transform/opacity, desactivada con movimiento reducido) | Bajo |
| + deshabilitado en la carta del catálogo | Sin explicación cuando el límite es el normal de 4 | `title` con el motivo del motor o "Límite alcanzado" | Bajo |
| Doble toque rápido | Operaciones locales y síncronas: cada toque es una operación y el límite se comprueba en cada una | Sin cambio; test que lo garantiza (3 copias + 2 toques = 4 guardadas) | — |
| Hojas (ficha, filtros, mazo) | Ya animadas con transform/opacity y velo; la ficha protegida contra cierres a medias (`cardFly.busy`) | Sin cambio; test de abrir y cerrar 4 veces seguidas sin velo residual ni pérdida de scroll | — |
| Avisos (toasts) | `warmToast` (descarga sin conexión) y el chip de guardado; no hay toast al añadir | No se crea un sistema nuevo: el feedback visual ya es el número que cambia en la carta/ficha/mazo y el salto del contador | — |
| Navegación inferior | Estado activo inmediato con su animación corta | Sin cambio | — |

**Petición del usuario durante la fase:** "Mis mazos" con un mazo por fila (en móvil el nombre se cortaba). `.dp-grid` pasa a una columna con ancho máximo de 920 px, como las listas de mazo.

## Sin conexión y sincronización

Añadir y quitar siguen escribiendo solo en el mazo local (`saveDecksToStorage`); el anuncio no habla de la nube. El estado de sincronización sigue en el chip de guardado existente ("Guardando", "Sin conexión · Reintentar"…). No se ha simulado la desconexión en esta fase.

## Archivos

- `dashboard.html`: `#deckLive`, `announceDeck()`, llamadas en la ficha, la carta del catálogo y las filas del mazo; `tick` en `.ad-n`; motivo en el + deshabilitado; `.dp-grid` de una columna.
- `tests/ui_fase3_feedback.mjs` (nuevo). Contra la versión publicada falla en lo nuevo (anuncios, animación, motivo, una columna); contra la actual pasa 24/24.
- `tests/ui_fase2_ergonomia.mjs`: se quita la comprobación de F3 (deshecho).
- Capturas: `comparativa_mis_mazos.png`, `antes_*_mis_mazos.png` y `despues_*_mis_mazos.png` (320 y 375 px).
