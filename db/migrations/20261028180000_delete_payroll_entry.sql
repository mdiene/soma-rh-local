-- =============================================================================
-- SOMA-RH — 09 : suppression d'un traitement de paie mensuel
-- Supprime le traitement et tous ses bulletins (cascade sur salary_slips et
-- salary_slip_details). Brouillon / Calculée / Annulée : rôle paie.
-- Validée : administrateur uniquement (les bulletins ont pu être remis aux salariés).
-- Les variables du mois (payroll_inputs, additional_salaries) sont conservées.
-- =============================================================================
create or replace function public.delete_payroll_entry(p_payroll_entry_id uuid)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_status text;
  v_slips  integer;
begin
  select status into v_status from public.payroll_entries where id = p_payroll_entry_id for update;
  if v_status is null then
    raise exception 'Traitement de paie introuvable';
  end if;
  if not public.has_role(array['paie']) then
    raise exception 'Droits insuffisants : rôle « paie » requis';
  end if;
  if v_status = 'Validée' and not public.has_role(array['admin']) then
    raise exception 'Une paie validée ne peut être supprimée que par un administrateur';
  end if;

  select count(*) into v_slips from public.salary_slips where payroll_entry_id = p_payroll_entry_id;
  delete from public.payroll_entries where id = p_payroll_entry_id;
  return v_slips;
end;
$$;

revoke execute on function public.delete_payroll_entry(uuid) from public, anon;
grant execute on function public.delete_payroll_entry(uuid) to authenticated;
