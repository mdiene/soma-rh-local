-- Les présences saisies dans la grille alimentent directement la paie :
-- le calcul du traitement synchronise d'abord absences, maladie et heures supplémentaires
-- depuis `attendance` vers `payroll_inputs` (uniquement pour les salariés ayant des présences).
create or replace function public.run_payroll_entry(p_payroll_entry_id uuid)
returns jsonb
language plpgsql
set search_path = ''
as $function$
declare
  pe       public.payroll_entries;
  emp      record;
  v_done   int := 0;
  v_synced int := 0;
  v_errors jsonb := '[]'::jsonb;
begin
  if not public.has_role(array['paie']) then
    raise exception 'Droits insuffisants : rôle « paie » requis';
  end if;
  select * into pe from public.payroll_entries where id = p_payroll_entry_id for update;
  if pe.id is null then raise exception 'Traitement de paie introuvable'; end if;
  if pe.status in ('Validée','Annulée') then
    raise exception 'Le traitement est % : recalcul impossible', pe.status;
  end if;

  v_synced := public.sync_attendance_to_payroll_inputs(pe.period_start);

  for emp in
    select e.id, e.employee_number, e.last_name
    from public.employees e
    where e.company_id = pe.company_id
      and e.status in ('Active','Left')
      and e.date_of_joining <= pe.period_end
      and (e.relieving_date is null or e.relieving_date >= pe.period_start)
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
$function$;

revoke execute on function public.run_payroll_entry(uuid) from public, anon;
grant execute on function public.run_payroll_entry(uuid) to authenticated;
