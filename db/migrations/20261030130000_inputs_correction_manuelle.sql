-- Variables du mois : toutes les cases restent corrigeables à la main.
-- Une ligne corrigée (écart avec les présences) est marquée `attendance_override` :
-- la reprise automatique des présences au calcul ne l'écrase plus.
alter table public.payroll_inputs add column if not exists attendance_override boolean not null default false;

create or replace function public.sync_attendance_to_payroll_inputs(p_period date)
returns integer
language plpgsql
set search_path = ''
as $function$
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
        overtime_100     = excluded.overtime_100
    where not pi.attendance_override;
  get diagnostics v_count = row_count;
  return v_count;
end;
$function$;
