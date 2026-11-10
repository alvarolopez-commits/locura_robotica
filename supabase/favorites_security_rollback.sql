-- =====================================================================================================================
-- Deshace supabase/favorites_security.sql: deja la tabla y la función como las dejaba supabase/favorites.sql (política original, sin search_path
-- fijado, EXECUTE otra vez para PUBLIC y permisos por defecto de Supabase para authenticated). No toca datos.
-- ANTES de aplicar el parche, guarda los permisos actuales para poder compararlos o restaurarlos exactos:
--   select relacl::text from pg_class where oid = 'public.user_archetype_favorites'::regclass;
--   select proacl::text, proconfig from pg_proc where oid = 'public.save_favorites(jsonb,integer)'::regprocedure;
-- Si esos valores guardados difieren de lo que restaura este archivo, manda la copia guardada.
-- =====================================================================================================================
begin;

drop policy if exists favorites_owner on public.user_archetype_favorites;
create policy favorites_owner on public.user_archetype_favorites for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

grant all on table public.user_archetype_favorites to authenticated;
revoke all on table public.user_archetype_favorites from anon;

alter function public.save_favorites(jsonb, integer) reset search_path;
grant execute on function public.save_favorites(jsonb, integer) to public;
grant execute on function public.save_favorites(jsonb, integer) to authenticated;

commit;
