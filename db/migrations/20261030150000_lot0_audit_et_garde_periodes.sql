-- =============================================================================
-- Lot 0 (feuille de route) : SOC-001 audit étendu + SOC-003 garde-fou de période
-- * journal des modifications sur les tables métier (salariés, affectations,
--   variables, salaires additionnels, présences, congés, bulletins, traitements,
--   paramètres, rôles) avec auteur, avant/après ;
-- * bulletins : le détail du calcul (jsonb volumineux) n'est pas recopié ;
-- * un traitement de paie ne peut pas être validé pour un mois futur ni après
--   un mois manquant (sauf administrateur).
-- =============================================================================

create or replace function public.business_audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  o jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  n jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  r jsonb := coalesce(n, o);
  heavy text[] := array['calculation', 'updated_at', 'updated_by'];
  o2 jsonb; n2 jsonb;
begin
  o2 := o - heavy; n2 := n - heavy;
  if tg_op = 'UPDATE' and o2 = n2 then
    return null;
  end if;
  insert into public.audit_log (table_name, record_id, record_key, action, old_data, new_data)
  values (tg_table_name,
          case when r ? 'id' then (r->>'id')::uuid end,
          coalesce(r->>'code', r->>'matricule', r->>'user_id', r->>'name'),
          case tg_op when 'INSERT' then 'création' when 'UPDATE' then 'modification' else 'suppression' end,
          o2, n2);
  return null;
end;
$$;
revoke execute on function public.business_audit() from public, anon, authenticated;

do $$
declare t text;
begin
  foreach t in array array['employees', 'salary_structure_assignments', 'payroll_inputs',
    'additional_salaries', 'attendance', 'leave_applications', 'salary_slips',
    'payroll_entries', 'payroll_settings', 'user_roles']
  loop
    execute format('drop trigger if exists %I on public.%I', t || '_audit', t);
    execute format('create trigger %I after insert or update or delete on public.%I
                    for each row execute function public.business_audit()', t || '_audit', t);
  end loop;
end $$;

create index if not exists audit_log_table_time_idx on public.audit_log (table_name, occurred_at desc);
create index if not exists audit_log_actor_idx on public.audit_log (actor);

-- ------------------------------------------------------- garde-fou des périodes
create or replace function public.payroll_entry_period_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare v_prev date := (date_trunc('month', new.period_start) - interval '1 month')::date;
begin
  if new.status = 'Validée' and (tg_op = 'INSERT' or old.status is distinct from 'Validée') then
    if new.period_start > date_trunc('month', current_date)::date then
      raise exception 'Période % : impossible de valider un mois futur', to_char(new.period_start, 'MM/YYYY');
    end if;
    if not public.has_role(array['admin'])
       and exists (select 1 from public.payroll_entries e where e.period_start < new.period_start and e.id <> new.id)
       and not exists (select 1 from public.payroll_entries e
                       where date_trunc('month', e.period_start) = v_prev and e.status = 'Validée') then
      raise exception 'Période % : le mois précédent (%) n''est pas validé. Validez-le d''abord (ou demandez à un administrateur).',
        to_char(new.period_start, 'MM/YYYY'), to_char(v_prev, 'MM/YYYY');
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists payroll_entries_period_guard on public.payroll_entries;
create trigger payroll_entries_period_guard
  before insert or update of status on public.payroll_entries
  for each row execute function public.payroll_entry_period_guard();
