# Fase 6A · Importación y revisión de resultados competitivos

Pipeline **local**: sin red, sin scraping, sin credenciales, sin panel público. Todo lo que entra pasa por validación, deduplicación y revisión humana antes de tocar `data/competition_events.json`.

## Flujo

```
 entrada                normalizar            validar              deduplicar            cola local              decisión humana        publicar
 ───────                ──────────            ───────              ──────────            ──────────              ───────────────        ────────
 lote JSON      ┐       campos personales     fecha real, set,     id / fuente / URL     data/meta/pipeline/     approve --ids --by     backup versionado + sha256
 JSON canónico  ├──►    descartados (solo     cantidades,          canónica → duplicado  queue.json + log.jsonl  dismiss               archivo temporal verificado
 texto de lista ┘       se cuentan)           50 cartas, catálogo, huella ambigua →      (git la ignora)         --as new|merge         (parse + sha + invariantes)
                                              legalidad a la fecha revisión               received →              --coverage             rename atómico
                                                                    misma posición →      validated/rejected →                           bitácora con checksums
                                                                    enrich / revisión     ready | needs_review →                         rollback seguro
                                                                                          approved|dismissed → published
```

* `preview` y `stage` **no modifican** los datos publicados. `publish` sin `--apply` es una simulación.
* Un candidato `ready` **nunca se publica solo**: hay que aprobarlo con `approve`.
* `--by` es un id interno (`op-1`), nunca un nombre ni un correo. Queda solo en la cola y la bitácora locales.

## Cómo importar un torneo nuevo

```bash
node scripts/competition_pipeline.js preview  entrada.json          # 1. ver qué pasaría (no escribe nada)
node scripts/competition_pipeline.js stage    entrada.json          # 2. guardar en la cola local
node scripts/competition_pipeline.js review                         # 3. revisar lo que está en needs_review
node scripts/competition_pipeline.js approve --ids E:..,R:.. --by op-1   # 4. aprobar de forma explícita
node scripts/competition_pipeline.js publish --by op-1              # 5. simulación con estadísticas antes → después
node scripts/competition_pipeline.js publish --apply --by op-1      # 6. publicar (copia previa + escritura atómica)
node scripts/verify_competition_data.js                             # 7. verificar el resultado
```

Una lista suelta en texto (export de WhiteBase/ExBurst, etc.):

```bash
node scripts/competition_pipeline.js preview lista.txt --kind text --event-id proveedor:id --date 2026-11-09 \
  --name "…" --venue "…" --country Japan --format Standard --set GD06 --placement 1 --archetype "…" --url https://…
# o sobre un torneo ya publicado:  --event <id>
```

Un texto que no se interpreta del todo se rechaza **entero** (`text_unparseable`); nunca se importa a medias.

### Decisiones que exige el pipeline

| Situación | Qué hace | Qué hay que decidir |
|---|---|---|
| Mismo id, misma fuente o misma URL canónica | `duplicate`: se suman las fuentes, no se crea otro evento | nada |
| Misma fecha + sede + país + formato + set con otro id (**el tipo no cuenta**: «Newtype Challenge» y «Launch Event» el mismo día en la misma sede se revisan) | `needs_review` (`event_fingerprint`) | `--as new` (otra sesión del mismo sitio) o `--as merge` (es el mismo) |
| Dos eventos del mismo lote con esa misma huella | **ambos** a `needs_review` (`event_fingerprint_in_batch`), y sus resultados esperan | igual que arriba |
| Mismo id o misma URL/fuente que un evento publicado, pero el **tipo se contradice** | `needs_review` (`event_type_conflict`); no se fusiona en silencio | solo `--as merge` (con un id existente no cabe «new»); el tipo publicado no cambia |
| Tipo deducido solo del nombre (`typeSource: inferred_from_name`) en un evento nuevo | `needs_review` (`event_type_inferred`) | `--confirm-type` (y opcionalmente `--type "…"`); queda `typeSource: operator_confirmed`. Un tipo que declara la fuente queda `declared` y no pide confirmación |
| Mismo nombre y día pero otra tienda | evento nuevo (no se fusiona) | nada |
| Resultado existente que gana 50 cartas | `enrich`: conserva su id, **no suma a n**; las cartas tienen su propio n | nada |
| Mismo puesto, otro arquetipo / otras cartas | `needs_review` (puede ser un empate real) | `--as new` / `--as merge` |
| Evento sin cobertura declarada | un solo mazo → propone `single_deck`; varios → pide `--coverage` | `--coverage top_cut_only\|single_deck` |
| Lista de 49/51 cartas, código fuera del catálogo o ilegal | el resultado viaja **sin cartas** (`cardsRejected`); no habilita comparar ni «construibles» | aprobar solo como arquetipo/puesto, o descartar |
| Datos personales (perfil, correo, nombre) | se descartan; si están en un campo permitido el candidato se rechaza | nada (no se guarda) |
| Resultado de un evento aún no listo | `needs_review` (`event_pending_review`) | resolver primero el evento |

### Muestra principal de GD06

La muestra principal solo cuenta eventos `top_cut_only`. Los `single_deck` (un único ganador) nunca entran en el porcentaje principal; solo se ven al mezclar coberturas (`n` siempre visible). Un torneo con un mazo se propone como `single_deck` y la prueba `8 · un torneo con un solo mazo…` comprueba que la muestra no cambia.

## Antes / después (demo sobre una copia, lote sintético `tests/fixtures/pipeline/lote_demo.json`)

| | antes | después |
|---|---|---|
| eventos publicados | 6 | 7 |
| resultados publicados | 57 | 65 |
| **n de la muestra principal (denominador)** | **56** | **64** |
| eventos en la muestra | 5 | 6 |
| arquetipo más presente | Mobile Fighter 16/56 = 28,6 % | Mobile Fighter 20/64 = 31,3 % |
| n si se mezclan coberturas | 57 | 65 |
| listas completas verificadas | 1 | 2 (por el resultado enriquecido) |
| cartas populares: n (mínimo 10) | 1 | 2 → sigue sin mostrarse |

El lote trae 18 candidatos: 12 nuevos, 1 enriquecimiento, 2 duplicados, 1 rechazado (URL con perfil) y 6 en revisión (11 listos). Los 6 en revisión quedan **sin publicar**: el evento de huella ambigua y su resultado, el evento de un solo mazo (cobertura por confirmar) y su resultado, el evento con id publicado pero tipo contradictorio («Regional» frente a «Newtype Challenge»), y la lista de 49 cartas. Registro completo: [`ejecucion_demo.txt`](ejecucion_demo.txt).

Los datos reales **no se han tocado**: la cola real está vacía y la demo se ejecutó sobre una copia temporal.

## Rollback seguro

```bash
node scripts/competition_pipeline.js rollback --by op-1            # simulación: dice qué copia se restauraría
node scripts/competition_pipeline.js rollback --apply --by op-1
```

* Se niega si el archivo cambió **después** de la última publicación (el checksum actual debe coincidir con el registrado). `--force` lo permite sabiendo que se pierde ese cambio posterior.
* Antes de revertir guarda `…-pre-rollback.json`, así que el propio rollback se puede deshacer.
* Los candidatos publicados vuelven a `approved`; se pueden volver a publicar o descartar.
* Las copias están en `data/meta/backup/` con su `.sha256`. Restaurar a mano: copiar la copia sobre `data/competition_events.json` y comprobar el sha256.

## Fuentes: qué se puede usar

| Fuente | Estado |
|---|---|
| DigiLab | Principal. Requiere clave (`DIGILAB_API_KEY`) y respetar sus condiciones. `scripts/import_digilab.js` ya existe; su salida entra por este pipeline. |
| WhiteBase / ExBurst | Exportaciones de listas (texto o JSON) aportadas por el operador. Entran por `--kind text`. |
| WinDecks | Solo listas pegadas por el operador con su URL; **sin scraping**. |
| MetaSheep | Solo el lote ya importado; **sin scraping** ni automatización. |
| Cualquier otra | Hace falta permiso o API documentada. Que `robots.txt` lo permita no es permiso. |

## Corrección de deduplicación (huella sin tipo)

* La huella es **fecha + sede normalizada + país + formato + set**. El tipo y el nombre no entran: si dos eventos coinciden, van a `needs_review` con motivo, nunca a `ready` ni a `duplicate` automático. Se comprueba contra lo publicado y entre eventos del mismo lote.
* En el formato de lote el tipo se deduce del nombre; ahora queda registrado como `typeSource: inferred_from_name` (procedencia incierta) y un evento nuevo con ese tipo no se publica sin `--confirm-type`. Los eventos ya publicados no se han modificado (no tienen `typeSource`).
* Los ids y las URL oficiales siguen mandando para reconocer duplicados, pero si el tipo contradice al publicado se revisa y no se fusiona.
* `approve` trabaja sobre copias: si una aprobación se rechaza (falta `--as`, `--coverage` o `--confirm-type`), el candidato queda exactamente como estaba. Antes podía quedar con la decisión `--as` ya aplicada.
* Aún no se comparan otros metadatos contradictorios (fecha o sede distintas con el mismo id): se fusionan las fuentes sin tocar el evento publicado.

## Pendiente fuera de 6A

* Supabase `favorites.sql`: sin tocar en esta fase. Hay que revisar grants y policies y probar el aislamiento A/B con **dos usuarios autenticados**; no vale el SQL Editor de administrador.
* Prueba en **móvil físico** (Android y/o iOS): gestos, teclado, navegación inferior y persistencia.
* «Kshatriya Banshee» y «Kshatriya + Strike Freedom Gundam» siguen separados; la equivalencia **no está verificada** y no se usa alias conjunto.

## Fase 6B (solo diseño, no activada)

Conectores programados que alimenten **la misma cola**, nunca los datos publicados:

* Solo con autorización o API documentada; claves **solo en servidor** (nunca en el front ni en el repo).
* Respetar límites: backoff exponencial, parada total ante 429 o 403, nada de reintentos agresivos.
* Todo candidato nace `received`; nada se publica sin `approve` humano.
* Estado por conector: `lastSuccessfulFetch`, cursor/ETag, contador de fallos y **kill switch** (archivo o variable que lo desactiva).
* Registro sin datos personales; alerta cuando un lote supera un umbral de rechazos.

## Archivos

* `scripts/pipeline/lib.js` — núcleo (normalizar, validar, deduplicar, cola, publicar, rollback)
* `scripts/competition_pipeline.js` — consola
* `comp_stats.js` — `source()` conserva `retrievedAt`, `license`, `canonicalUrl`
* `tests/pipeline.test.js` (47 pruebas) · `tests/fixtures/pipeline/lote_demo.json`
