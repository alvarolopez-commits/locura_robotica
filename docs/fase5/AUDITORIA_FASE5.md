# Auditoría Fase 5 · Gundaneo (4 nov 2026)

Alcance: aplicación actual en local (commit base `d8d6637` + cambios sin subir de Competición V3, Fase 4 y las tres decisiones del 4 nov). Navegador: Chrome sin ventana en modo emulación; datos de prueba sintéticos; sin cuentas de producción. **No hay `package.json`**: la app es un HTML con JS plano; las pruebas son `node tests/*.test.js`, `python -I tests/test_*.py` y `node tests/ui_*.mjs` (CDP).

## Resumen
- Línea base de las 40 pruebas con la versión previa a la fase: **todas pasan** (`linea_base_2026-11-04.txt`).
- Barrido de 11 pantallas × 5 anchos (360/390/430/768/1440): **0 desbordamientos horizontales, 0 excepciones, 0 respuestas ≥ 400, 0 peticiones repetidas, 0 imágenes sin `alt`** (`barrido_*.json`).
- P0 encontrados: 0. P1: 2 (privacidad, corregidos). P2: 2 corregidos, 3 pendientes de decisión. P3: 3.

## Hallazgos
| ID | P | Módulo | Hallazgo (verificado) | Evidencia | Estado |
|---|---|---|---|---|---|
| F5-01 | P1 | Privacidad (SEC-04) | El fixture de pruebas `tests/fixtures/comp_batch_mini.json`, sin subir, contenía **nombres reales de jugadores** copiados del lote. Habría ido al repositorio al subir. | `Get-Content` del fixture (4 nombres) | **Corregido**: nombres sintéticos; `comp_stats.test.js` 71/71 |
| F5-02 | P1 | Privacidad (SEC-04) | 4 capturas locales de la V3 (fichas de arquetipo y torneo) mostraban nombres, hechas antes de la decisión de privacidad. Nunca estuvieron en git. | listado de `docs/mobile-ux-vnext/competicion-v3` | **Corregido**: borradas y regeneradas con la versión actual |
| F5-03 | P2 | A11y (UX-01) | `input#searchMain` (buscador principal) sin nombre accesible. | `ui_fase5_a11y.mjs` antes: 4 FALLAN (`a11y_antes.txt`) | **Corregido** (`aria-labelledby` al rótulo ya traducido); después 7/7 (`a11y_despues.txt`) |
| F5-04 | P2 | Catálogo (UX-01) | Insignias de regla (`.rule-badge`) de 28 px de alto, frente a ≥44 px de `DESIGN.md`. | `visible 28, pulsable 29` antes | **Corregido** con zona pulsable ampliada (`::after`), sin cambio visual; pulsable ≥44 |
| F5-05 | P3 | Mis mazos | Al cargar, la app añade una vez `updatedAt` a mazos antiguos que no lo tenían. No cambia ids, nombre ni cartas. | `dbg_decks` antes/después | Observación, sin acción |
| F5-06 | P2 | Constructor | Tras quitar la × de la barra (petición del dueño), `setBuilding(false)` no se llama desde ningún sitio (0 usos): **no hay forma en la interfaz de salir del modo construcción**. | `grep setBuilding(false)` = 0 | **Pendiente de decisión de producto** (dónde poner el control) |
| F5-07 | P2 | Comparador (Fase 3) | «Crear variante» **no existe** en el código; «Comparar» enfrenta tu mazo con perfiles de arquetipo del meta, no con una lista concreta. | `grep variante` solo en textos ajenos; `openMeta` | **No implementado**. CMP-01/CMP-03 de la checklist: no aplicable hasta construirlo |
| F5-08 | P2 | Datos | La lista de WinDecks (1.er puesto) aporta **1 solo resultado** de un torneo de 16: la muestra de presencia (n = 57) mezcla cortes Top 8/16 con «solo el ganador», lo que sobrepondera a los ganadores. | `comp_events` | **Pendiente de decisión**: excluir de presencia hasta tener el corte completo, o mantener y avisar |
| F5-09 | P2 | Datos | La taxonomía de arquetipos difiere entre fuentes («Kshatriya + Strike Freedom Gundam» frente a «Kshatriya Banshee»…): cada nombre es una fila distinta. No se han fusionado por no poder asegurarlo. | `competition_events.json` | Pendiente (mapa de equivalencias, decisión del dueño) |
| F5-10 | P3 | Catálogo | Chips de filtro (`.tag.chip`) de 40 px de alto en móvil (5 en pantalla). | barrido | Backlog |
| F5-11 | P3 | Constructor | Botones de fila `dv-sbtn` se ven de 32 px; la zona pulsable medida es ≈42×42 (diseñada como 34×44). Cumple por diseño, no al 100 % de 44×44. | barrido | Backlog (aceptado) |
| F5-12 | P3 | Medición | Mi sondeo de zona pulsable da falsos positivos junto a barras fijas (la pestaña inferior tapa la parte baja de un botón). | barrido | Limitación documentada |

## Seguridad y privacidad (revisado)
- **RLS** (revisión estática de `supabase/schema.sql` y `favorites.sql`): `decks`, `deck_cards`, `user_preferences`, `user_collection` y `user_archetype_favorites` con RLS activado y política «solo el propietario» (`auth.uid()`), `revoke all … from anon`; funciones sin `security definer`. **Prueba contra un Supabase real: NO EJECUTADA** (sin proyecto ni usuarios de prueba); las pruebas con servidor simulado cubren la lógica de sincronización, no las políticas reales.
- **Migración de favoritos: NO aplicada** (la aplica el dueño). Sin ella la app degrada a «solo en este dispositivo» (probado).
- **Claves**: ninguna en el código nuevo (búsqueda de `service_role`, `sk_live`, `X-API-Key: '…'`, `DIGILAB_API_KEY = '…'`). La clave pública de Supabase es la del diseño. DigiLab solo por variable de entorno.
- **MetaSheep**: sin código de red hacia MetaSheep; el lote se importa de un archivo local.
- **Nombres de jugador**: ausentes del archivo de datos (lista blanca `sanitizeResult`), de la interfaz y de las capturas regeneradas. Quedan nombres en copias de seguridad locales `data/meta/backup/` (ignoradas por git).

## No auditado (sin acceso o sin hacer)
Móvil real, Lighthouse, lector de pantalla real, contraste calculado, medición de peso de imágenes (PERF-02), carga sin conexión con el service worker, RLS contra Supabase real.
