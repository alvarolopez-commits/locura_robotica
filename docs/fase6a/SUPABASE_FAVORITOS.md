# Supabase · favoritos: endurecimiento de permisos

**Estado: SQL preparado y revisado. NO aplicado en staging. NO aplicado en producción.** Nada de esto se ha ejecutado contra ninguna base: aquí no hay PostgreSQL ni credenciales, y no se usa `service_role`.

## Qué se revisó
Se contrastó `02_SEGURIDAD_FAVORITOS_PARCHE.sql` con el esquema real de [`supabase/favorites.sql`](../../supabase/favorites.sql) (tabla `user_archetype_favorites` con `user_id uuid` PK; función `public.save_favorites(jsonb, integer)` con `SECURITY INVOKER` implícito, cuerpo con nombres calificados) y con la llamada real de la app ([`favorites_sync.js`](../../favorites_sync.js): un `select` de la fila propia y la RPC; nunca borra).

| Hallazgo | Gravedad | Detalle |
|---|---|---|
| La función no revoca `PUBLIC`/`anon` | P2 | Sin sesión no se puede escribir (falla con `not_authenticated`), pero la función es llamable. |
| Permisos de `authenticated` implícitos | P2 | Dependen de los valores por defecto del proyecto; el parche los fija: `SELECT, INSERT, UPDATE` (no `DELETE`). |
| `search_path` de la función sin fijar | P3 | Se fija a `''` (el cuerpo ya usa `public.` y `auth.` calificados, así que sigue funcionando). |
| `UPDATE` directo salta el control de revisión | P3, aceptado | Solo afecta a la propia fila de la persona; el `CHECK` limita el tamaño. Evitarlo exigiría `SECURITY DEFINER`, que añade riesgo. |
| `create_deck`, `replace_deck_cards`, `set_card_quantity`, `duplicate_deck`, `save_collection` | P2, **abierto** | Mismo patrón (`grant … to authenticated` sin revocar `PUBLIC`). Fuera de este alcance; conviene un parche gemelo tras validar este. |

## Archivos
* [`supabase/favorites_security.sql`](../../supabase/favorites_security.sql): el parche. Idempotente, en transacción, con comprobación previa (falla si falta la migración base) y consultas de verificación.
* [`supabase/favorites_security_rollback.sql`](../../supabase/favorites_security_rollback.sql): lo deja como la migración base. No toca datos.
* [`scripts/rls_favorites_check.mjs`](../../scripts/rls_favorites_check.mjs): prueba de aislamiento por la Data API (13 comprobaciones).
* Pruebas del propio material: `tests/security_static.test.js` (forma de los SQL y ausencia de secretos) y `tests/rls_check.test.mjs` (el verificador contra un Supabase falso que falla de varias maneras).

## Impacto esperado
* La web no cambia: usa `select` de su fila y la RPC, y ambos siguen permitidos a `authenticated`.
* Quien no tiene sesión pasa de «puede llamar a la función y recibir un error» a «recibe 401/403».
* No se modifica ni se borra ningún dato. Si algo fallara, el rollback restaura la situación anterior.

## Pasos de ejecución en staging (los hace la persona propietaria)
1. Proyecto de **staging** (no el de `config.js`). Si la migración base no está: aplicar `supabase/favorites.sql` y comprobar que la tabla existe con RLS.
2. **Guardar los permisos actuales** (consultas al inicio de `favorites_security_rollback.sql`) para poder compararlos o restaurarlos exactos.
3. Aplicar `supabase/favorites_security.sql` en el SQL Editor. Debe terminar sin errores.
4. Ejecutar las consultas de verificación del final del parche. Esperado: `rls_activado=true · anon_lee=false · usuario_lee/inserta/actualiza=true · usuario_borra=false · anon_rpc=false · usuario_rpc=true`.
5. Crear **dos cuentas de prueba** (A y B) en staging y ejecutar con sesiones reales, **no** desde el SQL Editor:
   ```bash
   SUPABASE_URL=https://<staging>.supabase.co SUPABASE_ANON_KEY=<clave pública> \
   RLS_A_EMAIL=… RLS_A_PASSWORD=… RLS_B_EMAIL=… RLS_B_PASSWORD=… \
   node scripts/rls_favorites_check.mjs
   ```
   Resultado esperado: `13 correctas · 0 con problemas`. El script se niega a correr contra la URL de producción, rechaza una clave `service_role` y no imprime claves, correos ni tokens.
6. Probar la web contra staging con la cuenta A: seguir y dejar de seguir un arquetipo, recargar, y entrar en otro navegador con la misma cuenta. El modo local (sin sesión) debe seguir funcionando igual.
7. Si todo está bien, repetir 2–4 en producción (sin las cuentas de prueba) y ejecutar solo las consultas de verificación. Si algo falla en cualquier paso: `supabase/favorites_security_rollback.sql`.

## Qué queda sin verificar
* El parche **no se ha ejecutado** en ningún PostgreSQL, ni siquiera local. La sintaxis y la compatibilidad con `search_path = ''` están revisadas a mano, no probadas.
* Que el verificador pase contra un Supabase falso demuestra que detecta fugas, no que el proyecto real esté bien.
* Qué migración está realmente aplicada en el proyecto real.
