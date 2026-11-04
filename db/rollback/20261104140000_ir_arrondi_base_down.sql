-- Rollback : restaure compute_income_tax avant correction D-006b (arrondi de la base).
CREATE OR REPLACE FUNCTION public.compute_income_tax(p_monthly_gross numeric, p_parts numeric, p_date date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
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
$function$

;
