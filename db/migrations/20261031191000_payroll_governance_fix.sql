-- SOMA-RH — Phase 1 corrective migration
-- Autorise uniquement une réouverture explicitement motivée d'une paie clôturée.

create or replace function public.prevent_closed_payroll_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_status text;
begin
  if tg_table_name = 'payroll_entries' then
    v_status := old.status;
    if v_status = 'Clôturée'
       and new.status = 'Réouverte'
       and nullif(trim(new.reopen_reason), '') is not null
       and public.has_role(array['admin']) then
      return new;
    end if;
  else
    select status into v_status
    from public.payroll_entries
    where id = old.payroll_entry_id;
  end if;
  if v_status = 'Clôturée' then
    raise exception 'La paie clôturée est immuable; une réouverture motivée est requise';
  end if;
  return coalesce(new, old);
end;
$$;

create or replace function public.transition_payroll_entry(
  p_payroll_entry_id uuid,
  p_target_status text,
  p_reason text default null
)
returns text
language plpgsql
set search_path = ''
as $$
declare
  v_entry public.payroll_entries;
  v_allowed boolean := false;
  v_actor uuid := auth.uid();
begin
  select * into v_entry from public.payroll_entries
  where id = p_payroll_entry_id for update;
  if v_entry.id is null then raise exception 'Traitement de paie introuvable'; end if;
  if p_target_status not in ('En revue','Approuvée','Validée','Payée','Clôturée','Réouverte','Annulée') then
    raise exception 'Statut de transition invalide: %', p_target_status;
  end if;
  if p_target_status in ('Annulée','Réouverte') and not public.has_role(array['admin']) then
    raise exception 'Seul un administrateur peut annuler ou rouvrir une paie';
  end if;
  if p_target_status in ('Payée','Clôturée') and not public.has_role(array['paie']) then
    raise exception 'Droits insuffisants : rôle « paie » requis';
  end if;
  if p_target_status = 'En revue' and v_entry.status = 'Calculée' then v_allowed := true; end if;
  if p_target_status = 'Approuvée' and v_entry.status = 'En revue' then v_allowed := true; end if;
  if p_target_status = 'Validée' and v_entry.status in ('Calculée','Approuvée') then v_allowed := true; end if;
  if p_target_status = 'Payée' and v_entry.status = 'Validée' then v_allowed := true; end if;
  if p_target_status = 'Clôturée' and v_entry.status in ('Validée','Payée') then v_allowed := true; end if;
  if p_target_status = 'Réouverte' and v_entry.status = 'Clôturée' and nullif(trim(p_reason), '') is not null then v_allowed := true; end if;
  if p_target_status = 'Annulée' and v_entry.status <> 'Clôturée' then v_allowed := true; end if;
  if not v_allowed then raise exception 'Transition interdite: % -> %', v_entry.status, p_target_status; end if;

  if p_target_status = 'Clôturée' then
    perform public.create_payroll_snapshot(p_payroll_entry_id);
    update public.payroll_entries
       set status = p_target_status, closed_by = v_actor, closed_at = now()
     where id = p_payroll_entry_id;
  elsif p_target_status = 'Réouverte' then
    update public.payroll_entries
       set status = p_target_status, reopened_by = v_actor, reopened_at = now(), reopen_reason = p_reason
     where id = p_payroll_entry_id;
  elsif p_target_status = 'Approuvée' then
    update public.payroll_entries
       set status = p_target_status, approved_by = v_actor, approved_at = now()
     where id = p_payroll_entry_id;
  elsif p_target_status = 'Payée' then
    update public.payroll_entries
       set status = p_target_status, paid_by = v_actor, paid_at = now()
     where id = p_payroll_entry_id;
  else
    update public.payroll_entries set status = p_target_status where id = p_payroll_entry_id;
  end if;
  update public.payroll_periods set status = p_target_status where id = v_entry.period_id;
  insert into public.audit_events(actor_id, action, resource_type, resource_id, payroll_entry_id, before_data, after_data, reason)
  values (v_actor, 'transition', 'payroll_entry', p_payroll_entry_id, p_payroll_entry_id,
          jsonb_build_object('status', v_entry.status),
          jsonb_build_object('status', p_target_status), p_reason);
  return p_target_status;
end;
$$;
