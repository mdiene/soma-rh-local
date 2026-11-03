-- =============================================================================
-- Lot 6 : pilotage RH — indicateurs d'effectifs, mouvements, absentéisme et
-- masse salariale, en une seule fonction en lecture (rôles rh / paie).
-- =============================================================================
create or replace function public.hr_analytics(p_months integer default 12)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_to   date := (date_trunc('month', current_date) + interval '1 month - 1 day')::date;
  v_from date := (date_trunc('month', current_date) - make_interval(months => greatest(least(p_months, 36), 1) - 1))::date;
  v_out  jsonb;
begin
  if not public.has_role(array['rh', 'paie']) then
    raise exception 'Droits insuffisants';
  end if;

  with act as (
    select e.*, g.code as grade_code, g.staff_status as staff_status, d.name as designation_name,
           extract(year from age(current_date, e.date_of_birth))::int as age_y,
           extract(year from age(current_date, e.date_of_joining))::int as seniority_y
      from public.employees e
      left join public.employee_grades g on g.id = e.grade_id
      left join public.designations d on d.id = e.designation_id
     where e.status = 'Active'
  ),
  months as (
    select generate_series(date_trunc('month', v_from), date_trunc('month', v_to), interval '1 month')::date as m
  ),
  mov as (
    select to_char(m.m, 'YYYY-MM') as period,
           (select count(*) from public.employees e where date_trunc('month', e.date_of_joining) = m.m) as entries,
           (select count(*) from public.employees e where e.relieving_date is not null and date_trunc('month', e.relieving_date) = m.m) as exits
      from months m order by m.m
  ),
  att as (
    select to_char(m.m, 'YYYY-MM') as period,
           count(a.id) as recorded,
           count(a.id) filter (where a.status = 'Absent') as absent_days,
           count(a.id) filter (where a.status = 'Maladie') as sick_days,
           count(a.id) filter (where a.status = 'Congé') as leave_days,
           coalesce(sum(a.overtime_15 + a.overtime_40 + a.overtime_60 + a.overtime_100), 0) as overtime_hours
      from months m
      left join public.attendance a on date_trunc('month', a.attendance_date) = m.m
     group by m.m order by m.m
  ),
  pay as (
    select s.staff_status, s.employment_type,
           count(*) as slips, sum(s.gross_pay) as gross, sum(s.net_pay) as net, sum(s.payroll_cost) as cost
      from public.salary_slips s
     where s.status = 'Validé'
       and s.period_start = (select max(period_start) from public.salary_slips where status = 'Validé')
     group by s.staff_status, s.employment_type
  )
  select jsonb_build_object(
    'generated_at', now(),
    'from', v_from, 'to', v_to,
    'headcount', (select count(*) from act),
    'by_contract', coalesce((select jsonb_object_agg(k, n) from (select employment_type k, count(*) n from act group by 1) x), '{}'::jsonb),
    'by_gender', coalesce((select jsonb_object_agg(k, n) from (select coalesce(gender, '?') k, count(*) n from act group by 1) x), '{}'::jsonb),
    'by_staff_status', coalesce((select jsonb_object_agg(k, n) from (select coalesce(staff_status, '?') k, count(*) n from act group by 1) x), '{}'::jsonb),
    'by_designation', coalesce((select jsonb_agg(jsonb_build_object('label', k, 'n', n) order by n desc, k) from (select coalesce(designation_name, '—') k, count(*) n from act group by 1) x), '[]'::jsonb),
    'ages', jsonb_build_object(
      'lt30', (select count(*) from act where age_y < 30), 'a30_39', (select count(*) from act where age_y between 30 and 39),
      'a40_49', (select count(*) from act where age_y between 40 and 49), 'ge50', (select count(*) from act where age_y >= 50),
      'unknown', (select count(*) from act where age_y is null),
      'average', (select round(avg(age_y), 1) from act)),
    'seniority', jsonb_build_object(
      'lt1', (select count(*) from act where seniority_y < 1), 'y1_2', (select count(*) from act where seniority_y between 1 and 2),
      'y3_4', (select count(*) from act where seniority_y between 3 and 4), 'y5_9', (select count(*) from act where seniority_y between 5 and 9),
      'ge10', (select count(*) from act where seniority_y >= 10),
      'average', (select round(avg(seniority_y), 1) from act)),
    'movements', coalesce((select jsonb_agg(to_jsonb(mov)) from mov), '[]'::jsonb),
    'turnover_pct', (select case when (select count(*) from act) = 0 then 0
                            else round(100.0 * (select coalesce(sum(exits), 0) from mov) / (select count(*) from act), 1) end),
    'attendance', coalesce((select jsonb_agg(to_jsonb(att)) from att), '[]'::jsonb),
    'payroll_last_month', jsonb_build_object(
      'period', (select max(period_start) from public.salary_slips where status = 'Validé'),
      'rows', coalesce((select jsonb_agg(to_jsonb(pay)) from pay), '[]'::jsonb)),
    'contracts_ending_90d', (select count(*) from act where contract_end between current_date and current_date + 90)
  ) into v_out;
  return v_out;
end;
$$;
revoke execute on function public.hr_analytics(integer) from public, anon;
grant execute on function public.hr_analytics(integer) to authenticated;
