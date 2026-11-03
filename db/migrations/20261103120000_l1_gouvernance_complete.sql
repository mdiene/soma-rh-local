-- =============================================================================
-- L1 (suite) — gouvernance de la paie
--  L1-01 : payroll_entry_checks restauré (absent de la base alors que le déclencheur
--          payroll_validation_guard l'appelle) et complété (structure, variables, congés, doublons)
--  L1-03 : règle de séparation unique payroll_assert_separation + dérogation admin avec motif,
--          journalisée (action « derogation_separation »), utilisée aussi par submit_payroll_entry
--  L1-02 : try_transition_payroll_entry journalise les refus (result = 'denied') et renvoie un
--          message explicite ; chaque refus a un texte en français
--  L1-04 : empreintes des snapshots en SHA-256 (hash_algo), payroll_snapshots_verify()
--  L1-06 : payroll_closing_report(uuid) alimente le rapport de clôture imprimable
-- Le moteur de calcul n'est pas modifié.
-- =============================================================================

-- ------------------------------------------------------------ L1-01 contrôles de période
create or replace function public.payroll_entry_checks(p_payroll_entry_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  pe public.payroll_entries;
  v_prev uuid;
  v_out jsonb := '[]'::jsonb;
begin
  if not public.has_role(array['rh', 'paie']) then
    raise exception 'Droits insuffisants : rôle « rh » ou « paie » requis pour consulter les contrôles';
  end if;
  select * into pe from public.payroll_entries where id = p_payroll_entry_id;
  if not found then return v_out; end if;

  select id into v_prev from public.payroll_entries
   where period_start < pe.period_start and status = 'Validée'
   order by period_start desc limit 1;

  -- salariés actifs sans bulletin (avec la cause probable : pas de structure salariale)
  v_out := v_out || coalesce((
    select jsonb_agg(jsonb_build_object('niveau', 'erreur', 'code', 'sans_bulletin',
             'salarie', e.employee_number || ' ' || e.last_name || ' ' || e.first_name,
             'message', case when not exists (select 1 from public.salary_structure_assignments a
                                               where a.employee_id = e.id and a.from_date <= pe.period_end)
                             then 'Salarié actif sans structure salariale : aucun bulletin possible'
                             else 'Salarié actif sans bulletin dans ce traitement' end))
      from public.employees e
     where e.status = 'Active'
       and not exists (select 1 from public.salary_slips s
                        where s.payroll_entry_id = pe.id and s.employee_id = e.id and s.status <> 'Annulé')), '[]'::jsonb);

  -- plusieurs bulletins actifs pour un même salarié
  v_out := v_out || coalesce((
    select jsonb_agg(jsonb_build_object('niveau', 'erreur', 'code', 'doublon_bulletin',
             'salarie', e.employee_number || ' ' || e.last_name || ' ' || e.first_name,
             'message', 'Plusieurs bulletins actifs pour ce salarié dans le traitement'))
      from public.employees e
     where (select count(*) from public.salary_slips s
             where s.payroll_entry_id = pe.id and s.employee_id = e.id and s.status <> 'Annulé') > 1), '[]'::jsonb);

  -- net nul ou négatif
  v_out := v_out || coalesce((
    select jsonb_agg(jsonb_build_object('niveau', 'erreur', 'code', 'net_negatif',
             'salarie', e.employee_number || ' ' || e.last_name || ' ' || e.first_name,
             'message', 'Net à payer nul ou négatif'))
      from public.salary_slips s join public.employees e on e.id = s.employee_id
     where s.payroll_entry_id = pe.id and s.status <> 'Annulé' and s.net_pay <= 0), '[]'::jsonb);

  -- variation du net supérieure à 30 % par rapport au dernier mois validé
  if v_prev is not null then
    v_out := v_out || coalesce((
      select jsonb_agg(jsonb_build_object('niveau', 'alerte', 'code', 'variation',
               'salarie', e.employee_number || ' ' || e.last_name || ' ' || e.first_name,
               'message', 'Net ' || round(p.net_pay) || ' → ' || round(s.net_pay) || ' F ('
                          || round(((s.net_pay - p.net_pay) / p.net_pay) * 100) || ' %)'))
        from public.salary_slips s
        join public.salary_slips p on p.employee_id = s.employee_id and p.payroll_entry_id = v_prev and p.status <> 'Annulé'
        join public.employees e on e.id = s.employee_id
       where s.payroll_entry_id = pe.id and s.status <> 'Annulé' and p.net_pay > 0
         and abs((s.net_pay - p.net_pay) / p.net_pay) > 0.30), '[]'::jsonb);
  end if;

  -- aucune variable du mois saisie pour un salarié payé
  v_out := v_out || coalesce((
    select jsonb_agg(jsonb_build_object('niveau', 'alerte', 'code', 'sans_variables',
             'salarie', e.employee_number || ' ' || e.last_name || ' ' || e.first_name,
             'message', 'Aucune variable du mois saisie (absences, heures supplémentaires)'))
      from public.salary_slips s join public.employees e on e.id = s.employee_id
     where s.payroll_entry_id = pe.id and s.status <> 'Annulé'
       and not exists (select 1 from public.payroll_inputs i where i.employee_id = s.employee_id and i.period = pe.period_start)), '[]'::jsonb);

  -- variables corrigées à la main (écart avec les présences)
  v_out := v_out || coalesce((
    select jsonb_agg(jsonb_build_object('niveau', 'info', 'code', 'variable_corrigee',
             'salarie', e.employee_number || ' ' || e.last_name || ' ' || e.first_name,
             'message', 'Variables du mois corrigées manuellement (différent des présences)'))
      from public.payroll_inputs i join public.employees e on e.id = i.employee_id
     where i.period = pe.period_start and i.attendance_override), '[]'::jsonb);

  -- demandes de congé encore ouvertes sur la période
  v_out := v_out || coalesce((
    select jsonb_agg(jsonb_build_object('niveau', 'alerte', 'code', 'conge_en_attente',
             'salarie', e.employee_number || ' ' || e.last_name || ' ' || e.first_name,
             'message', 'Demande de congé du ' || l.from_date || ' au ' || l.to_date || ' non traitée'))
      from public.leave_applications l join public.employees e on e.id = l.employee_id
     where l.status = 'Ouverte' and l.from_date <= pe.period_end and l.to_date >= pe.period_start), '[]'::jsonb);

  return v_out;
end;
$$;
revoke execute on function public.payroll_entry_checks(uuid) from public, anon;
grant execute on function public.payroll_entry_checks(uuid) to authenticated;

-- ------------------------------------------------------------ L1-03 règle de séparation unique
create or replace function public.payroll_assert_separation(p_entry public.payroll_entries, p_action text, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_actor uuid := auth.uid();
begin
  -- created_by : a lancé le calcul ; submitted_by : a envoyé la paie en revue (avant approbation)
  if v_actor is null
     or (v_actor is distinct from p_entry.created_by and v_actor is distinct from p_entry.submitted_by) then
    return;
  end if;
  if public.has_role(array['admin']) and nullif(trim(p_reason), '') is not null then
    insert into public.audit_events(actor_id, action, resource_type, resource_id, payroll_entry_id, after_data, reason)
    values (v_actor, 'derogation_separation', 'payroll_entry', p_entry.id, p_entry.id,
            jsonb_build_object('action', p_action, 'statut', p_entry.status), p_reason);
    return;
  end if;
  raise exception using errcode = 'SD403',
    message = 'Séparation des tâches : la personne qui a préparé cette paie ne peut pas la ' || p_action
              || '. ' || case when public.has_role(array['admin'])
                              then 'En tant qu''administrateur, vous pouvez déroger en indiquant un motif.'
                              else 'Demandez à une autre personne habilitée, ou à un administrateur.' end;
end;
$$;
revoke all on function public.payroll_assert_separation(public.payroll_entries, text, text) from public, anon, authenticated;

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
    raise exception 'Statut de transition invalide : « % »', p_target_status;
  end if;
  if p_target_status in ('Annulée','Réouverte') and not public.has_role(array['admin']) then
    raise exception 'Seul un administrateur peut annuler ou rouvrir une paie';
  end if;
  if p_target_status in ('Payée','Clôturée') and not public.has_role(array['paie']) then
    raise exception 'Droits insuffisants : rôle « paie » requis pour passer la paie à « % »', p_target_status;
  end if;
  if p_target_status in ('En revue','Validée') and not public.has_role(array['rh','paie']) then
    raise exception 'Droits insuffisants : rôle « rh » ou « paie » requis pour passer la paie à « % »', p_target_status;
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
  if not v_allowed then
    if p_target_status = 'Réouverte' and v_entry.status = 'Clôturée' then
      raise exception 'Un motif est obligatoire pour rouvrir une paie clôturée';
    end if;
    raise exception 'Transition interdite : la paie est « % » et ne peut pas passer à « % »', v_entry.status, p_target_status;
  end if;

  -- I4 : le préparateur ne contrôle pas son propre travail (dérogation admin motivée)
  if p_target_status = 'Approuvée' then
    perform public.payroll_assert_separation(v_entry, 'approuver', p_reason);
  elsif p_target_status = 'Validée' and v_entry.status = 'Calculée' then
    perform public.payroll_assert_separation(v_entry, 'valider', p_reason);
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
  elsif p_target_status = 'Validée' then
    update public.payroll_entries
       set status = p_target_status, submitted_at = coalesce(submitted_at, now())
     where id = p_payroll_entry_id;
    update public.salary_slips set status = 'Validé'
     where payroll_entry_id = p_payroll_entry_id and status = 'Brouillon';
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

-- L'ancienne validation directe passe par la même règle (pas de contournement de I4)
drop function if exists public.submit_payroll_entry(uuid);
create or replace function public.submit_payroll_entry(p_payroll_entry_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.has_role(array['paie']) then
    raise exception 'Droits insuffisants : rôle « paie » requis pour valider la paie';
  end if;
  if not exists (select 1 from public.payroll_entries where id = p_payroll_entry_id and status = 'Calculée') then
    raise exception 'Seul un traitement « Calculée » peut être validé';
  end if;
  perform public.transition_payroll_entry(p_payroll_entry_id, 'Validée', p_reason);
end;
$$;
revoke all on function public.submit_payroll_entry(uuid, text) from public, anon;
grant execute on function public.submit_payroll_entry(uuid, text) to authenticated;

-- ------------------------------------------------------------ L1-02 refus journalisés
create or replace function public.try_transition_payroll_entry(
  p_payroll_entry_id uuid,
  p_target_status text,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_from text;
  v_code text;
  v_msg text;
begin
  select status into v_from from public.payroll_entries where id = p_payroll_entry_id;
  begin
    return jsonb_build_object('ok', true, 'status', public.transition_payroll_entry(p_payroll_entry_id, p_target_status, p_reason));
  exception when others then
    get stacked diagnostics v_msg = message_text;
    v_code := sqlstate;
  end;
  -- le bloc interne est annulé : l'écriture ci-dessous subsiste
  insert into public.audit_events(actor_id, action, resource_type, resource_id, payroll_entry_id,
                                  before_data, after_data, reason, result)
  values (auth.uid(), 'transition_refusee', 'payroll_entry', p_payroll_entry_id,
          case when v_from is null then null else p_payroll_entry_id end,
          jsonb_build_object('status', v_from),
          jsonb_build_object('cible', p_target_status, 'message', v_msg), p_reason, 'denied');
  return jsonb_build_object('ok', false, 'message', v_msg, 'code', v_code);
end;
$$;
revoke all on function public.try_transition_payroll_entry(uuid, text, text) from public, anon;
grant execute on function public.try_transition_payroll_entry(uuid, text, text) to authenticated;

-- ------------------------------------------------------------ L1-04 snapshots en SHA-256
alter table public.payroll_snapshots add column if not exists hash_algo text not null default 'md5';

-- ne ré-empreinte que les lignes dont l'ancienne empreinte MD5 est encore exacte
update public.payroll_snapshots
   set payload_hash = encode(sha256(convert_to(payload::text, 'UTF8')), 'hex'), hash_algo = 'sha256'
 where hash_algo = 'md5' and payload_hash = md5(payload::text);

create or replace function public.create_payroll_snapshot(p_payroll_entry_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payload jsonb;
  v_snapshot_id uuid;
begin
  if not public.has_role(array['paie']) then
    raise exception 'Droits insuffisants : rôle « paie » requis pour figer la paie';
  end if;
  if exists (select 1 from public.payroll_entries where id = p_payroll_entry_id and status = 'Clôturée') then
    raise exception 'La paie est déjà clôturée';
  end if;
  select jsonb_build_object(
    'payroll_entry', to_jsonb(pe),
    'salary_slips', coalesce((select jsonb_agg(to_jsonb(ss) order by ss.employee_number)
                             from public.salary_slips ss where ss.payroll_entry_id = pe.id), '[]'::jsonb),
    'captured_at', now()
  ) into v_payload
  from public.payroll_entries pe
  where pe.id = p_payroll_entry_id;
  if v_payload is null then raise exception 'Traitement de paie introuvable'; end if;
  insert into public.payroll_snapshots(payroll_entry_id, payload, payload_hash, hash_algo)
  values (p_payroll_entry_id, v_payload, encode(sha256(convert_to(v_payload::text, 'UTF8')), 'hex'), 'sha256')
  on conflict (payroll_entry_id) do update
    set payload = excluded.payload, payload_hash = excluded.payload_hash, hash_algo = 'sha256',
        created_by = auth.uid(), created_at = now()
  returning id into v_snapshot_id;
  return v_snapshot_id;
end;
$$;

-- Une ligne par snapshot : ok = l'empreinte stockée correspond au contenu
create or replace function public.payroll_snapshots_verify()
returns table (payroll_entry_id uuid, hash_algo text, ok boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select s.payroll_entry_id, s.hash_algo,
         s.payload_hash = case s.hash_algo when 'sha256' then encode(sha256(convert_to(s.payload::text, 'UTF8')), 'hex')
                                           else md5(s.payload::text) end
    from public.payroll_snapshots s
   where public.has_role(array['admin', 'rh', 'paie'])
$$;
revoke all on function public.payroll_snapshots_verify() from public, anon;
grant execute on function public.payroll_snapshots_verify() to authenticated;

-- ------------------------------------------------------------ L1-06 rapport de clôture
-- Agrégats uniquement : aucun montant individuel ni donnée nominative de salarié.
create or replace function public.payroll_closing_report(p_payroll_entry_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  pe public.payroll_entries;
  v jsonb;
begin
  if not public.has_role(array['admin', 'rh', 'paie']) then
    raise exception 'Droits insuffisants : rôle « admin », « rh » ou « paie » requis pour le rapport de clôture';
  end if;
  select * into pe from public.payroll_entries where id = p_payroll_entry_id;
  if not found then raise exception 'Traitement de paie introuvable'; end if;
  select jsonb_build_object(
    'entry', jsonb_build_object('id', pe.id, 'period_start', pe.period_start, 'period_end', pe.period_end,
                                'status', pe.status, 'closed_at', pe.closed_at),
    'totals', (select jsonb_build_object('slips', count(*), 'gross_pay', coalesce(sum(gross_pay), 0),
                                         'net_pay', coalesce(sum(net_pay), 0),
                                         'employer_charges', coalesce(sum(employer_charges), 0),
                                         'payroll_cost', coalesce(sum(payroll_cost), 0))
                 from public.salary_slips where payroll_entry_id = pe.id and status <> 'Annulé'),
    'checks', public.payroll_entry_checks(pe.id),
    'history', coalesce((select jsonb_agg(jsonb_build_object('at', l.occurred_at, 'action', l.action, 'result', l.result,
                                'actor', (select u.email from auth.users u where u.id = l.actor),
                                'from', l.old_data ->> 'status', 'to', coalesce(l.new_data ->> 'status', l.new_data ->> 'cible'),
                                'reason', l.reason) order by l.chain_pos)
                         from public.audit_log l where l.payroll_entry_id = pe.id), '[]'::jsonb),
    'snapshot', (select jsonb_build_object('hash', s.payload_hash, 'algo', s.hash_algo, 'at', s.created_at)
                   from public.payroll_snapshots s where s.payroll_entry_id = pe.id),
    'audit_chain_breaks', case when public.has_role(array['rh']) then (select count(*) from public.audit_verify()) end
  ) into v;
  return v;
end;
$$;
revoke all on function public.payroll_closing_report(uuid) from public, anon;
grant execute on function public.payroll_closing_report(uuid) to authenticated;
