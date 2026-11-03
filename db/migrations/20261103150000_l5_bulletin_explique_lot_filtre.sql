-- =============================================================================
-- L5 — bulletin expliqué (cumuls par rubrique, coût employeur) et lot de paie filtré
--  L5-03 : salary_slip_explained(slip) : lignes détaillées + cumul annuel par rubrique
--          (bulletin courant + bulletins validés précédents de la même année, comme v_salary_slip_ytd)
--  L5-02 : run_payroll_batch(entry, contrat, salariés) : calcul d'un sous-ensemble, idempotent
--          (calculate_salary_slip remplace le bulletin existant) ; run_payroll_entry = lot complet
-- Le moteur de calcul n'est pas modifié. Invoker : la RLS s'applique (un salarié ne voit que son bulletin).
-- =============================================================================

create or replace function public.salary_slip_explained(p_slip_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with s as (select * from public.salary_slips where id = p_slip_id),
  prev as (
    select p.id from public.salary_slips p join s on p.employee_id = s.employee_id
     where p.status = 'Validé' and p.id <> s.id
       and p.period_start >= date_trunc('year', s.period_start)::date and p.period_start < s.period_start
  ),
  cum as (
    select x.component_code, sum(x.gain_amount) as gain, sum(x.deduction_amount) as deduction, sum(x.employer_amount) as employer
      from public.salary_slip_details x where x.salary_slip_id in (select id from prev) group by x.component_code
  )
  select jsonb_build_object(
    'gross_pay', s.gross_pay, 'net_pay', s.net_pay,
    'employer_charges', s.employer_charges, 'payroll_cost', s.payroll_cost,
    'lines', coalesce((
      select jsonb_agg(jsonb_build_object(
        'code', d.component_code, 'label', d.label, 'section', d.section,
        'base', d.base, 'quantity', d.quantity, 'rate', d.employee_rate, 'employer_rate', d.employer_rate,
        'gain', d.gain_amount, 'deduction', d.deduction_amount, 'employer', d.employer_amount,
        'ytd_gain', d.gain_amount + coalesce(c.gain, 0),
        'ytd_deduction', d.deduction_amount + coalesce(c.deduction, 0),
        'ytd_employer', d.employer_amount + coalesce(c.employer, 0)
      ) order by d.sort_order)
      from public.salary_slip_details d left join cum c on c.component_code = d.component_code
      where d.salary_slip_id = s.id), '[]'::jsonb)
  )
  from s
$$;
revoke all on function public.salary_slip_explained(uuid) from public, anon;
grant execute on function public.salary_slip_explained(uuid) to authenticated;

create or replace function public.run_payroll_batch(
  p_payroll_entry_id uuid,
  p_employment_type text default null,
  p_employee_ids uuid[] default null
) returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  pe       public.payroll_entries;
  emp      record;
  v_done   int := 0;
  v_synced int := 0;
  v_errors jsonb := '[]'::jsonb;
begin
  if not public.has_role(array['paie','rh']) then
    raise exception 'Droits insuffisants : rôle « paie » ou « rh » requis';
  end if;
  select * into pe from public.payroll_entries where id = p_payroll_entry_id for update;
  if pe.id is null then raise exception 'Traitement de paie introuvable'; end if;
  if pe.status in ('Validée','Annulée') then
    raise exception 'Le traitement est % : recalcul impossible', pe.status;
  end if;

  v_synced := public.sync_attendance_to_payroll_inputs(pe.period_start);
  perform public.apply_period_adjustments(pe.id);

  for emp in
    select e.id, e.employee_number, e.last_name
    from public.employees e
    where e.company_id = pe.company_id
      and e.status in ('Active','Left')
      and e.date_of_joining <= pe.period_end
      and (e.relieving_date is null or e.relieving_date >= pe.period_start)
      and (p_employment_type is null or e.employment_type = p_employment_type)
      and (p_employee_ids is null or e.id = any(p_employee_ids))
    order by e.employee_number
  loop
    begin
      perform public.calculate_salary_slip(emp.id, pe.period_start, pe.period_end, pe.id);
      v_done := v_done + 1;
    exception when others then
      v_errors := v_errors || jsonb_build_object('employee_number', emp.employee_number,
                                                 'name', emp.last_name, 'error', sqlerrm);
    end;
  end loop;

  update public.payroll_entries set status = 'Calculée' where id = pe.id;
  return jsonb_build_object('calculated', v_done, 'errors', v_errors, 'attendance_synced', v_synced);
end;
$$;
revoke all on function public.run_payroll_batch(uuid, text, uuid[]) from public, anon;
grant execute on function public.run_payroll_batch(uuid, text, uuid[]) to authenticated;

-- le calcul complet est un lot sans filtre : un seul code à maintenir
create or replace function public.run_payroll_entry(p_payroll_entry_id uuid)
returns jsonb
language sql
set search_path = ''
as $$ select public.run_payroll_batch(p_payroll_entry_id, null, null) $$;
