-- T-I14 / RL-018 : les paramètres légaux sont lus à la date de fin de période (payroll_settings_at).
-- Un taux changé au 1er décembre 2026 ne touche pas novembre et s'applique à décembre.
-- Transaction annulée : aucune donnée conservée.
begin;
do $$
declare e uuid; s public.payroll_settings; nov jsonb; dec_ jsonb; avant jsonb;
begin
  select id into e from public.employees where employee_number = 'QA0003';
  if e is null then raise exception 'FAIL : chargez d''abord un scénario (scripts/qa-reset-scenario.ps1)'; end if;
  select * into s from public.payroll_settings_at(date '2026-11-30');
  avant := public.compute_salary_slip(e, date '2026-11-01', date '2026-11-30', 0);

  insert into public.payroll_settings select (jsonb_populate_record(s, jsonb_build_object(
      'id', gen_random_uuid(), 'effective_from', date '2026-12-01', 'cfce_rate', 0.05, 'css_af_rate', 0.08))).*;

  nov  := public.compute_salary_slip(e, date '2026-11-01', date '2026-11-30', 0);
  dec_ := public.compute_salary_slip(e, date '2026-12-01', date '2026-12-31', 0);

  if nov->'totals'->>'css_af' is null or dec_->'totals'->>'css_af' is null then raise exception 'FAIL : css_af absent du résultat (test non significatif)'; end if;
  if nov is distinct from avant then raise exception 'FAIL : novembre modifié par un taux daté de décembre'; end if;
  if (dec_->'totals'->>'css_af')::numeric = (nov->'totals'->>'css_af')::numeric then
    raise exception 'FAIL : le nouveau taux d''allocations familiales n''est pas appliqué en décembre (% = %)', dec_->'totals'->>'css_af', nov->'totals'->>'css_af';
  end if;
  if (dec_->'totals'->>'css_af')::numeric <> round((nov->'totals'->>'css_base')::numeric * 0.08, 2) then
    raise exception 'FAIL : css_af décembre = %, attendu base x 8 %%', dec_->'totals'->>'css_af';
  end if;
  raise notice 'OK settings_dated (css_af nov % -> déc %)', nov->'totals'->>'css_af', dec_->'totals'->>'css_af';
end $$;
rollback;
