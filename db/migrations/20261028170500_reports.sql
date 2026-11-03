-- =============================================================================
-- SOMA-RH — 06 : États et tableaux de bord
-- Équivalents des feuilles : livre de paie, ETAT RESUME COTISATIONS,
-- Etat cotisations, Etat Charges Patronales, compta, TDB, cumuls du BULLETIN.
-- Toutes les vues sont en security_invoker : la RLS des tables s'applique.
-- =============================================================================

-- ------------------------------------------------------------- livre de paie
create or replace view public.v_payroll_register
with (security_invoker = true) as
select
  s.id                         as salary_slip_id,
  s.payroll_entry_id,
  s.period_start,
  s.status,
  s.employee_id,
  s.employee_number,
  s.employee_name,
  s.designation,
  s.grade_code,
  s.staff_status,
  s.employment_type,
  s.contract_situation,
  (s.calculation->'inputs'->>'base_salary')::numeric          as base_salary,
  (s.calculation->'inputs'->>'sursalaire')::numeric           as sursalaire,
  (s.calculation->'totals'->>'seniority_bonus')::numeric      as seniority_bonus,
  (s.calculation->'totals'->>'variable_gross')::numeric       as variable_gross,
  (s.calculation->'totals'->>'leave_allowance')::numeric      as leave_allowance,
  (s.calculation->'totals'->>'overtime_amount')::numeric      as overtime_amount,
  s.gross_pay,
  s.income_tax,
  s.trimf,
  (s.calculation->'totals'->>'brs')::numeric                  as brs,
  (s.calculation->'totals'->>'ipres_rg_employee')::numeric    as ipres_rg_employee,
  (s.calculation->'totals'->>'ipres_rc_employee')::numeric    as ipres_rc_employee,
  (s.calculation->'totals'->>'ipm_employee')::numeric         as ipm_employee,
  s.total_employee_deductions,
  s.net_remuneration,
  (s.calculation->'totals'->>'transport_allowance')::numeric  as transport_allowance,
  (s.calculation->'totals'->>'meal_allowance')::numeric       as meal_allowance,
  (s.calculation->'totals'->>'km_allowance')::numeric         as km_allowance,
  (s.calculation->'totals'->>'previous_rounding')::numeric    as previous_rounding,
  s.total_non_taxable,
  s.total_net_deductions,
  s.net_pay,
  (s.calculation->'totals'->>'cfce')::numeric                 as cfce,
  (s.calculation->'totals'->>'ipres_rg_employer')::numeric    as ipres_rg_employer,
  (s.calculation->'totals'->>'ipres_rc_employer')::numeric    as ipres_rc_employer,
  (s.calculation->'totals'->>'css_af')::numeric               as css_af,
  (s.calculation->'totals'->>'css_at')::numeric               as css_at,
  (s.calculation->'totals'->>'ipm_employer')::numeric         as ipm_employer,
  s.employer_charges,
  s.payroll_cost,
  s.leave_provision
from public.salary_slips s
where s.status <> 'Annulé';

-- ------------------------------------------------ état résumé des cotisations
create or replace view public.v_contribution_summary
with (security_invoker = true) as
select
  s.payroll_entry_id,
  s.period_start,
  d.component_code,
  min(d.label)                    as label,
  min(d.sort_order)               as sort_order,
  max(d.employee_rate)            as employee_rate,
  max(d.employer_rate)            as employer_rate,
  sum(coalesce(d.base, 0))        as base_total,
  sum(d.deduction_amount)         as employee_amount,
  sum(d.employer_amount)          as employer_amount,
  sum(d.deduction_amount + d.employer_amount) as total_amount,
  count(*) filter (where d.deduction_amount <> 0 or d.employer_amount <> 0) as headcount
from public.salary_slip_details d
join public.salary_slips s on s.id = d.salary_slip_id
where s.status <> 'Annulé' and d.section in ('retenue','patronal')
group by s.payroll_entry_id, s.period_start, d.component_code;

-- ----------------------------------------- écritures comptables (feuille compta)
create or replace view public.v_accounting_journal
with (security_invoker = true) as
with t as (
  select r.payroll_entry_id, r.period_start,
    sum(r.gross_pay) filter (where r.contract_situation <> 'PRESTATION') as brut_salaries,
    sum(r.gross_pay) filter (where r.contract_situation =  'PRESTATION') as brut_presta,
    sum(r.total_non_taxable)  as indemnites,
    sum(r.previous_rounding)  as appoints,
    sum(r.ipres_rg_employee) as rg_sal, sum(r.ipres_rc_employee) as rc_sal,
    sum(r.ipm_employee) as ipm_sal, sum(r.income_tax) as ir, sum(r.trimf) as trimf, sum(r.brs) as brs,
    sum(r.total_net_deductions) as retenues_net,
    sum(r.ipres_rg_employer) as rg_pat, sum(r.ipres_rc_employer) as rc_pat,
    sum(r.css_af) as css_af, sum(r.css_at) as css_at, sum(r.ipm_employer) as ipm_pat, sum(r.cfce) as cfce
  from public.v_payroll_register r
  group by r.payroll_entry_id, r.period_start
)
select payroll_entry_id, period_start, journal, line_no, account, label, debit, credit
from t
cross join lateral (values
  ('1-Salaires', 1, '661',  'Rémunération directe versée',                  coalesce(brut_salaries,0), 0::numeric),
  ('1-Salaires', 2, '663',  'Indemnités forfaitaires',                      coalesce(indemnites,0) + coalesce(appoints,0), 0),
  ('1-Salaires', 3, '6057', 'Achats d''études et prestations de services', coalesce(brut_presta,0), 0),
  ('1-Salaires', 4, '422',  'Personnel, rémunérations dues',                0, coalesce(brut_salaries,0) + coalesce(indemnites,0) + coalesce(appoints,0)),
  ('1-Salaires', 5, '401',  'Honoraires prestataires',                      0, coalesce(brut_presta,0)),
  ('2-Retenues', 1, '422',  'Personnel, rémunérations dues',                coalesce(rg_sal,0)+coalesce(rc_sal,0)+coalesce(ipm_sal,0)+coalesce(ir,0)+coalesce(trimf,0)+coalesce(retenues_net,0), 0),
  ('2-Retenues', 2, '401',  'Honoraires prestataires (BRS)',                coalesce(brs,0), 0),
  ('2-Retenues', 3, '421',  'Avances et retenues diverses',                 0, coalesce(retenues_net,0)),
  ('2-Retenues', 4, '4313', 'IPRES régime général',                         0, coalesce(rg_sal,0)),
  ('2-Retenues', 5, '4314', 'IPRES régime cadre',                           0, coalesce(rc_sal,0)),
  ('2-Retenues', 6, '4331', 'IPM',                                          0, coalesce(ipm_sal,0)),
  ('2-Retenues', 7, '4471', 'Impôt sur le revenu',                          0, coalesce(ir,0)),
  ('2-Retenues', 8, '4472', 'TRIMF',                                        0, coalesce(trimf,0)),
  ('2-Retenues', 9, '4471', 'BRS',                                          0, coalesce(brs,0)),
  ('3-Charges patronales', 1, '664',  'Charges sociales',                   coalesce(rg_pat,0)+coalesce(rc_pat,0)+coalesce(css_af,0)+coalesce(css_at,0)+coalesce(ipm_pat,0), 0),
  ('3-Charges patronales', 2, '641',  'Impôts sur rémunérations (CFCE)',    coalesce(cfce,0), 0),
  ('3-Charges patronales', 3, '4311', 'CSS prestations familiales',         0, coalesce(css_af,0)),
  ('3-Charges patronales', 4, '4312', 'CSS accidents du travail',           0, coalesce(css_at,0)),
  ('3-Charges patronales', 5, '4313', 'IPRES régime général',               0, coalesce(rg_pat,0)),
  ('3-Charges patronales', 6, '4314', 'IPRES régime cadre',                 0, coalesce(rc_pat,0)),
  ('3-Charges patronales', 7, '4331', 'IPM',                                0, coalesce(ipm_pat,0)),
  ('3-Charges patronales', 8, '4473', 'CFCE',                               0, coalesce(cfce,0))
) as j(journal, line_no, account, label, debit, credit)
where debit <> 0 or credit <> 0;

-- ---------------------------------------------------- cumuls annuels (BULLETIN)
create or replace view public.v_salary_slip_ytd
with (security_invoker = true) as
select
  s.id as salary_slip_id,
  s.employee_id,
  s.period_start,
  sum(p.gross_pay)        as ytd_gross,
  sum(p.income_tax)       as ytd_income_tax,
  sum(p.trimf)            as ytd_trimf,
  sum(p.leave_provision)  as ytd_leave_provision,
  sum((p.calculation->'totals'->>'ipres_rg_employee')::numeric + (p.calculation->'totals'->>'ipres_rg_employer')::numeric) as ytd_ipres_rg,
  sum((p.calculation->'totals'->>'ipres_rc_employee')::numeric + (p.calculation->'totals'->>'ipres_rc_employer')::numeric) as ytd_ipres_rc,
  sum(p.net_pay)          as ytd_net_pay,
  sum(p.payroll_cost)     as ytd_payroll_cost
from public.salary_slips s
join public.salary_slips p
  on p.employee_id = s.employee_id
 and p.status <> 'Annulé'
 and date_trunc('year', p.period_start) = date_trunc('year', s.period_start)
 and p.period_start <= s.period_start
where s.status <> 'Annulé'
group by s.id, s.employee_id, s.period_start;

-- ------------------------------------------------------------ soldes de congés
create or replace view public.v_leave_balances
with (security_invoker = true) as
with alloc as (
  select employee_id, leave_type, sum(days) as allocated
  from public.leave_allocations
  where to_date >= date_trunc('year', current_date)
  group by employee_id, leave_type
), used as (
  select employee_id, leave_type, sum(total_days) as taken
  from public.leave_applications
  where status = 'Approuvée' and from_date >= date_trunc('year', current_date)
  group by employee_id, leave_type
)
select e.id as employee_id, e.employee_number, e.first_name, e.last_name, lt.code as leave_type, lt.name as leave_type_name,
       coalesce(a.allocated, 0) as allocated, coalesce(u.taken, 0) as taken,
       coalesce(a.allocated, 0) - coalesce(u.taken, 0) as balance
from public.employees e
cross join public.leave_types lt
left join alloc a on a.employee_id = e.id and a.leave_type = lt.code
left join used  u on u.employee_id = e.id and u.leave_type = lt.code
where e.status = 'Active' and (a.allocated is not null or u.taken is not null);

-- ------------------------------------------------------------ tableau de bord
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
                  'income_tax', coalesce(sum(income_tax),0))
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
revoke execute on function public.hr_dashboard(date) from public, anon;
grant execute on function public.hr_dashboard(date) to authenticated;
