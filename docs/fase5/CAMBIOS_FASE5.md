# Cambios de la Fase 5 y de la importación WinDecks

Nada de esto está subido: no hay commit, push ni despliegue.

## Fase 5 (correcciones)
| Archivo | Antes → después | Motivo | Prueba |
|---|---|---|---|
| `tests/fixtures/comp_batch_mini.json` | 4 nombres reales → nombres sintéticos | F5-01 | `comp_stats.test.js` 71/71 |
| `dashboard.html` | buscador sin nombre → `aria-labelledby="lblSearchEyebrow"` | F5-03 | `ui_fase5_a11y.mjs` 4 FALLAN → 7/7 |
| `dashboard.html` | `.rule-badge` zona pulsable 29 → ≥44 px (`::after`), aspecto igual | F5-04 | `ui_fase5_a11y.mjs` |
| `docs/mobile-ux-vnext/competicion-v3/*.png` | 4 capturas con nombres → regeneradas | F5-02 | — |
| `tests/ui_fase5_a11y.mjs`, `ui_fase5_barrido.mjs`, `ui_fase5_recorridos.mjs` | nuevos | evidencia y regresión | ver `PRUEBAS_FASE5.md` |

## Importación de la lista de WinDecks (1.er puesto, 3 nov 2026)
- `data/competition_events.json`: **5 → 6 torneos, 56 → 57 listas**. Torneo nuevo `windecks:01M6G9R42V9CAP5B5H33SFXZ8T` (Newtype Challenge, コーギーアール本店, Japón, Standard, GD06, 16 participantes). Lista `windecks:01M6G9R42TD8FAWCRGWM8Z3RRN`, 1.º, «Kshatriya + Strike Freedom Gundam», rojo y azul, con URL original, 50 cartas en 16 códigos.
- Validado antes de guardar: suma 50 · 16 códigos en el catálogo · legal según `gcg-global-2026-09-25` (única regla del repositorio; a fecha del torneo) · torneo y lista no existían · sin nombre de jugador. Repetir la importación se rechaza («ese puesto ya tiene una composición verificada»).
- Copia de seguridad previa: `data/meta/backup/` (local).
- `scripts/import_deck_export.js` reescrito: valida todo lo anterior, reconoce torneos ya cargados desde otra fuente y añade la composición al resultado existente en lugar de duplicar. Sin descargas ni scraping: solo el texto aportado.
- Denominadores: **presencia GD06 n = 57** (Mobile Fighter 16/57 = 28,1 %; la lista nueva 1/57 = 1,8 %). **Inclusión de cartas: n = 1 lista completa de 57**, por debajo del mínimo de 10 → no se publican porcentajes de cartas.
- `tests/fixtures/comp_lote_inicial.json`: lote inicial congelado (5 torneos, 56 listas) para que las pruebas de Competición no dependan de datos vivos; `tests/ui_comp_windecks.mjs` prueba los datos reales.

## Regresiones descartadas
Pruebas de unidad (9 archivos) y Python (4) pasan; la UI de Competición, favoritos y colecciones, ver `PRUEBAS_FASE5.md`.

## Pendiente
F5-06, F5-07, F5-08, F5-09 (decisiones de producto) y el backlog P3. «Habilitar creación de variantes» no es posible sin construirla.
