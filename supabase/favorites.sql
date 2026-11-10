-- =====================================================================================================================
-- Locura robótica · arquetipos favoritos de Competición, sincronizados con la cuenta
-- Migración ADITIVA: solo crea una tabla, sus políticas y una función nuevas. No toca decks, deck_cards, user_preferences ni
-- user_collection. Se puede ejecutar más de una vez (todo es "if not exists" / "or replace" / "drop policy if exists").
-- La app funciona igual sin ejecutarla: los favoritos se quedan solo en el dispositivo hasta que exista la tabla.
--
-- Cómo aplicarla (una vez, con tu cuenta de administrador del proyecto):
--   1. Supabase → tu proyecto → SQL Editor → New query.
--   2. Pega TODO este archivo y pulsa Run. Debe terminar con "Success. No rows returned".
--   3. Comprobación: Table Editor → user_archetype_favorites debe existir, con RLS activado ("RLS enabled").
--   4. Abre la app con sesión iniciada, sigue un arquetipo en Competición y en el SQL Editor ejecuta
--        select user_id, jsonb_array_length(favorites) as n, revision from public.user_archetype_favorites;
--      Debe salir tu fila con n = 1.
-- Para deshacerla: drop function public.save_favorites(jsonb, integer); drop table public.user_archetype_favorites;
-- =====================================================================================================================

-- cada persona tiene UNA fila: favorites = [ { "id": "GD06|mobile fighter", "season": "GD06", "name": "Mobile Fighter", "addedAt": 1730000000000 }, … ]
create table if not exists public.user_archetype_favorites (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  favorites   jsonb not null default '[]'::jsonb,
  revision    integer not null default 1,
  updated_at  timestamptz not null default now(),
  constraint favorites_is_small_array check (jsonb_typeof(favorites) = 'array' and jsonb_array_length(favorites) <= 200)
);

alter table public.user_archetype_favorites enable row level security;

-- cada persona solo ve y toca su propia fila; sin sesión (anon) no hay acceso
drop policy if exists favorites_owner on public.user_archetype_favorites;
create policy favorites_owner on public.user_archetype_favorites for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

revoke all on public.user_archetype_favorites from anon;

-- Guarda la lista entera. Si p_expected_revision no coincide con la guardada lanza revision_conflict (PT409) y no escribe nada.
-- Sin fila todavía, la revisión esperada es 0 (o null). Se ejecuta con los permisos de quien llama, así que la política de arriba se aplica.
create or replace function public.save_favorites(p_favorites jsonb, p_expected_revision integer default null)
returns table (new_revision integer, saved_at timestamptz)
language plpgsql as $$
declare v_rev integer;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = 'PT401'; end if;
  select f.revision into v_rev from public.user_archetype_favorites f where f.user_id = auth.uid() for update;
  if v_rev is null then
    if p_expected_revision is not null and p_expected_revision <> 0 then raise exception 'revision_conflict' using errcode = 'PT409'; end if;
    insert into public.user_archetype_favorites(user_id, favorites) values (auth.uid(), coalesce(p_favorites, '[]'::jsonb));
  else
    if p_expected_revision is not null and p_expected_revision <> v_rev then raise exception 'revision_conflict' using errcode = 'PT409'; end if;
    update public.user_archetype_favorites set favorites = coalesce(p_favorites, '[]'::jsonb), revision = v_rev + 1, updated_at = now() where user_id = auth.uid();
  end if;
  return query select f.revision, f.updated_at from public.user_archetype_favorites f where f.user_id = auth.uid();
end $$;

grant execute on function public.save_favorites(jsonb, integer) to authenticated;
