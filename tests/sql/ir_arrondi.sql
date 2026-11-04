-- D-006b : la base imposable de l'IR est arrondie au millier inférieur du montant EXACT.
-- Un brut de 609 000 F porté à 609 000 - 4e-16 par le bruit numérique doit donner la même base que 609 000.
begin;
do $$
declare exact_ jsonb; bruit jsonb;
begin
  exact_ := public.compute_income_tax(609000, 4, date '2026-10-31');
  bruit  := public.compute_income_tax(609000 - 0.0000000000000004, 4, date '2026-10-31');
  if (exact_->>'taxable_income')::numeric <> 6408000 then
    raise exception 'FAIL : base attendue 6 408 000 (brut 609 000 x 12 - 900 000), obtenue %', exact_->>'taxable_income'; end if;
  if bruit->>'taxable_income' is distinct from exact_->>'taxable_income' then
    raise exception 'FAIL : le bruit numérique abaisse la base de % à %', exact_->>'taxable_income', bruit->>'taxable_income'; end if;
  raise notice 'OK ir_arrondi';
end $$;
rollback;
