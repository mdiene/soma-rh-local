-- =============================================================================
-- D10 : arbitrage des points ouverts du classeur Excel (docs/ARBITRAGES_PAIE.md)
--   #4 transport / indemnité km : proratisation par les HEURES d'absence
--      (le classeur retranchait des jours d'une base en heures) ;
--   #7 IPM : non due pour les prestataires (non salariés) ;
--   #8 indemnité de licenciement / retraite : base = moyenne mensuelle des
--      12 derniers mois (mois de sortie compris), à défaut le mois de sortie.
-- Chaque règle est pilotée par un paramètre de payroll_settings ; la valeur
-- « Excel » rétablit l'ancien comportement à l'identique.
-- Le corps de compute_salary_slip est modifié par remplacement ciblé ; chaque
-- remplacement est vérifié (échec explicite si le texte attendu a changé).
-- =============================================================================
alter table public.payroll_settings
  add column if not exists allowance_absence_basis text not null default 'hours' check (allowance_absence_basis in ('hours', 'excel')),
  add column if not exists ipm_on_contractors boolean not null default false,
  add column if not exists severance_basis text not null default 'average12' check (severance_basis in ('average12', 'month'));
comment on column public.payroll_settings.allowance_absence_basis is 'hours : transport et km proratisés par les heures d''absence ; excel : ancien calcul (heures ÷ 8).';
comment on column public.payroll_settings.ipm_on_contractors is 'false : pas d''IPM pour les prestataires ; true : comme le classeur.';
comment on column public.payroll_settings.severance_basis is 'average12 : moyenne des 12 derniers mois ; month : salaire du mois de sortie (classeur).';

do $$
declare
  v_def text := pg_get_functiondef('public.compute_salary_slip(uuid,date,date,numeric)'::regprocedure);
  v_new text;
begin
  v_new := v_def;

  -- #4 transport / km
  if position($q$(H - (v_abs / 8))$q$ in v_new) = 0 then raise exception 'D10 #4 : texte transport introuvable'; end if;
  v_new := replace(v_new, $q$(H - (v_abs / 8))$q$,
    $q$(H - case when s.allowance_absence_basis = 'excel' then v_abs / 8 else v_abs end)$q$);
  if position($q$'quantity', H - v_abs / 8$q$ in v_new) = 0 then raise exception 'D10 #4 : texte quantité introuvable'; end if;
  v_new := replace(v_new, $q$'quantity', H - v_abs / 8$q$,
    $q$'quantity', H - case when s.allowance_absence_basis = 'excel' then v_abs / 8 else v_abs end$q$);

  -- #7 IPM prestataires
  if position($q$v_ipm_base := least(v_brut, s.ipm_ceiling);$q$ in v_new) = 0 then raise exception 'D10 #7 : texte IPM introuvable'; end if;
  v_new := replace(v_new, $q$v_ipm_base := least(v_brut, s.ipm_ceiling);$q$,
    $q$v_ipm_base := case when v_is_presta and not s.ipm_on_contractors then 0 else least(v_brut, s.ipm_ceiling) end;$q$);

  -- #8 base des indemnités de licenciement / retraite
  if position($q$v_licenc numeric := 0;$q$ in v_new) = 0 then raise exception 'D10 #8 : déclaration introuvable'; end if;
  v_new := replace(v_new, $q$v_licenc numeric := 0;$q$, $q$v_licenc numeric := 0; v_sev_base numeric;$q$);
  if position($q$if coalesce(ct.severance_eligible, e.employment_type = 'CDI') and e.relieving_date is not null$q$ in v_new) = 0 then raise exception 'D10 #8 : bloc sortie introuvable'; end if;
  v_new := replace(v_new, $q$if coalesce(ct.severance_eligible, e.employment_type = 'CDI') and e.relieving_date is not null$q$,
    $q$v_sev_base := v_base + v_sursal + v_prime_anc;
  if s.severance_basis = 'average12' then
    select (v_sev_base + coalesce(sum(q.x), 0)) / (1 + count(q.x)) into v_sev_base
      from (select (sl.calculation->'inputs'->>'base_salary')::numeric
                 + coalesce((sl.calculation->'inputs'->>'sursalaire')::numeric, 0)
                 + coalesce((sl.calculation->'totals'->>'seniority_bonus')::numeric, 0) as x
              from public.salary_slips sl
             where sl.employee_id = e.id and sl.status = 'Validé'
               and sl.period_start < p_period_start
               and sl.period_start >= (p_period_start - interval '11 months')) q;
  end if;
  if coalesce(ct.severance_eligible, e.employment_type = 'CDI') and e.relieving_date is not null$q$);
  if position($q$* (v_base + v_sursal + v_prime_anc);$q$ in v_new) = 0 then raise exception 'D10 #8 : base introuvable'; end if;
  v_new := replace(v_new, $q$* (v_base + v_sursal + v_prime_anc);$q$, $q$* v_sev_base;$q$);

  execute v_new;
end $$;
