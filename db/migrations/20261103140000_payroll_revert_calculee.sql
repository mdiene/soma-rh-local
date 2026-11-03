-- =============================================================================
-- Retour d'une paie à l'état « Calculée » (pour la corriger ou la supprimer)
-- Réservé à l'administrateur, motif d'au moins 5 caractères, journalisé (audit_events).
-- Couvre En revue / Approuvée / Validée / Payée. Une paie « Clôturée » doit d'abord être
-- rouverte (statut « Réouverte », déjà supprimable). reopen_payroll_entry reste disponible.
-- =============================================================================

create or replace function public.revert_payroll_entry(
  p_payroll_entry_id uuid,
  p_reason text,
  p_cancel_payments boolean default false
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  pe public.payroll_entries;
  v_paid integer;
begin
  if not public.has_role(array['admin']) then
    raise exception 'Seul un administrateur peut remettre une paie à l''état « Calculée »';
  end if;
  if length(trim(coalesce(p_reason, ''))) < 5 then
    raise exception 'Un motif d''au moins 5 caractères est obligatoire';
  end if;
  select * into pe from public.payroll_entries where id = p_payroll_entry_id for update;
  if not found then raise exception 'Traitement de paie introuvable'; end if;
  if pe.status = 'Clôturée' then
    raise exception 'Une paie clôturée doit d''abord être rouverte (action « Rouvrir » avec motif) avant de pouvoir être remise à l''état « Calculée » ou supprimée';
  end if;
  if pe.status not in ('En revue', 'Approuvée', 'Validée', 'Payée') then
    raise exception 'La paie est déjà « % » : aucun retour arrière nécessaire', pe.status;
  end if;
  if exists (select 1 from public.payroll_entries e
              where e.period_start > pe.period_start and e.status in ('Validée', 'Payée', 'Clôturée')) then
    raise exception 'Remettez d''abord à l''état « Calculée » les mois suivants déjà validés';
  end if;

  select count(*) into v_paid
    from public.salary_payments sp join public.salary_slips s on s.id = sp.slip_id
   where s.payroll_entry_id = pe.id and sp.status = 'Payé';
  if v_paid > 0 and not p_cancel_payments then
    raise exception '% paiement(s) déjà enregistré(s) sur cette paie : confirmez leur annulation pour continuer', v_paid;
  end if;
  if v_paid > 0 then
    delete from public.salary_payments sp using public.salary_slips s
     where s.id = sp.slip_id and s.payroll_entry_id = pe.id;
  end if;

  perform set_config('soma.payroll_transition', 'on', true);
  update public.salary_slips set status = 'Brouillon' where payroll_entry_id = pe.id and status <> 'Annulé';
  update public.payroll_entries
     set status = 'Calculée', approved_by = null, approved_at = null, paid_by = null, paid_at = null,
         submitted_by = null, submitted_at = null, settings_snapshot = null
   where id = pe.id;
  update public.payroll_periods set status = 'Calculée' where id = pe.period_id;

  insert into public.audit_events(actor_id, action, resource_type, resource_id, payroll_entry_id, before_data, after_data, reason)
  values (auth.uid(), 'retour_calculee', 'payroll_entry', pe.id, pe.id,
          jsonb_build_object('status', pe.status),
          jsonb_build_object('status', 'Calculée', 'paiements_annules', v_paid), trim(p_reason));
end;
$$;
revoke all on function public.revert_payroll_entry(uuid, text, boolean) from public, anon;
grant execute on function public.revert_payroll_entry(uuid, text, boolean) to authenticated;

-- le message de refus de suppression indique maintenant la marche à suivre
create or replace function public.delete_payroll_entry(p_payroll_entry_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
  v_slips integer;
begin
  select status into v_status from public.payroll_entries where id = p_payroll_entry_id for update;
  if v_status is null then raise exception 'Traitement de paie introuvable'; end if;
  if not public.has_role(array['paie','rh']) then raise exception 'Droits insuffisants : rôle « paie » requis'; end if;
  if v_status not in ('Brouillon','Calculée','Réouverte','Annulée') then
    raise exception 'Une paie « % » ne peut pas être supprimée. Un administrateur doit d''abord la remettre à l''état « Calculée » (bouton « Remettre en Calculée », avec motif)%', v_status,
      case when v_status = 'Clôturée' then ' après l''avoir rouverte' else '' end;
  end if;
  select count(*) into v_slips from public.salary_slips where payroll_entry_id = p_payroll_entry_id;
  insert into public.audit_events(actor_id, action, resource_type, resource_id, payroll_entry_id, before_data)
  values (auth.uid(), 'delete', 'payroll_entry', p_payroll_entry_id, p_payroll_entry_id,
          jsonb_build_object('status', v_status, 'slips', v_slips));
  delete from public.payroll_entries where id = p_payroll_entry_id;
  return v_slips;
end;
$$;
