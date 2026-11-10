-- =====================================================================================================================
-- Locura robótica · favoritos de Competición: endurecimiento de permisos (parche sobre supabase/favorites.sql)
-- NO está aplicado en ningún proyecto. Aplicar PRIMERO en staging, comprobar con scripts/rls_favorites_check.mjs y solo después considerar producción.
-- Revisado contra el esquema real de supabase/favorites.sql: tabla user_archetype_favorites (user_id uuid PK) y función
-- public.save_favorites(jsonb, integer) (SECURITY INVOKER, cuerpo con nombres calificados: compatible con search_path vacío).
--
-- Qué corrige:
--   1. La función solo concedía EXECUTE a authenticated, pero no revocaba el EXECUTE que PostgreSQL da por defecto a PUBLIC (y Supabase a anon).
--      Quien no tiene sesión no puede escribir (la función falla con not_authenticated), pero no debe poder ni llamarla.
--   2. La tabla solo revocaba a anon; los permisos de authenticated dependían de los valores por defecto del proyecto. Ahora son explícitos y mínimos:
--      SELECT, INSERT y UPDATE (la función invoker los necesita; DELETE no: la app nunca borra la fila, y al borrar un usuario la cascada la elimina).
--   3. La política usa (select auth.uid()) (se evalúa una vez por consulta) y la función fija search_path = '' (sin ambigüedad de esquemas).
-- Qué NO cambia: ni una fila de datos, ni la política de propiedad (cada persona solo ve y toca la suya), ni el contrato con la app.
-- Riesgo aceptado: con UPDATE concedido, una persona puede modificar SU PROPIA fila sin pasar por la comprobación de revisión de la RPC.
--   Solo afecta a sus propios favoritos (el CHECK de la tabla limita el tamaño). Para obligar a escribir solo por RPC haría falta una función
--   SECURITY DEFINER; no se hace porque añade superficie de riesgo sin proteger datos ajenos.
-- Es idempotente. Para deshacerla: supabase/favorites_security_rollback.sql
-- =====================================================================================================================
begin;

do $preflight$
begin
  if to_regclass('public.user_archetype_favorites') is null then
    raise exception 'Falta public.user_archetype_favorites: aplica antes supabase/favorites.sql';
  end if;
  if to_regprocedure('public.save_favorites(jsonb,integer)') is null then
    raise exception 'Falta public.save_favorites(jsonb,integer): aplica antes supabase/favorites.sql';
  end if;
end $preflight$;

alter table public.user_archetype_favorites enable row level security;

drop policy if exists favorites_owner on public.user_archetype_favorites;
create policy favorites_owner on public.user_archetype_favorites for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

revoke all on table public.user_archetype_favorites from public, anon, authenticated;
grant select, insert, update on table public.user_archetype_favorites to authenticated;

alter function public.save_favorites(jsonb, integer) security invoker;
alter function public.save_favorites(jsonb, integer) set search_path = '';
revoke execute on function public.save_favorites(jsonb, integer) from public, anon, authenticated;
grant execute on function public.save_favorites(jsonb, integer) to authenticated;

commit;

-- Comprobación de permisos (por separado, con la cuenta de administrador). NO sustituye a la prueba con sesiones reales de usuario:
--   select c.relrowsecurity as rls_activado from pg_class c where c.oid = 'public.user_archetype_favorites'::regclass;
--   select has_table_privilege('anon','public.user_archetype_favorites','select')            as anon_lee,
--          has_table_privilege('authenticated','public.user_archetype_favorites','select')   as usuario_lee,
--          has_table_privilege('authenticated','public.user_archetype_favorites','insert')   as usuario_inserta,
--          has_table_privilege('authenticated','public.user_archetype_favorites','update')   as usuario_actualiza,
--          has_table_privilege('authenticated','public.user_archetype_favorites','delete')   as usuario_borra,
--          has_function_privilege('anon','public.save_favorites(jsonb,integer)','execute')   as anon_rpc,
--          has_function_privilege('authenticated','public.save_favorites(jsonb,integer)','execute') as usuario_rpc;
-- Esperado: rls_activado=true · anon_lee=false · usuario_lee/inserta/actualiza=true · usuario_borra=false · anon_rpc=false · usuario_rpc=true
