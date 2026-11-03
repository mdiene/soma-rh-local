-- =============================================================================
-- SOMA-RH — Lot 3 : saisie des présences en grille journalière
-- * attendance.sick_hours : heures de maladie distinctes des heures d'absence
--   (une même journée peut porter les deux) ; reprise des lignes « Maladie ».
-- * contrôle : heures travaillées + absence + maladie <= 24 h par jour.
-- * traçabilité : updated_at / updated_by renseignés à chaque modification.
-- * sync_attendance_to_payroll_inputs : absences (hors congés payés), maladie
--   et heures supplémentaires par taux, cumulées sur le mois.
-- La clé unique (employee_id, attendance_date) existante interdit les doublons ;
-- l'enregistrement groupé de la grille est un upsert sur cette clé.
-- =============================================================================

alter table public.attendance
  add column if not exists sick_hours numeric not null default 0 check (sick_hours >= 0),
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists updated_by uuid default auth.uid() references auth.users(id) on delete set null;

create index if not exists attendance_updated_by_idx on public.attendance(updated_by);

-- reprise : les heures saisies sur une ligne « Maladie » deviennent des heures de maladie
update public.attendance
   set sick_hours = absence_hours, absence_hours = 0
 where status = 'Maladie' and sick_hours = 0 and absence_hours > 0;

alter table public.attendance drop constraint if exists attendance_day_hours_check;
alter table public.attendance add constraint attendance_day_hours_check
  check (coalesce(working_hours, 0) + absence_hours + sick_hours <= 24);

comment on column public.attendance.sick_hours is 'Heures d''arrêt maladie de la journée (indemnité maladie de la paie).';

create or replace function public.attendance_touch()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  new.updated_by := coalesce((select auth.uid()), new.updated_by);
  return new;
end;
$$;

drop trigger if exists attendance_touch on public.attendance;
create trigger attendance_touch before insert or update on public.attendance
  for each row execute function public.attendance_touch();

create or replace function public.sync_attendance_to_payroll_inputs(p_period date)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_start date := date_trunc('month', p_period)::date;
  v_end   date := (date_trunc('month', p_period) + interval '1 month - 1 day')::date;
  v_count int;
begin
  if not public.has_role(array['paie']) then
    raise exception 'Droits insuffisants : rôle « paie » requis';
  end if;
  insert into public.payroll_inputs as pi
    (employee_id, period, absence_hours, sick_leave_hours, overtime_15, overtime_40, overtime_60, overtime_100)
  select a.employee_id, v_start,
         -- les jours de congé payé ne sont pas des absences retenues sur salaire
         sum(case when a.status = 'Congé' then 0 else a.absence_hours end),
         sum(a.sick_hours),
         sum(a.overtime_15), sum(a.overtime_40), sum(a.overtime_60), sum(a.overtime_100)
  from public.attendance a
  where a.attendance_date between v_start and v_end
  group by a.employee_id
  on conflict (employee_id, period) do update
    set absence_hours    = excluded.absence_hours,
        sick_leave_hours = excluded.sick_leave_hours,
        overtime_15      = excluded.overtime_15,
        overtime_40      = excluded.overtime_40,
        overtime_60      = excluded.overtime_60,
        overtime_100     = excluded.overtime_100;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function public.sync_attendance_to_payroll_inputs(date) from public, anon;
grant execute on function public.sync_attendance_to_payroll_inputs(date) to authenticated;
