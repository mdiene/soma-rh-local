-- =============================================================================
-- Lot 1 (suite) : réouverture motivée d'une paie validée (PAY-006) et
-- comparaison avec le dernier mois validé (PAY-008). Le moteur n'est pas modifié.
-- =============================================================================
create or replace function public.reopen_payroll_entry(p_payroll_entry_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare pe public.payroll_entries;
begin
  if not public.has_role(array['admin']) then
    raise exception 'Seul un administrateur peut rouvrir une paie validée';
  end if;
  if length(trim(coalesce(p_reason, ''))) < 5 then
    raise exception 'Un motif d''au moins 5 caractères est obligatoire';
  end if;
  select * into pe from public.payroll_entries where id = p_payroll_entry_id for update;
  if not found or pe.status <> 'Validée' then
    raise exception 'Seul un traitement « Validée » peut être rouvert';
  end if;
  if exists (select 1 from public.payroll_entries e where e.period_start > pe.period_start and e.status = 'Validée') then
    raise exception 'Rouvrez d''abord les mois suivants déjà validés';
  end if;
  update public.salary_slips set status = 'Brouillon' where payroll_entry_id = pe.id and status = 'Validé';
  update public.payroll_entries
     set status = 'Calculée', submitted_by = null, submitted_at = null, settings_snapshot = null
   where id = pe.id;
  insert into public.audit_log (table_name, record_id, record_key, action, reason, old_data, new_data)
  values ('payroll_entries', pe.id, to_char(pe.period_start, 'YYYY-MM'), 'réouverture', trim(p_reason),
          jsonb_build_object('status', 'Validée'), jsonb_build_object('status', 'Calculée'));
end;
$$;
revoke execute on function public.reopen_payroll_entry(uuid, text) from public, anon;
grant execute on function public.reopen_payroll_entry(uuid, text) to authenticated;

create or replace function public.payroll_entry_comparison(p_payroll_entry_id uuid)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  pe public.payroll_entries;
  v_prev public.payroll_entries;
begin
  if not public.has_role(array['rh', 'paie']) then
    raise exception 'Droits insuffisants';
  end if;
  select * into pe from public.payroll_entries where id = p_payroll_entry_id;
  if not found then return null; end if;
  select * into v_prev from public.payroll_entries
   where period_start < pe.period_start and status = 'Validée'
   order by period_start desc limit 1;
  if not found then return null; end if;

  return jsonb_build_object(
    'previous_period', v_prev.period_start,
    'rows', coalesce((
      select jsonb_agg(jsonb_build_object(
               'employee_number', e.employee_number, 'name', e.last_name || ' ' || e.first_name,
               'prev_gross', p.gross_pay, 'gross', c.gross_pay, 'prev_net', p.net_pay, 'net', c.net_pay)
             order by e.employee_number)
        from (select employee_id, gross_pay, net_pay from public.salary_slips where payroll_entry_id = pe.id and status <> 'Annulé') c
        full join (select employee_id, gross_pay, net_pay from public.salary_slips where payroll_entry_id = v_prev.id and status <> 'Annulé') p
               on p.employee_id = c.employee_id
        join public.employees e on e.id = coalesce(c.employee_id, p.employee_id)), '[]'::jsonb));
end;
$$;
revoke execute on function public.payroll_entry_comparison(uuid) from public, anon;
grant execute on function public.payroll_entry_comparison(uuid) to authenticated;
