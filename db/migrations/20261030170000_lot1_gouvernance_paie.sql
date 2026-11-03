-- =============================================================================
-- Lot 1 (feuille de route) : gouvernance de la paie
-- * D2 : tout rôle « paie » prépare ; seul l'administrateur valide (clôture) ;
-- * PAY-005 : copie figée des paramètres de paie à la validation ;
-- * PAY-003 : contrôles avant validation (payroll_entry_checks).
-- Le moteur de calcul n'est pas modifié.
-- =============================================================================
alter table public.payroll_entries add column if not exists settings_snapshot jsonb;
comment on column public.payroll_entries.settings_snapshot is 'Copie des paramètres de paie (payroll_settings) au moment de la validation.';

create or replace function public.submit_payroll_entry(p_payroll_entry_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if not public.has_role(array['admin']) then
    raise exception 'Seul un administrateur peut valider et clôturer la paie';
  end if;
  update public.payroll_entries
     set status = 'Validée', submitted_by = (select auth.uid()), submitted_at = now(),
         settings_snapshot = (select coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb) from public.payroll_settings s)
   where id = p_payroll_entry_id and status = 'Calculée';
  if not found then
    raise exception 'Seul un traitement « Calculée » peut être validé';
  end if;
  update public.salary_slips set status = 'Validé'
   where payroll_entry_id = p_payroll_entry_id and status = 'Brouillon';
end;
$$;

-- Contrôles avant validation : renvoie une liste de {niveau, code, salarié, message}
create or replace function public.payroll_entry_checks(p_payroll_entry_id uuid)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  pe public.payroll_entries;
  v_prev uuid;
  v_out jsonb := '[]'::jsonb;
begin
  if not public.has_role(array['rh', 'paie']) then
    raise exception 'Droits insuffisants';
  end if;
  select * into pe from public.payroll_entries where id = p_payroll_entry_id;
  if not found then return v_out; end if;

  select id into v_prev from public.payroll_entries
   where period_start < pe.period_start and status = 'Validée'
   order by period_start desc limit 1;

  -- salariés actifs sans bulletin
  v_out := v_out || coalesce((
    select jsonb_agg(jsonb_build_object('niveau', 'erreur', 'code', 'sans_bulletin',
             'salarie', e.employee_number || ' ' || e.last_name || ' ' || e.first_name,
             'message', 'Salarié actif sans bulletin dans ce traitement'))
      from public.employees e
     where e.status = 'Active'
       and not exists (select 1 from public.salary_slips s
                        where s.payroll_entry_id = pe.id and s.employee_id = e.id and s.status <> 'Annulé')), '[]'::jsonb);

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

  -- variables corrigées à la main (écart avec les présences)
  v_out := v_out || coalesce((
    select jsonb_agg(jsonb_build_object('niveau', 'info', 'code', 'variable_corrigee',
             'salarie', e.employee_number || ' ' || e.last_name || ' ' || e.first_name,
             'message', 'Variables du mois corrigées manuellement (différent des présences)'))
      from public.payroll_inputs i join public.employees e on e.id = i.employee_id
     where i.period = pe.period_start and i.attendance_override), '[]'::jsonb);

  return v_out;
end;
$$;
revoke execute on function public.payroll_entry_checks(uuid) from public, anon;
grant execute on function public.payroll_entry_checks(uuid) to authenticated;
