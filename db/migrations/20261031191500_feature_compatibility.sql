-- Compléments idempotents pour les tables de lots déjà présentes dans la base
-- locale avec des politiques historiques.

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
  if exists (
    select 1 from unnest(p_pattern) c
    where not exists (select 1 from public.shift_types t where t.code = c)
  ) then
    raise exception 'Cycle : code de poste inconnu';
  end if;
  insert into public.shift_assignments (employee_id, work_date, shift_code, post_id)
  select e, d::date,
    p_pattern[1 + (((d::date - p_from) + p_offset) % array_length(p_pattern, 1) + array_length(p_pattern, 1)) % array_length(p_pattern, 1)],
    p_post_id
  from unnest(p_employee_ids) e, generate_series(p_from, p_to, interval '1 day') d
  on conflict (employee_id, work_date) do update
    set shift_code = excluded.shift_code, post_id = excluded.post_id;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

revoke execute on function public.generate_rotation(uuid[], date, date, text[], integer, uuid) from public, anon;
grant execute on function public.generate_rotation(uuid[], date, date, text[], integer, uuid) to authenticated;
