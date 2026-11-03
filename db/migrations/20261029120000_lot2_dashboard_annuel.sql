-- =============================================================================
-- SOMA-RH — Lot 2 : tableau de bord mensuel et annuel
-- * hr_dashboard : le bloc « payroll » du mois expose aussi IPRES, CSS, CFCE,
--   TRIMF, retenues et provisions (signature inchangée).
-- * hr_dashboard_year : synthèse annuelle, traitements VALIDÉS uniquement,
--   totaux de l'année + détail par mois (12 mois, mois vides à zéro).
-- Les deux fonctions sont SECURITY INVOKER : la RLS des bulletins s'applique.
-- =============================================================================

create or replace function public.hr_dashboard(p_period date default current_date)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with m as (select date_trunc('month', p_period)::date as d)
  select jsonb_build_object(
    'period', (select d from m),
    'headcount_active', (select count(*) from public.employees where status = 'Active'),
    'headcount_by_contract', (select coalesce(jsonb_object_agg(employment_type, n), '{}'::jsonb)
                               from (select employment_type, count(*) n from public.employees
                                     where status = 'Active' group by 1) x),
    'headcount_by_status', (select coalesce(jsonb_object_agg(coalesce(staff_status,'—'), n), '{}'::jsonb)
                             from (select g.staff_status, count(*) n from public.employees e
                                   left join public.employee_grades g on g.id = e.grade_id
                                   where e.status = 'Active' group by 1) g),
    'leaves_in_progress', (select count(*) from public.leave_applications
                            where status = 'Approuvée' and current_date between from_date and to_date),
    'leave_requests_pending', (select count(*) from public.leave_applications where status = 'Ouverte'),
    'contracts_ending_60d', (select count(*) from public.employees
                              where status = 'Active' and contract_end between current_date and current_date + 60),
    'payroll', (select jsonb_build_object(
                  'slips', count(*),
                  'validated', count(*) filter (where status = 'Validé'),
                  'gross', coalesce(sum(gross_pay),0),
                  'net', coalesce(sum(net_pay),0),
                  'employer_charges', coalesce(sum(employer_charges),0),
                  'payroll_cost', coalesce(sum(payroll_cost),0),
                  'income_tax', coalesce(sum(income_tax),0),
                  -- ajouts lot 2
                  'trimf', coalesce(sum(trimf),0),
                  'employee_deductions', coalesce(sum(total_employee_deductions),0),
                  'net_deductions', coalesce(sum(total_net_deductions),0),
                  'ipres_rg', coalesce(sum(coalesce((calculation->'totals'->>'ipres_rg_employee')::numeric,0)
                                         + coalesce((calculation->'totals'->>'ipres_rg_employer')::numeric,0)),0),
                  'ipres_rc', coalesce(sum(coalesce((calculation->'totals'->>'ipres_rc_employee')::numeric,0)
                                         + coalesce((calculation->'totals'->>'ipres_rc_employer')::numeric,0)),0),
                  'css', coalesce(sum(coalesce((calculation->'totals'->>'css_af')::numeric,0)
                                    + coalesce((calculation->'totals'->>'css_at')::numeric,0)),0),
                  'cfce', coalesce(sum(coalesce((calculation->'totals'->>'cfce')::numeric,0)),0),
                  'leave_provision', coalesce(sum(leave_provision),0),
                  'precarity_provision', coalesce(sum(precarity_provision),0))
                from public.salary_slips, m
                where period_start = m.d and status <> 'Annulé'),
    'trend', (select coalesce(jsonb_agg(x order by x.period), '[]'::jsonb) from (
                select period_start as period, sum(gross_pay) as gross, sum(net_pay) as net,
                       sum(payroll_cost) as payroll_cost, count(*) as slips
                from public.salary_slips, m
                where status <> 'Annulé' and period_start > (m.d - interval '12 months')
                group by period_start) x),
    'net_by_contract', (select coalesce(jsonb_object_agg(employment_type, net), '{}'::jsonb) from (
                select employment_type, sum(net_pay) net from public.salary_slips, m
                where period_start = m.d and status <> 'Annulé' group by 1) y)
  );
$$;

create or replace function public.hr_dashboard_year(p_year integer)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with v as (
    -- bulletins validés d'un traitement validé de l'année
    select s.employee_id,
           s.period_start,
           s.gross_pay, s.net_pay, s.income_tax, s.trimf, s.total_employee_deductions, s.total_net_deductions,
           s.employer_charges, s.payroll_cost, s.leave_provision, s.precarity_provision,
           coalesce((s.calculation->'totals'->>'ipres_rg_employee')::numeric,0)
             + coalesce((s.calculation->'totals'->>'ipres_rg_employer')::numeric,0) as ipres_rg,
           coalesce((s.calculation->'totals'->>'ipres_rc_employee')::numeric,0)
             + coalesce((s.calculation->'totals'->>'ipres_rc_employer')::numeric,0) as ipres_rc,
           coalesce((s.calculation->'totals'->>'css_af')::numeric,0)
             + coalesce((s.calculation->'totals'->>'css_at')::numeric,0) as css,
           coalesce((s.calculation->'totals'->>'cfce')::numeric,0) as cfce
    from public.salary_slips s
    join public.payroll_entries pe on pe.id = s.payroll_entry_id and pe.status = 'Validée'
    where s.status = 'Validé'
      and s.period_start >= make_date(p_year, 1, 1)
      and s.period_start <  make_date(p_year + 1, 1, 1)
  ),
  by_month as (
    select date_trunc('month', period_start)::date as period,
           count(*) as slips, count(distinct employee_id) as employees,
           sum(gross_pay) as gross, sum(net_pay) as net, sum(income_tax) as income_tax, sum(trimf) as trimf,
           sum(total_employee_deductions) as employee_deductions, sum(total_net_deductions) as net_deductions,
           sum(ipres_rg) as ipres_rg, sum(ipres_rc) as ipres_rc, sum(css) as css, sum(cfce) as cfce,
           sum(employer_charges) as employer_charges, sum(leave_provision) as leave_provision,
           sum(precarity_provision) as precarity_provision, sum(payroll_cost) as payroll_cost
    from v group by 1
  )
  select jsonb_build_object(
    'year', p_year,
    'totals', (select jsonb_build_object(
        'slips', count(*),
        'employees', count(distinct employee_id),
        'months', count(distinct period_start),
        'gross', coalesce(sum(gross_pay),0),
        'net', coalesce(sum(net_pay),0),
        'income_tax', coalesce(sum(income_tax),0),
        'trimf', coalesce(sum(trimf),0),
        'employee_deductions', coalesce(sum(total_employee_deductions),0),
        'net_deductions', coalesce(sum(total_net_deductions),0),
        'ipres_rg', coalesce(sum(ipres_rg),0),
        'ipres_rc', coalesce(sum(ipres_rc),0),
        'css', coalesce(sum(css),0),
        'cfce', coalesce(sum(cfce),0),
        'employer_charges', coalesce(sum(employer_charges),0),
        'leave_provision', coalesce(sum(leave_provision),0),
        'precarity_provision', coalesce(sum(precarity_provision),0),
        'payroll_cost', coalesce(sum(payroll_cost),0)) from v),
    'months', (select jsonb_agg(jsonb_build_object(
        'period', gs.d,
        'slips', coalesce(b.slips,0), 'employees', coalesce(b.employees,0),
        'gross', coalesce(b.gross,0), 'net', coalesce(b.net,0), 'income_tax', coalesce(b.income_tax,0),
        'trimf', coalesce(b.trimf,0), 'employee_deductions', coalesce(b.employee_deductions,0),
        'net_deductions', coalesce(b.net_deductions,0),
        'ipres_rg', coalesce(b.ipres_rg,0), 'ipres_rc', coalesce(b.ipres_rc,0),
        'css', coalesce(b.css,0), 'cfce', coalesce(b.cfce,0),
        'employer_charges', coalesce(b.employer_charges,0),
        'leave_provision', coalesce(b.leave_provision,0), 'precarity_provision', coalesce(b.precarity_provision,0),
        'payroll_cost', coalesce(b.payroll_cost,0)) order by gs.d)
      from (select make_date(p_year, m, 1) as d from generate_series(1, 12) m) gs
      left join by_month b on b.period = gs.d),
    -- bulletins de l'année hors périmètre (calculés mais non validés) : pour l'expliquer à l'écran
    'pending_slips', (select count(*) from public.salary_slips s
                      where s.status = 'Brouillon'
                        and s.period_start >= make_date(p_year, 1, 1)
                        and s.period_start <  make_date(p_year + 1, 1, 1))
  );
$$;

revoke execute on function public.hr_dashboard_year(integer) from public, anon;
grant execute on function public.hr_dashboard_year(integer) to authenticated;
