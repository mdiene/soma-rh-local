-- =============================================================================
-- Lot 5 (début) : postes et rotations (gardiens 24 h/24, décision D11)
-- * work_posts : postes de garde / de travail ;
-- * shift_types : types de poste (jour, nuit, repos…), horaires modifiables ;
-- * shift_assignments : planning journalier par salarié ;
-- * generate_rotation : applique un cycle (ex. J,J,N,N,R,R) à des salariés.
-- Lecture : RH / paie, et chaque salarié pour son propre planning. Écriture : RH.
-- =============================================================================
create table if not exists public.work_posts (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (length(trim(name)) > 0),
  site       text,
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index if not exists work_posts_name_uq on public.work_posts (lower(trim(name)));

create table if not exists public.shift_types (
  code       text primary key check (code ~ '^[A-Z0-9]{1,4}$'),
  label      text not null,
  start_time time,
  end_time   time,
  hours      numeric not null default 0 check (hours >= 0 and hours <= 24),
  is_night   boolean not null default false,
  is_rest    boolean not null default false,
  is_active  boolean not null default true,
  sort_order integer not null default 100
);

create table if not exists public.shift_assignments (
  id          uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  work_date   date not null,
  shift_code  text not null references public.shift_types(code),
  post_id     uuid references public.work_posts(id) on delete set null,
  notes       text,
  created_by  uuid default auth.uid() references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  unique (employee_id, work_date)
);
create index if not exists shift_assignments_date_idx on public.shift_assignments (work_date);
create index if not exists shift_assignments_code_idx on public.shift_assignments (shift_code);
create index if not exists shift_assignments_post_idx on public.shift_assignments (post_id);

insert into public.shift_types (code, label, start_time, end_time, hours, is_night, is_rest, sort_order) values
  ('J',  'Jour 12 h',      '06:00', '18:00', 12, false, false, 10),
  ('N',  'Nuit 12 h',      '18:00', '06:00', 12, true,  false, 20),
  ('M',  'Matin 8 h',      '06:00', '14:00', 8,  false, false, 30),
  ('A',  'Après-midi 8 h', '14:00', '22:00', 8,  false, false, 40),
  ('NT', 'Nuit 8 h',       '22:00', '06:00', 8,  true,  false, 50),
  ('R',  'Repos',          null,    null,    0,  false, true,  90)
on conflict (code) do nothing;

alter table public.work_posts enable row level security;
alter table public.shift_types enable row level security;
alter table public.shift_assignments enable row level security;

create policy work_posts_read on public.work_posts for select to authenticated using (true);
create policy work_posts_ins on public.work_posts for insert to authenticated with check ((select public.has_role(array['rh'])));
create policy work_posts_upd on public.work_posts for update to authenticated using ((select public.has_role(array['rh']))) with check ((select public.has_role(array['rh'])));
create policy work_posts_del on public.work_posts for delete to authenticated using ((select public.has_role(array['rh'])));

create policy shift_types_read on public.shift_types for select to authenticated using (true);
create policy shift_types_ins on public.shift_types for insert to authenticated with check ((select public.has_role(array['rh'])));
create policy shift_types_upd on public.shift_types for update to authenticated using ((select public.has_role(array['rh']))) with check ((select public.has_role(array['rh'])));

create policy shift_assignments_read on public.shift_assignments for select to authenticated
  using ((select public.has_role(array['rh', 'paie'])) or employee_id = (select public.my_employee_id()));
create policy shift_assignments_ins on public.shift_assignments for insert to authenticated with check ((select public.has_role(array['rh'])));
create policy shift_assignments_upd on public.shift_assignments for update to authenticated using ((select public.has_role(array['rh']))) with check ((select public.has_role(array['rh'])));
create policy shift_assignments_del on public.shift_assignments for delete to authenticated using ((select public.has_role(array['rh'])));

-- Applique un cycle à des salariés : le jour p_from est la position p_offset du cycle (0 = premier).
create or replace function public.generate_rotation(
  p_employee_ids uuid[], p_from date, p_to date, p_pattern text[],
  p_offset integer default 0, p_post_id uuid default null)
returns integer
language plpgsql
set search_path = ''
as $$
declare v_n integer;
begin
  if not public.has_role(array['rh']) then
    raise exception 'Droits insuffisants : rôle « rh » requis';
  end if;
  if p_to < p_from or p_to - p_from > 366 then
    raise exception 'Période invalide (366 jours maximum)';
  end if;
  if coalesce(array_length(p_pattern, 1), 0) = 0 then
    raise exception 'Cycle vide';
  end if;
  if exists (select 1 from unnest(p_pattern) c where not exists (select 1 from public.shift_types t where t.code = c)) then
    raise exception 'Cycle : code de poste inconnu';
  end if;
  insert into public.shift_assignments (employee_id, work_date, shift_code, post_id)
  select e, d::date,
         p_pattern[1 + (((d::date - p_from) + p_offset) % array_length(p_pattern, 1) + array_length(p_pattern, 1)) % array_length(p_pattern, 1)],
         p_post_id
    from unnest(p_employee_ids) e, generate_series(p_from, p_to, interval '1 day') d
  on conflict (employee_id, work_date) do update set shift_code = excluded.shift_code, post_id = excluded.post_id;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;
revoke execute on function public.generate_rotation(uuid[], date, date, text[], integer, uuid) from public, anon;
grant execute on function public.generate_rotation(uuid[], date, date, text[], integer, uuid) to authenticated;

-- pas de journal ligne à ligne : une rotation génère des centaines de lignes (le planning reste daté et attribué via created_by)
create index if not exists shift_assignments_created_by_idx on public.shift_assignments (created_by);
