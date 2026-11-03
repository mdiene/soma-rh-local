-- =============================================================================
-- L1-03 — Séparation préparateur / approbateur (invariant I4) + contrôle de rôle
-- Redéfinit transition_payroll_entry (même signature, mêmes transitions) en ajoutant :
--  * rôle requis pour « En revue », « Approuvée », « Validée » (auparavant aucun contrôle,
--    alors que la fonction est SECURITY DEFINER) : rh/paie pour revue et validation, rh pour
--    l'approbation ; admin passe toujours (has_role) ;
--  * la personne qui a préparé la paie (created_by / submitted_by) ne peut ni l'approuver,
--    ni la valider si aucune approbation indépendante n'a eu lieu ;
--  * submitted_by est renseigné au passage « En revue » s'il était vide.
-- Clôture et paiement : règle inchangée (rôle paie) — voir Q11 du registre.
-- =============================================================================

create or replace function public.transition_payroll_entry(
  p_payroll_entry_id uuid,
  p_target_status text,
  p_reason text default null
)
returns text
language plpgsql
security definer
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
  if p_target_status in ('En revue','Validée') and not public.has_role(array['rh','paie']) then
    raise exception 'Droits insuffisants : rôle « rh » ou « paie » requis';
  end if;
  if p_target_status = 'Approuvée' and not public.has_role(array['rh']) then
    raise exception 'Droits insuffisants : rôle « rh » requis pour approuver une paie';
  end if;

  if p_target_status = 'En revue' and v_entry.status = 'Calculée' then v_allowed := true; end if;
  if p_target_status = 'Approuvée' and v_entry.status = 'En revue' then v_allowed := true; end if;
  if p_target_status = 'Validée' and v_entry.status in ('Calculée','Approuvée') then v_allowed := true; end if;
  if p_target_status = 'Payée' and v_entry.status = 'Validée' then v_allowed := true; end if;
  if p_target_status = 'Clôturée' and v_entry.status in ('Validée','Payée') then v_allowed := true; end if;
  if p_target_status = 'Réouverte' and v_entry.status = 'Clôturée' and nullif(trim(p_reason), '') is not null then v_allowed := true; end if;
  if p_target_status = 'Annulée' and v_entry.status <> 'Clôturée' then v_allowed := true; end if;
  if not v_allowed then raise exception 'Transition interdite: % -> %', v_entry.status, p_target_status; end if;

  -- I4 : le préparateur ne contrôle pas son propre travail
  if v_actor is not null
     and (p_target_status = 'Approuvée' or (p_target_status = 'Validée' and v_entry.status = 'Calculée'))
     and v_actor in (v_entry.created_by, v_entry.submitted_by) then
    raise exception 'Séparation des tâches : la personne qui a préparé cette paie ne peut pas l''%. Demandez à une autre personne habilitée.',
      case p_target_status when 'Approuvée' then 'approuver' else 'valider' end;
  end if;

  perform set_config('soma.payroll_transition', 'on', true);
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
  elsif p_target_status = 'En revue' then
    update public.payroll_entries
       set status = p_target_status, submitted_by = coalesce(submitted_by, v_actor)
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

revoke all on function public.transition_payroll_entry(uuid, text, text) from public, anon;
grant execute on function public.transition_payroll_entry(uuid, text, text) to authenticated;
