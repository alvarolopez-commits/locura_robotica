-- Solo la parte de Mi colección (la tabla user_collection y save_collection). Pegar en Supabase → SQL Editor → Run. Se puede repetir sin romper nada.
-- ---------- Mi colección (una fila por persona; ver collection_sync.js) ----------
-- cards = { "ST01-001": { "q": copias, "t": fecha de alta en ms }, ... }
create table if not exists public.user_collection (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  cards       jsonb not null default '{}'::jsonb,
  revision    integer not null default 1,
  updated_at  timestamptz not null default now()
);
alter table public.user_collection enable row level security;
drop policy if exists collection_owner on public.user_collection;
create policy collection_owner on public.user_collection for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Guarda la colección entera. Si p_expected_revision no coincide con la guardada lanza revision_conflict (PT409) y no escribe nada.
-- Sin fila todavía, la revisión esperada es 0 (o null).
create or replace function public.save_collection(p_cards jsonb, p_expected_revision integer default null)
returns table (new_revision integer, saved_at timestamptz)
language plpgsql as $$
declare v_rev integer;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = 'PT401'; end if;
  select c.revision into v_rev from public.user_collection c where c.user_id = auth.uid() for update;
  if v_rev is null then
    if p_expected_revision is not null and p_expected_revision <> 0 then raise exception 'revision_conflict' using errcode = 'PT409'; end if;
    insert into public.user_collection(user_id, cards) values (auth.uid(), coalesce(p_cards, '{}'::jsonb));
  else
    if p_expected_revision is not null and p_expected_revision <> v_rev then raise exception 'revision_conflict' using errcode = 'PT409'; end if;
    update public.user_collection set cards = coalesce(p_cards, '{}'::jsonb), revision = v_rev + 1, updated_at = now() where user_id = auth.uid();
  end if;
  return query select c.revision, c.updated_at from public.user_collection c where c.user_id = auth.uid();
end $$;

grant execute on function public.save_collection(jsonb, integer) to authenticated;
