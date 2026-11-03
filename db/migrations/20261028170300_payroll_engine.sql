-- =============================================================================
-- SOMA-RH — 04 : Moteur de calcul de la paie (PL/pgSQL)
-- Transposition 1:1 des formules du tableau « élements de salaires » (TABLEAU)
-- et du « BULLETIN » du classeur Excel. Les montants sont calculés en pleine
-- précision (numeric), exactement comme Excel ; l'arrondi n'intervient qu'à
-- l'affichage.
-- =============================================================================

-- ---------------------------------------------------------------- DATEDIF Excel
create or replace function public.excel_datedif(p_start date, p_end date, p_unit text)
returns integer
language plpgsql
immutable
set search_path = ''
as $$
declare
  a interval;
begin
  if p_start is null or p_end is null or p_end < p_start then
    return null;
  end if;
  a := age(p_end, p_start);
  return case lower(p_unit)
    when 'y'  then extract(year from a)::int
    when 'm'  then (extract(year from a) * 12 + extract(month from a))::int
    when 'ym' then extract(month from a)::int
    when 'md' then extract(day from a)::int
    when 'd'  then (p_end - p_start)
  end;
end;
$$;

-- ----------------------------------------------------- paramètres à une date
create or replace function public.payroll_settings_at(p_date date)
returns public.payroll_settings
language sql
stable
set search_path = ''
as $$
  select s.* from public.payroll_settings s
  where s.effective_from <= p_date
  order by s.effective_from desc
  limit 1;
$$;

create or replace function public.tax_slab_at(p_date date)
returns uuid
language sql
stable
set search_path = ''
as $$
  select t.id from public.tax_slabs t
  where t.effective_from <= p_date
  order by t.effective_from desc
  limit 1;
$$;

-- ------------------------------------------------------------------------ IR
-- Excel (colonne BF) :
--   R = ARRONDI.INF(Brut*12 - MIN(Brut*12*30% ; 900 000) ; -3)
--   impôt brut = barème progressif (0 / 20 / 30 / 35 / 37 / 40 %)
--   réduction familiale = MIN(plafond ; MAX(impôt brut * taux ; plancher)) selon les parts
--   IR mensuel = MAX(0 ; impôt brut - réduction) / 12
create or replace function public.compute_income_tax(p_monthly_gross numeric, p_parts numeric, p_date date)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_set     public.payroll_settings;
  v_slab    uuid;
  v_annual  numeric;
  v_taxable numeric;
  v_gross_tax numeric := 0;
  v_red     numeric := 0;
  v_parts   numeric;
  r         record;
  v_prev_from numeric;
  v_prev_rate numeric;
begin
  v_set  := public.payroll_settings_at(p_date);
  v_slab := public.tax_slab_at(p_date);
  v_annual := p_monthly_gross * 12;
  v_taxable := trunc(v_annual - least(v_annual * v_set.ir_abatement_rate, v_set.ir_abatement_cap), -3);

  -- barème progressif cumulatif
  v_prev_from := null;
  for r in
    select b.from_amount, b.rate from public.tax_slab_brackets b
    where b.slab_id = v_slab order by b.from_amount
  loop
    if v_prev_from is not null and v_taxable > v_prev_from then
      v_gross_tax := v_gross_tax + (least(v_taxable, r.from_amount) - v_prev_from) * v_prev_rate;
    end if;
    v_prev_from := r.from_amount;
    v_prev_rate := r.rate;
  end loop;
  if v_prev_from is not null and v_taxable > v_prev_from then
    v_gross_tax := v_gross_tax + (v_taxable - v_prev_from) * v_prev_rate;
  end if;

  -- réduction pour charges de famille (parts plafonnées à 5)
  v_parts := least(coalesce(p_parts, 1), 5);
  select least(f.max_amount, greatest(v_gross_tax * f.rate, f.min_amount))
    into v_red
  from public.ir_family_reductions f
  where f.slab_id = v_slab and f.parts = v_parts;
  v_red := coalesce(v_red, 0);

  return jsonb_build_object(
    'annual_gross', v_annual,
    'taxable_income', v_taxable,
    'gross_tax', v_gross_tax,
    'family_reduction', v_red,
    'annual_tax', greatest(0, v_gross_tax - v_red),
    'monthly_tax', greatest(0, v_gross_tax - v_red) / 12
  );
end;
$$;

-- --------------------------------------------------------------------- TRIMF
-- Excel (colonne BG) : seuils sur le brut annuel ; montant x parts TRIMF / 12
-- (sous 600 000 F : 900 F forfaitaires non multipliés par les parts).
create or replace function public.compute_trimf(p_monthly_gross numeric, p_parts numeric, p_date date)
returns numeric
language sql
stable
set search_path = ''
as $$
  select coalesce((
    select case when t.per_part then t.annual_amount * coalesce(p_parts, 1) else t.annual_amount end / 12
    from public.trimf_brackets t
    where t.slab_id = public.tax_slab_at(p_date)
      and p_monthly_gross * 12 >= t.min_annual_gross
    order by t.min_annual_gross desc
    limit 1
  ), 0);
$$;

-- ---------------------------------------- indemnités de licenciement / retraite
-- Excel (colonnes CI et CJ) : coefficient x (salaire de base + sursalaire + prime d'ancienneté)
create or replace function public.severance_coefficient(p_entry date, p_exit date, p_kind text)
returns numeric
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_years numeric;
  y int; m int; d int;
begin
  if p_entry is null or p_exit is null then return 0; end if;
  v_years := (p_exit - p_entry)::numeric / 365;
  y := public.excel_datedif(p_entry, p_exit + 1, 'y');
  m := public.excel_datedif(p_entry, p_exit + 1, 'ym');
  d := public.excel_datedif(p_entry, p_exit + 1, 'md');
  if p_kind = 'LICENCIEMENT' then
    if v_years > 10 then
      return 0.25*5 + 0.30*5 + 0.40*(y-10) + 0.40*m/12.0 + 0.40*d/360.0;
    elsif v_years > 5 then
      return 0.25*5 + 0.30*(y-5) + 0.30*m/12.0 + 0.30*d/360.0;
    elsif v_years >= 0 then
      return 0.25*y + 0.25*m/12.0 + 0.25*d/360.0;
    end if;
  elsif p_kind = 'RETRAITE' then
    if v_years > 20 then
      return 0.25*5 + 0.30*5 + 0.45*10 + 0.50*(y-20) + 0.50*m/12.0 + 0.50*d/360.0;
    elsif v_years > 10 then
      return 0.25*5 + 0.30*5 + 0.45*(y-10) + 0.45*m/12.0 + 0.45*d/360.0;
    elsif v_years > 5 then
      return 0.25*5 + 0.30*(y-5) + 0.30*m/12.0 + 0.30*d/360.0;
    elsif v_years >= 0 then
      return 0.25*y + 0.25*m/12.0 + 0.25*d/360.0;
    end if;
  end if;
  return 0;
end;
$$;

-- =============================================================================
-- compute_salary_slip : calcul pur (aucune écriture). Retourne la trace complète.
-- p_sursalaire permet de simuler un sursalaire (solveur « Net à simuler »).
-- =============================================================================
create or replace function public.compute_salary_slip(
  p_employee_id  uuid,
  p_period_start date,
  p_period_end   date,
  p_sursalaire   numeric default null
)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  s     public.payroll_settings;
  e     public.employees;
  g     public.employee_grades;
  a     public.salary_structure_assignments;
  pi    public.payroll_inputs;
  v_period      date := date_trunc('month', p_period_start)::date;
  v_designation text;
  v_situation   text;
  v_is_work     boolean;
  v_is_presta   boolean;
  v_is_cadre    boolean;
  H             numeric;          -- 173,33
  v_base        numeric;
  v_sursal      numeric;
  v_fees        numeric;
  v_other_fixed numeric;
  v_fixed_sum   numeric;          -- SUM(SALAIRE DE BASE : xxxxxxxx)
  v_th          numeric;          -- TH
  v_anc         integer;          -- ancienneté (années)
  v_abs         numeric; v_sick numeric; v_sick_rate numeric; v_meals numeric;
  v_hs15 numeric; v_hs40 numeric; v_hs60 numeric; v_hs100 numeric; v_hs_total numeric;
  v_prime_anc   numeric;
  v_ret_abs     numeric;
  v_ind_mal     numeric;
  v_var_gross   numeric := 0;
  v_tabaski     numeric := 0;
  v_alloc_conge numeric;
  v_precarite   numeric := 0;
  v_mt15 numeric; v_mt40 numeric; v_mt60 numeric; v_mt100 numeric;
  v_brut        numeric;
  v_ir_detail   jsonb;
  v_ir          numeric := 0;
  v_trimf       numeric := 0;
  v_cfce        numeric := 0;
  v_brs         numeric := 0;
  v_rg_base numeric := 0; v_rg_sal numeric; v_rg_pat numeric;
  v_rc_base numeric := 0; v_rc_sal numeric; v_rc_pat numeric;
  v_css_base numeric := 0; v_af numeric := 0; v_at numeric;
  v_ipm_base numeric; v_ipm_sal numeric; v_ipm_pat numeric;
  v_total_ret   numeric;
  v_charges_pat numeric;
  v_net_rem     numeric;
  v_transport numeric := 0; v_panier numeric; v_km numeric := 0;
  v_licenc numeric := 0; v_retraite numeric := 0;
  v_var_nontax  numeric := 0;
  v_net_ded     numeric := 0;
  v_appoint_prev numeric;
  v_net_pay     numeric;
  v_payroll_cost numeric;
  v_leave_prov  numeric := 0;
  v_lines       jsonb := '[]'::jsonb;
  r             record;
begin
  s := public.payroll_settings_at(p_period_end);
  if s.id is null then
    raise exception 'Aucun paramétrage de paie en vigueur au %', p_period_end;
  end if;
  H := s.monthly_hours;

  select * into e from public.employees where id = p_employee_id;
  if e.id is null then
    raise exception 'Salarié % introuvable', p_employee_id;
  end if;
  select * into g from public.employee_grades where id = e.grade_id;
  select name into v_designation from public.designations where id = e.designation_id;

  select * into a from public.salary_structure_assignments
   where employee_id = e.id and from_date <= p_period_end
   order by from_date desc limit 1;
  if a.id is null then
    raise exception 'Aucune structure salariale affectée à % (%)', e.employee_number, e.last_name;
  end if;

  select * into pi from public.payroll_inputs where employee_id = e.id and period = v_period;

  -- -------------------------------------------------------- situation contrat
  v_situation := case when e.employment_type in ('CDI','CDD') then 'TRAVAIL' else e.employment_type end;
  v_is_work   := v_situation = 'TRAVAIL';
  v_is_presta := v_situation = 'PRESTATION';
  v_is_cadre  := lower(coalesce(g.staff_status, '')) = 'cadres';

  -- ------------------------------------------------------------ éléments fixes
  v_base        := coalesce(a.base_salary, g.base_salary, 0);
  v_sursal      := coalesce(p_sursalaire, a.sursalaire, 0);
  v_fees        := coalesce(a.fees, 0);
  v_other_fixed := coalesce(a.other_fixed, 0);
  v_fixed_sum   := v_base + v_sursal + v_fees + v_other_fixed;
  v_th          := v_fixed_sum / s.hourly_rate_divisor;

  -- ------------------------------------------------------- éléments variables
  v_abs       := coalesce(pi.absence_hours, 0);
  v_sick      := coalesce(pi.sick_leave_hours, 0);
  v_sick_rate := coalesce(pi.sick_leave_rate, 1);
  v_meals     := coalesce(pi.meal_count, 0);
  v_hs15  := coalesce(pi.overtime_15, 0);
  v_hs40  := coalesce(pi.overtime_40, 0);
  v_hs60  := coalesce(pi.overtime_60, 0);
  v_hs100 := coalesce(pi.overtime_100, 0);
  v_hs_total := v_hs15 + v_hs40 + v_hs60 + v_hs100;
  v_alloc_conge  := coalesce(pi.leave_allowance, 0);
  v_appoint_prev := coalesce(pi.previous_rounding, 0);

  -- ancienneté = DATEDIF(date d'entrée ; fin de période + 1 ; "y")
  v_anc := coalesce(public.excel_datedif(e.date_of_joining, p_period_end + 1, 'y'), 0);

  -- PRIME D'ANCIENNETE (AK)
  if v_anc < s.seniority_min_years and v_is_work then
    v_prime_anc := 0;
  else
    v_prime_anc := v_base / H * (H - v_abs + v_hs_total) * v_anc / 100.0;
  end if;

  -- Retenues absences (AL) et indemnité maladie (AM)
  v_ret_abs := - v_fixed_sum / H * v_abs;
  v_ind_mal := v_fixed_sum / H * v_sick * v_sick_rate;

  -- primes variables imposables (AN..AX)
  for r in
    select x.component_code, x.amount
    from public.additional_salaries x
    join public.salary_components c on c.code = x.component_code
    where x.employee_id = e.id and x.period = v_period and c.component_type = 'gross_earning'
  loop
    v_var_gross := v_var_gross + r.amount;
    if r.component_code = 'GRATIF_TABASKI' then v_tabaski := v_tabaski + r.amount; end if;
  end loop;

  -- PRECARITE (AZ) : CDD/COD sortis au plus tard en fin de période
  if e.employment_type in ('CDD','COD') and e.relieving_date is not null and e.relieving_date <= p_period_end then
    v_precarite := (v_fixed_sum + v_prime_anc + v_tabaski)
                   * coalesce(public.excel_datedif(e.date_of_joining, e.relieving_date, 'm'), 0)
                   * s.precarity_rate;
  end if;

  -- Heures supplémentaires (BA..BD)
  v_mt15  := v_hs15  * v_th * 1.15;
  v_mt40  := v_hs40  * v_th * 1.40;
  v_mt60  := v_hs60  * v_th * 1.60;
  v_mt100 := v_hs100 * v_th * 2.00;

  -- BRUT (BE) = SOMME(SALAIRE DE BASE : MT HS200%)
  v_brut := v_fixed_sum + v_prime_anc + v_ret_abs + v_ind_mal + v_var_gross
          + v_alloc_conge + v_precarite + v_mt15 + v_mt40 + v_mt60 + v_mt100;

  -- ----------------------------------------------------- impôts et cotisations
  if v_is_work then
    v_ir_detail := public.compute_income_tax(v_brut, e.ir_parts, p_period_end);
    v_ir    := (v_ir_detail->>'monthly_tax')::numeric;
    v_trimf := public.compute_trimf(v_brut, e.trimf_parts, p_period_end);
    v_cfce  := v_brut * s.cfce_rate;
    v_rg_base := least(v_brut, s.ipres_rg_ceiling);
    if v_is_cadre then
      v_rc_base := least(v_brut, s.ipres_rc_ceiling);
    end if;
  end if;
  if v_is_presta then
    v_brs := v_brut * s.brs_rate;
  end if;

  v_rg_sal := v_rg_base * s.ipres_rg_rate * s.ipres_rg_employee_share;
  v_rg_pat := v_rg_base * s.ipres_rg_rate * (1 - s.ipres_rg_employee_share);
  v_rc_sal := v_rc_base * s.ipres_rc_rate * s.ipres_rc_employee_share;
  v_rc_pat := v_rc_base * s.ipres_rc_rate * (1 - s.ipres_rc_employee_share);

  if not v_is_presta then
    v_css_base := least(v_brut, s.css_ceiling);
  end if;
  if v_is_work then
    v_af := v_css_base * s.css_af_rate;
  end if;
  v_at := v_css_base * s.css_at_rate;

  v_ipm_base := least(v_brut, s.ipm_ceiling);
  v_ipm_sal  := v_ipm_base * s.ipm_rate * s.ipm_employee_share;
  v_ipm_pat  := v_ipm_base * s.ipm_rate * (1 - s.ipm_employee_share);

  v_total_ret   := v_ir + v_trimf + v_brs + v_rg_sal + v_rc_sal + v_ipm_sal;      -- CB
  v_charges_pat := v_cfce + v_rg_pat + v_rc_pat + v_af + v_at + v_ipm_pat;        -- CC
  v_net_rem     := v_brut - v_total_ret;                                          -- CE

  -- ------------------------------------------------ indemnités non imposables
  if a.transport_mode = 'Prime de transport' then
    v_transport := (s.transport_allowance / H) * (H - (v_abs / 8));
  elsif a.transport_mode = 'Indemnité kilométrique' then
    v_km := (s.km_allowance / H) * (H - (v_abs / 8));
  end if;
  v_panier := v_meals * s.smig_hourly * s.meal_allowance_factor;

  if e.employment_type = 'CDI' and e.relieving_date is not null and e.relieving_date <= p_period_end then
    if e.exit_reason = 'LICENCIEMENT' then
      v_licenc := public.severance_coefficient(e.date_of_joining, e.relieving_date, 'LICENCIEMENT')
                  * (v_base + v_sursal + v_prime_anc);
    elsif e.exit_reason = 'RETRAITE' then
      v_retraite := public.severance_coefficient(e.date_of_joining, e.relieving_date, 'RETRAITE')
                    * (v_base + v_sursal + v_prime_anc);
    end if;
  end if;

  select coalesce(sum(x.amount) filter (where c.component_type = 'non_taxable_earning'), 0),
         coalesce(sum(x.amount) filter (where c.component_type = 'net_deduction'), 0)
    into v_var_nontax, v_net_ded
  from public.additional_salaries x
  join public.salary_components c on c.code = x.component_code
  where x.employee_id = e.id and x.period = v_period;

  -- NET A PAYER (CS = CT)
  v_net_pay := v_net_rem + v_transport + v_panier + v_km + v_licenc + v_retraite
             + v_var_nontax - v_net_ded + v_appoint_prev;

  -- MASSE SALARIALE (CY)
  v_payroll_cost := v_brut + v_charges_pat + v_transport + v_panier + v_km + v_licenc
                  + v_retraite + v_var_nontax + v_appoint_prev;

  -- PROVISION CONGE du mois (DD)
  if v_is_work and not a.leave_paid_monthly then
    v_leave_prov := v_brut / 12;
  end if;

  -- ------------------------------------------------- lignes du bulletin
  v_lines := v_lines || jsonb_build_array(
    jsonb_build_object('code','SAL_BASE','label','Salaire de base','section','gain','sort',10,
      'base', v_base / H, 'quantity', H, 'rate', 1, 'gain', v_base),
    jsonb_build_object('code','SURSALAIRE','label','Sursalaire','section','gain','sort',11,
      'base', v_sursal / H, 'quantity', H, 'rate', 1, 'gain', v_sursal),
    jsonb_build_object('code','PRIME_ANC','label','Prime d''ancienneté','section','gain','sort',12,
      'base', v_base / H, 'quantity', H - v_abs + v_hs_total,
      'rate', case when v_prime_anc = 0 then 0 else v_anc / 100.0 end, 'gain', v_prime_anc)
  );
  if v_fees <> 0 then
    v_lines := v_lines || jsonb_build_object('code','HONORAIRES','label','Honoraires prestataires',
      'section','gain','sort',13,'gain', v_fees);
  end if;
  if v_other_fixed <> 0 then
    v_lines := v_lines || jsonb_build_object('code','AUTRE_FIXE','label','Autre élément fixe',
      'section','gain','sort',14,'gain', v_other_fixed);
  end if;
  if v_abs <> 0 then
    v_lines := v_lines || jsonb_build_object('code','RET_ABSENCE','label','Retenues absences',
      'section','gain','sort',15,'base', v_fixed_sum / H,'quantity', v_abs,'rate',1,'gain', v_ret_abs);
  end if;
  for r in
    select x.component_code, x.amount, c.name, coalesce(c.rubric_number, 21) as rn
    from public.additional_salaries x
    join public.salary_components c on c.code = x.component_code
    where x.employee_id = e.id and x.period = v_period and c.component_type = 'gross_earning'
    order by c.rubric_number nulls last, c.code
  loop
    v_lines := v_lines || jsonb_build_object('code', r.component_code, 'label', r.name,
      'section','gain','sort', r.rn, 'gain', r.amount);
  end loop;
  if v_sick <> 0 then
    v_lines := v_lines || jsonb_build_object('code','IND_MALADIE','label','Indemnité de maladie',
      'section','gain','sort',22,'base', v_fixed_sum / H,'quantity', v_sick,'rate', v_sick_rate,'gain', v_ind_mal);
  end if;
  if v_alloc_conge <> 0 then
    v_lines := v_lines || jsonb_build_object('code','ALLOC_CONGE','label','Allocation congé',
      'section','gain','sort',23,'base', v_alloc_conge * 12,'quantity', 1/12.0,'rate',1,'gain', v_alloc_conge);
  end if;
  if v_precarite <> 0 then
    v_lines := v_lines || jsonb_build_object('code','IND_PRECARITE','label','Indemnité de fin de contrat',
      'section','gain','sort',24,'base', v_precarite / s.precarity_rate,'quantity',1,'rate', s.precarity_rate,'gain', v_precarite);
  end if;
  if v_hs15 <> 0 then
    v_lines := v_lines || jsonb_build_object('code','HS_15','label','Heures sup. majorées à 15%',
      'section','gain','sort',25,'base', v_th,'quantity', v_hs15,'rate',1.15,'gain', v_mt15);
  end if;
  if v_hs40 <> 0 then
    v_lines := v_lines || jsonb_build_object('code','HS_40','label','Heures sup. majorées à 40%',
      'section','gain','sort',26,'base', v_th,'quantity', v_hs40,'rate',1.40,'gain', v_mt40);
  end if;
  if v_hs60 <> 0 then
    v_lines := v_lines || jsonb_build_object('code','HS_60','label','Heures sup. majorées à 60%',
      'section','gain','sort',27,'base', v_th,'quantity', v_hs60,'rate',1.60,'gain', v_mt60);
  end if;
  if v_hs100 <> 0 then
    v_lines := v_lines || jsonb_build_object('code','HS_100','label','Heures sup. majorées à 100%',
      'section','gain','sort',28,'base', v_th,'quantity', v_hs100,'rate',2.00,'gain', v_mt100);
  end if;

  v_lines := v_lines || jsonb_build_array(
    jsonb_build_object('code','IR','label','Impôt sur le revenu','section','retenue','sort',51,
      'base', v_brut, 'quantity', e.ir_parts, 'deduction', v_ir),
    jsonb_build_object('code','TRIMF','label','Retenue TRIMF','section','retenue','sort',52,
      'base', v_brut, 'quantity', e.trimf_parts, 'deduction', v_trimf),
    jsonb_build_object('code','IPRES_RG','label','IPRES Régime Général','section','retenue','sort',53,
      'base', v_rg_base, 'rate', s.ipres_rg_rate * s.ipres_rg_employee_share, 'deduction', v_rg_sal,
      'employer_rate', s.ipres_rg_rate * (1 - s.ipres_rg_employee_share), 'employer', v_rg_pat),
    jsonb_build_object('code','IPRES_RC','label','IPRES Régime C. Cadre','section','retenue','sort',54,
      'base', v_rc_base,
      'rate', case when v_rc_base = 0 then null else s.ipres_rc_rate * s.ipres_rc_employee_share end,
      'deduction', v_rc_sal,
      'employer_rate', case when v_rc_base = 0 then null else s.ipres_rc_rate * (1 - s.ipres_rc_employee_share) end,
      'employer', v_rc_pat),
    jsonb_build_object('code','IPM','label','Cotisations IPM','section','retenue','sort',55,
      'base', v_ipm_base, 'rate', s.ipm_rate * s.ipm_employee_share, 'deduction', v_ipm_sal,
      'employer_rate', s.ipm_rate * (1 - s.ipm_employee_share), 'employer', v_ipm_pat)
  );
  if v_brs <> 0 then
    v_lines := v_lines || jsonb_build_object('code','BRS','label','BRS (5%)','section','retenue','sort',56,
      'base', v_brut, 'rate', s.brs_rate, 'deduction', v_brs);
  end if;
  v_lines := v_lines || jsonb_build_array(
    jsonb_build_object('code','CSS_AF','label','CSS - Allocations familiales','section','patronal','sort',57,
      'base', v_css_base, 'employer_rate', s.css_af_rate, 'employer', v_af),
    jsonb_build_object('code','CSS_AT','label','CSS - Accident de travail','section','patronal','sort',58,
      'base', v_css_base, 'employer_rate', s.css_at_rate, 'employer', v_at),
    jsonb_build_object('code','CFCE','label','CFCE','section','patronal','sort',59,
      'base', v_brut, 'employer_rate', s.cfce_rate, 'employer', v_cfce)
  );

  if v_transport <> 0 then
    v_lines := v_lines || jsonb_build_object('code','IND_TRANSPORT','label','Indemnité de transport',
      'section','indemnite','sort',70,'base', s.transport_allowance / H,'quantity', H - v_abs / 8,'rate',1,'gain', v_transport);
  end if;
  if v_panier <> 0 then
    v_lines := v_lines || jsonb_build_object('code','IND_PANIER','label','Indemnité de panier',
      'section','indemnite','sort',71,'base', s.smig_hourly * s.meal_allowance_factor,'quantity', v_meals,'rate',1,'gain', v_panier);
  end if;
  if v_km <> 0 then
    v_lines := v_lines || jsonb_build_object('code','IND_KM','label','Indemnité kilométrique',
      'section','indemnite','sort',72,'base', s.km_allowance / H,'quantity', H - v_abs / 8,'rate',1,'gain', v_km);
  end if;
  if v_licenc <> 0 then
    v_lines := v_lines || jsonb_build_object('code','IND_LICENCIEMENT','label','Indemnité de licenciement',
      'section','indemnite','sort',73,'gain', v_licenc);
  end if;
  if v_retraite <> 0 then
    v_lines := v_lines || jsonb_build_object('code','IND_RETRAITE','label','Indemnité de départ à la retraite',
      'section','indemnite','sort',74,'gain', v_retraite);
  end if;
  for r in
    select x.component_code, x.amount, c.name, c.component_type, coalesce(c.rubric_number, 79) as rn
    from public.additional_salaries x
    join public.salary_components c on c.code = x.component_code
    where x.employee_id = e.id and x.period = v_period
      and c.component_type in ('non_taxable_earning','net_deduction')
    order by c.rubric_number nulls last, c.code
  loop
    if r.component_type = 'non_taxable_earning' then
      v_lines := v_lines || jsonb_build_object('code', r.component_code, 'label', r.name,
        'section','indemnite','sort', r.rn, 'gain', r.amount);
    else
      v_lines := v_lines || jsonb_build_object('code', r.component_code, 'label', r.name,
        'section','retenue_net','sort', r.rn, 'deduction', r.amount);
    end if;
  end loop;
  if v_appoint_prev <> 0 then
    v_lines := v_lines || jsonb_build_object('code','APPOINT_PREC','label','Appoint du mois précédent',
      'section','appoint','sort',81,'gain', v_appoint_prev);
  end if;

  return jsonb_build_object(
    'employee', jsonb_build_object(
      'id', e.id, 'employee_number', e.employee_number,
      'name', upper(trim(e.first_name) || ' ' || trim(e.last_name)),
      'designation', v_designation, 'address', e.address,
      'grade_code', g.code, 'grade_class', g.grade_class, 'staff_status', g.staff_status,
      'employment_type', e.employment_type, 'contract_situation', v_situation,
      'date_of_joining', e.date_of_joining,
      'seniority_years', coalesce(public.excel_datedif(e.date_of_joining, p_period_end, 'y'), 0),
      'seniority_months', coalesce(public.excel_datedif(e.date_of_joining, p_period_end + 1, 'ym'), 0),
      'seniority_for_bonus', v_anc,
      'marital_status', e.marital_status, 'spouses_count', e.spouses_count,
      'children_count', e.children_count, 'trimf_parts', e.trimf_parts, 'ir_parts', e.ir_parts,
      'payment_mode', e.payment_mode),
    'period', jsonb_build_object('start', p_period_start, 'end', p_period_end),
    'inputs', jsonb_build_object(
      'base_salary', v_base, 'sursalaire', v_sursal, 'fees', v_fees, 'other_fixed', v_other_fixed,
      'absence_hours', v_abs, 'sick_leave_hours', v_sick, 'sick_leave_rate', v_sick_rate,
      'meal_count', v_meals, 'overtime_15', v_hs15, 'overtime_40', v_hs40,
      'overtime_60', v_hs60, 'overtime_100', v_hs100, 'leave_allowance', v_alloc_conge,
      'previous_rounding', v_appoint_prev, 'transport_mode', a.transport_mode,
      'leave_paid_monthly', a.leave_paid_monthly, 'target_net', a.target_net),
    'lines', v_lines,
    'income_tax_detail', v_ir_detail,
    'totals', jsonb_build_object(
      'hourly_rate', v_th,
      'fixed_sum', v_fixed_sum,
      'seniority_bonus', v_prime_anc,
      'absence_deduction', v_ret_abs,
      'sick_allowance', v_ind_mal,
      'variable_gross', v_var_gross,
      'leave_allowance', v_alloc_conge,
      'precarity_allowance', v_precarite,
      'overtime_amount', v_mt15 + v_mt40 + v_mt60 + v_mt100,
      'gross_pay', v_brut,
      'income_tax', v_ir,
      'trimf', v_trimf,
      'cfce', v_cfce,
      'brs', v_brs,
      'ipres_rg_base', v_rg_base, 'ipres_rg_employee', v_rg_sal, 'ipres_rg_employer', v_rg_pat,
      'ipres_rc_base', v_rc_base, 'ipres_rc_employee', v_rc_sal, 'ipres_rc_employer', v_rc_pat,
      'css_base', v_css_base, 'css_af', v_af, 'css_at', v_at,
      'ipm_base', v_ipm_base, 'ipm_employee', v_ipm_sal, 'ipm_employer', v_ipm_pat,
      'total_employee_deductions', v_total_ret,
      'employer_charges', v_charges_pat,
      'total_contributions', v_total_ret + v_charges_pat,
      'net_remuneration', v_net_rem,
      'transport_allowance', v_transport,
      'meal_allowance', v_panier,
      'km_allowance', v_km,
      'severance_pay', v_licenc,
      'retirement_pay', v_retraite,
      'total_non_taxable', v_transport + v_panier + v_km + v_licenc + v_retraite + v_var_nontax,
      'total_net_deductions', v_net_ded,
      'previous_rounding', v_appoint_prev,
      'net_pay', v_net_pay,
      'payroll_cost', v_payroll_cost,
      'leave_provision', v_leave_prov)
  );
end;
$$;

-- =============================================================================
-- Solveur « Net à simuler » : équivalent de la macro VBA Valeur_Cible
-- (GoalSeek de la colonne net réel en faisant varier SURSALAIRE).
-- =============================================================================
create or replace function public.solve_sursalaire_for_net(
  p_employee_id  uuid,
  p_period_start date,
  p_period_end   date,
  p_target_net   numeric
)
returns numeric
language plpgsql
stable
set search_path = ''
as $$
declare
  lo numeric := 0;
  hi numeric;
  mid numeric;
  v_net numeric;
  i int;
begin
  if p_target_net is null or p_target_net <= 0 then
    raise exception 'Net cible invalide';
  end if;
  v_net := (public.compute_salary_slip(p_employee_id, p_period_start, p_period_end, 0)->'totals'->>'net_pay')::numeric;
  if v_net >= p_target_net then
    return 0;   -- le net sans sursalaire atteint déjà la cible
  end if;
  hi := p_target_net * 4 + 1000000;
  for i in 1..200 loop
    mid := (lo + hi) / 2;
    v_net := (public.compute_salary_slip(p_employee_id, p_period_start, p_period_end, mid)->'totals'->>'net_pay')::numeric;
    if abs(v_net - p_target_net) < 0.000001 then
      return mid;
    elsif v_net < p_target_net then
      lo := mid;
    else
      hi := mid;
    end if;
  end loop;
  return mid;
end;
$$;

-- =============================================================================
-- calculate_salary_slip : calcule et enregistre (brouillon) un bulletin.
-- =============================================================================
create or replace function public.calculate_salary_slip(
  p_employee_id      uuid,
  p_period_start     date,
  p_period_end       date,
  p_payroll_entry_id uuid default null
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_calc jsonb;
  v_emp  jsonb;
  v_tot  jsonb;
  v_id   uuid;
  l      jsonb;
begin
  if not public.has_role(array['paie']) then
    raise exception 'Droits insuffisants : rôle « paie » requis';
  end if;

  if exists (select 1 from public.salary_slips
             where employee_id = p_employee_id and period_start = p_period_start and status = 'Validé') then
    raise exception 'Un bulletin validé existe déjà pour cette période';
  end if;

  v_calc := public.compute_salary_slip(p_employee_id, p_period_start, p_period_end);
  v_emp  := v_calc->'employee';
  v_tot  := v_calc->'totals';

  delete from public.salary_slips
   where employee_id = p_employee_id and period_start = p_period_start and status = 'Brouillon';

  insert into public.salary_slips (
    payroll_entry_id, employee_id, period_start, period_end, status,
    employee_number, employee_name, designation, address, grade_code, grade_class, staff_status,
    employment_type, contract_situation, date_of_joining, seniority_years, seniority_months,
    marital_status, spouses_count, children_count, trimf_parts, ir_parts, payment_mode, hourly_rate,
    gross_pay, income_tax, trimf, total_employee_deductions, net_remuneration, total_non_taxable,
    total_net_deductions, net_pay, employer_charges, payroll_cost,
    ipres_rg_base, ipres_rc_base, css_base, ipm_base, leave_provision, calculation)
  values (
    p_payroll_entry_id, p_employee_id, p_period_start, p_period_end, 'Brouillon',
    v_emp->>'employee_number', v_emp->>'name', v_emp->>'designation', v_emp->>'address',
    v_emp->>'grade_code', v_emp->>'grade_class', v_emp->>'staff_status',
    v_emp->>'employment_type', v_emp->>'contract_situation', (v_emp->>'date_of_joining')::date,
    (v_emp->>'seniority_years')::int, (v_emp->>'seniority_months')::int,
    v_emp->>'marital_status', (v_emp->>'spouses_count')::smallint, (v_emp->>'children_count')::smallint,
    (v_emp->>'trimf_parts')::numeric, (v_emp->>'ir_parts')::numeric, v_emp->>'payment_mode',
    (v_tot->>'hourly_rate')::numeric,
    (v_tot->>'gross_pay')::numeric, (v_tot->>'income_tax')::numeric, (v_tot->>'trimf')::numeric,
    (v_tot->>'total_employee_deductions')::numeric, (v_tot->>'net_remuneration')::numeric,
    (v_tot->>'total_non_taxable')::numeric, (v_tot->>'total_net_deductions')::numeric,
    (v_tot->>'net_pay')::numeric, (v_tot->>'employer_charges')::numeric, (v_tot->>'payroll_cost')::numeric,
    (v_tot->>'ipres_rg_base')::numeric, (v_tot->>'ipres_rc_base')::numeric,
    (v_tot->>'css_base')::numeric, (v_tot->>'ipm_base')::numeric, (v_tot->>'leave_provision')::numeric,
    v_calc)
  returning id into v_id;

  for l in select * from jsonb_array_elements(v_calc->'lines')
  loop
    insert into public.salary_slip_details (
      salary_slip_id, component_code, label, section, sort_order, base, quantity, employee_rate,
      gain_amount, deduction_amount, employer_rate, employer_amount)
    values (
      v_id, l->>'code', l->>'label', l->>'section', (l->>'sort')::int,
      (l->>'base')::numeric, (l->>'quantity')::numeric, (l->>'rate')::numeric,
      coalesce((l->>'gain')::numeric, 0), coalesce((l->>'deduction')::numeric, 0),
      (l->>'employer_rate')::numeric, coalesce((l->>'employer')::numeric, 0));
  end loop;

  return v_id;
end;
$$;

-- =============================================================================
-- Traitement par lot (Frappe: Payroll Entry)
-- =============================================================================
create or replace function public.run_payroll_entry(p_payroll_entry_id uuid)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  pe       public.payroll_entries;
  emp      record;
  v_done   int := 0;
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
  return jsonb_build_object('calculated', v_done, 'errors', v_errors);
end;
$$;

create or replace function public.submit_payroll_entry(p_payroll_entry_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if not public.has_role(array['paie']) then
    raise exception 'Droits insuffisants : rôle « paie » requis';
  end if;
  update public.payroll_entries
     set status = 'Validée', submitted_by = (select auth.uid()), submitted_at = now()
   where id = p_payroll_entry_id and status = 'Calculée';
  if not found then
    raise exception 'Seul un traitement « Calculée » peut être validé';
  end if;
  update public.salary_slips set status = 'Validé'
   where payroll_entry_id = p_payroll_entry_id and status = 'Brouillon';
end;
$$;

create or replace function public.cancel_payroll_entry(p_payroll_entry_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if not public.has_role(array['admin']) then
    raise exception 'Seul un administrateur peut annuler un traitement';
  end if;
  update public.salary_slips set status = 'Annulé' where payroll_entry_id = p_payroll_entry_id;
  update public.payroll_entries set status = 'Annulée' where id = p_payroll_entry_id;
end;
$$;

-- =============================================================================
-- Présences -> variables de paie (heures d'absence, maladie, HS)
-- =============================================================================
create or replace function public.sync_attendance_to_payroll_inputs(p_period date)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_start date := date_trunc('month', p_period)::date;
  v_end   date := (date_trunc('month', p_period) + interval '1 month - 1 day')::date;
  v_count int;
begin
  if not public.has_role(array['paie']) then
    raise exception 'Droits insuffisants : rôle « paie » requis';
  end if;
  insert into public.payroll_inputs as pi
    (employee_id, period, absence_hours, sick_leave_hours, overtime_15, overtime_40, overtime_60, overtime_100)
  select a.employee_id, v_start,
         sum(case when a.status in ('Absent','Demi-journée') then a.absence_hours else 0 end),
         sum(case when a.status = 'Maladie' then a.absence_hours else 0 end),
         sum(a.overtime_15), sum(a.overtime_40), sum(a.overtime_60), sum(a.overtime_100)
  from public.attendance a
  where a.attendance_date between v_start and v_end
  group by a.employee_id
  on conflict (employee_id, period) do update
    set absence_hours    = excluded.absence_hours,
        sick_leave_hours = excluded.sick_leave_hours,
        overtime_15      = excluded.overtime_15,
        overtime_40      = excluded.overtime_40,
        overtime_60      = excluded.overtime_60,
        overtime_100     = excluded.overtime_100;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ----------------------------------------------------------------- privilèges
revoke execute on function public.compute_salary_slip(uuid, date, date, numeric) from public, anon;
revoke execute on function public.solve_sursalaire_for_net(uuid, date, date, numeric) from public, anon;
revoke execute on function public.calculate_salary_slip(uuid, date, date, uuid) from public, anon;
revoke execute on function public.run_payroll_entry(uuid) from public, anon;
revoke execute on function public.submit_payroll_entry(uuid) from public, anon;
revoke execute on function public.cancel_payroll_entry(uuid) from public, anon;
revoke execute on function public.sync_attendance_to_payroll_inputs(date) from public, anon;
revoke execute on function public.compute_income_tax(numeric, numeric, date) from public, anon;
revoke execute on function public.compute_trimf(numeric, numeric, date) from public, anon;
grant execute on function public.compute_salary_slip(uuid, date, date, numeric) to authenticated;
grant execute on function public.solve_sursalaire_for_net(uuid, date, date, numeric) to authenticated;
grant execute on function public.calculate_salary_slip(uuid, date, date, uuid) to authenticated;
grant execute on function public.run_payroll_entry(uuid) to authenticated;
grant execute on function public.submit_payroll_entry(uuid) to authenticated;
grant execute on function public.cancel_payroll_entry(uuid) to authenticated;
grant execute on function public.sync_attendance_to_payroll_inputs(date) to authenticated;
grant execute on function public.compute_income_tax(numeric, numeric, date) to authenticated;
grant execute on function public.compute_trimf(numeric, numeric, date) to authenticated;
