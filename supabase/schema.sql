-- Locura robótica · mazos persistentes (User Deck Persistence V1)
-- Pegar entero en Supabase → SQL Editor → Run. Se puede volver a ejecutar sin romper nada.
-- Usa las cuentas de Supabase Auth (auth.users). Cada fila queda protegida por Row Level Security: user_id = auth.uid().

create extension if not exists pgcrypto;

-- ---------- tablas ----------
create table if not exists public.decks (
  id                        uuid primary key default gen_random_uuid(),
  user_id                   uuid not null references auth.users(id) on delete cascade,
  name                      text not null default 'Mazo sin nombre',
  description               text,
  status                    text not null default 'draft' check (status in ('draft','complete')),
  visibility                text not null default 'private' check (visibility in ('private','unlisted','public')),
  is_favorite               boolean not null default false,
  is_archived               boolean not null default false,
  created_under_ruleset_id  text,
  preferred_ruleset_id      text,
  revision                  integer not null default 1,
  migrated_from_temp_id     text,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  archived_at               timestamptz,
  deleted_at                timestamptz
);
create index if not exists idx_decks_user         on public.decks(user_id);
create index if not exists idx_decks_user_updated on public.decks(user_id, updated_at desc);
-- migración de borradores idempotente: el mismo borrador local no crea dos mazos
create unique index if not exists uq_decks_user_temp on public.decks(user_id, migrated_from_temp_id) where migrated_from_temp_id is not null;

create table if not exists public.deck_cards (
  deck_id      uuid not null references public.decks(id) on delete cascade,
  card_number  text not null,
  quantity     integer not null check (quantity > 0 and quantity <= 60),
  board        text not null default 'main' check (board in ('main','side')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  primary key (deck_id, card_number, board)
);
create index if not exists idx_deck_cards_deck on public.deck_cards(deck_id);

create table if not exists public.user_preferences (
  user_id         uuid primary key references auth.users(id) on delete cascade,
  active_deck_id  uuid references public.decks(id) on delete set null,
  updated_at      timestamptz not null default now()
);

-- ---------- cada cambio de un mazo sube la revisión y la fecha ----------
create or replace function public.decks_touch() returns trigger language plpgsql as $$
begin
  new.revision   := old.revision + 1;
  new.updated_at := now();
  if new.is_archived and not old.is_archived then new.archived_at := now(); end if;
  if not new.is_archived then new.archived_at := null; end if;
  return new;
end $$;
drop trigger if exists trg_decks_touch on public.decks;
create trigger trg_decks_touch before update on public.decks for each row execute function public.decks_touch();

-- estado derivado: 50 cartas en main = completo (el tamaño legal real lo decide el ruleset en la app)
create or replace function public.deck_main_count(p_deck uuid) returns integer language sql stable as $$
  select coalesce(sum(quantity), 0)::integer from public.deck_cards where deck_id = p_deck and board = 'main'
$$;

-- ---------- seguridad: cada usuario solo ve y toca lo suyo ----------
alter table public.decks            enable row level security;
alter table public.deck_cards       enable row level security;
alter table public.user_preferences enable row level security;

drop policy if exists decks_owner on public.decks;
create policy decks_owner on public.decks for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists deck_cards_owner on public.deck_cards;
create policy deck_cards_owner on public.deck_cards for all to authenticated
  using (exists (select 1 from public.decks d where d.id = deck_id and d.user_id = auth.uid()))
  with check (exists (select 1 from public.decks d where d.id = deck_id and d.user_id = auth.uid()));

drop policy if exists prefs_owner on public.user_preferences;
create policy prefs_owner on public.user_preferences for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------- operaciones (security invoker: la RLS se aplica igual) ----------

-- Crear mazo con sus cartas. Idempotente por p_temp_id: si ya se migró ese borrador, devuelve el mismo mazo.
create or replace function public.create_deck(p_name text, p_description text, p_cards jsonb, p_temp_id text default null)
returns table (deck_id uuid, revision integer, updated_at timestamptz, main_count integer)
language plpgsql as $$
declare v_id uuid; v_count integer;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = 'PT401'; end if;
  if p_temp_id is not null then
    select d.id into v_id from public.decks d where d.user_id = auth.uid() and d.migrated_from_temp_id = p_temp_id;
    if v_id is not null then
      return query select d.id, d.revision, d.updated_at, public.deck_main_count(d.id) from public.decks d where d.id = v_id;
      return;
    end if;
  end if;
  insert into public.decks(user_id, name, description, migrated_from_temp_id)
  values (auth.uid(), coalesce(nullif(trim(p_name), ''), 'Mazo sin nombre'), nullif(trim(coalesce(p_description, '')), ''), p_temp_id)
  returning id into v_id;
  insert into public.deck_cards(deck_id, card_number, quantity, board)
  select v_id, c->>'cardNumber', (c->>'quantity')::integer, coalesce(c->>'board', 'main')
  from jsonb_array_elements(coalesce(p_cards, '[]'::jsonb)) c
  where (c->>'quantity')::integer > 0
  on conflict (deck_id, card_number, board) do update set quantity = excluded.quantity, updated_at = now();
  v_count := public.deck_main_count(v_id);
  update public.decks set status = case when v_count >= 50 then 'complete' else 'draft' end where id = v_id;
  return query select d.id, d.revision, d.updated_at, v_count from public.decks d where d.id = v_id;
end $$;

-- Guardado agregado (autosave con debounce): sustituye todas las cartas del mazo de una vez.
-- Si p_expected_revision no coincide lanza revision_conflict (SQLSTATE PT409) y no escribe nada.
create or replace function public.replace_deck_cards(p_deck uuid, p_cards jsonb, p_expected_revision integer default null)
returns table (revision integer, updated_at timestamptz, main_count integer)
language plpgsql as $$
declare v_rev integer; v_count integer;
begin
  select d.revision into v_rev from public.decks d where d.id = p_deck and d.user_id = auth.uid() and d.deleted_at is null for update;
  if v_rev is null then raise exception 'deck_not_found' using errcode = 'PT404'; end if;
  if p_expected_revision is not null and p_expected_revision <> v_rev then raise exception 'revision_conflict' using errcode = 'PT409'; end if;
  delete from public.deck_cards where deck_id = p_deck;
  insert into public.deck_cards(deck_id, card_number, quantity, board)
  select p_deck, c->>'cardNumber', (c->>'quantity')::integer, coalesce(c->>'board', 'main')
  from jsonb_array_elements(coalesce(p_cards, '[]'::jsonb)) c
  where (c->>'quantity')::integer > 0
  on conflict (deck_id, card_number, board) do update set quantity = excluded.quantity, updated_at = now();
  v_count := public.deck_main_count(p_deck);
  update public.decks set status = case when v_count >= 50 then 'complete' else 'draft' end where id = p_deck;
  return query select d.revision, d.updated_at, v_count from public.decks d where d.id = p_deck;
end $$;

-- Fijar la cantidad final de una carta (reintentable sin duplicar). Cantidad 0 borra la fila.
create or replace function public.set_card_quantity(p_deck uuid, p_card text, p_qty integer, p_board text default 'main', p_expected_revision integer default null)
returns table (revision integer, updated_at timestamptz, main_count integer)
language plpgsql as $$
declare v_rev integer; v_count integer;
begin
  select d.revision into v_rev from public.decks d where d.id = p_deck and d.user_id = auth.uid() and d.deleted_at is null for update;
  if v_rev is null then raise exception 'deck_not_found' using errcode = 'PT404'; end if;
  if p_expected_revision is not null and p_expected_revision <> v_rev then raise exception 'revision_conflict' using errcode = 'PT409'; end if;
  if p_qty is null or p_qty < 0 then raise exception 'invalid_quantity' using errcode = 'PT400'; end if;
  if p_qty = 0 then
    delete from public.deck_cards where deck_id = p_deck and card_number = p_card and board = p_board;
  else
    insert into public.deck_cards(deck_id, card_number, quantity, board) values (p_deck, p_card, p_qty, p_board)
    on conflict (deck_id, card_number, board) do update set quantity = excluded.quantity, updated_at = now();
  end if;
  v_count := public.deck_main_count(p_deck);
  update public.decks set status = case when v_count >= 50 then 'complete' else 'draft' end where id = p_deck;
  return query select d.revision, d.updated_at, v_count from public.decks d where d.id = p_deck;
end $$;

-- Duplicar: mazo nuevo, mismo dueño, mismas cartas, sin favorito ni archivado; el original no se toca.
create or replace function public.duplicate_deck(p_deck uuid)
returns table (deck_id uuid, name text, revision integer, updated_at timestamptz, main_count integer)
language plpgsql as $$
declare v_new uuid; v_src public.decks%rowtype;
begin
  select * into v_src from public.decks d where d.id = p_deck and d.user_id = auth.uid() and d.deleted_at is null;
  if not found then raise exception 'deck_not_found' using errcode = 'PT404'; end if;
  insert into public.decks(user_id, name, description, preferred_ruleset_id, created_under_ruleset_id)
  values (auth.uid(), v_src.name || ' (copia)', v_src.description, v_src.preferred_ruleset_id, v_src.created_under_ruleset_id) returning id into v_new;
  insert into public.deck_cards(deck_id, card_number, quantity, board)
  select v_new, c.card_number, c.quantity, c.board from public.deck_cards c where c.deck_id = p_deck;
  update public.decks set status = case when public.deck_main_count(v_new) >= 50 then 'complete' else 'draft' end where id = v_new;
  return query select d.id, d.name, d.revision, d.updated_at, public.deck_main_count(d.id) from public.decks d where d.id = v_new;
end $$;

grant execute on function public.create_deck(text, text, jsonb, text)                    to authenticated;
grant execute on function public.replace_deck_cards(uuid, jsonb, integer)                to authenticated;
grant execute on function public.set_card_quantity(uuid, text, integer, text, integer)   to authenticated;
grant execute on function public.duplicate_deck(uuid)                                    to authenticated;
revoke all on all tables in schema public from anon;
