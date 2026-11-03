-- L2-06 : propriétés des prêts, régularisations et récurrences (T-I6, T-I7, T-I19, T-I20).
-- Usage : psql -v ON_ERROR_STOP=1 -f tests/sql/l2_adjustments.sql  (attendu : "OK l2_adjustments")
-- Les comptes et le salarié sont pris dans la base ; aucun identifiant n'est écrit ici. Tout est annulé.
begin;

create temp table t_ctx as
select
  (select user_id from public.user_roles where role = 'paie' and user_id not in (select user_id from public.user_roles where role = 'admin') order by user_id limit 1) as user_paie,
  (select e.id from public.employees e where e.status = 'Active'
     and exists (select 1 from public.salary_structure_assignments a where a.employee_id = e.id)
   order by e.employee_number limit 1) as emp,
  (select company_id from public.payroll_entries limit 1) as company;
grant select on t_ctx to authenticated;
-- isolement : les prêts réels de la base ne doivent pas interférer avec le test (annulé en fin de transaction)
update public.loan_installments set status = 'Annulée' where status = 'Prévue';
update public.loans set status = 'Annulé' where status <> 'Annulé';

create or replace function pg_temp.slip(p_entry uuid, p_emp uuid, p_col text) returns numeric language plpgsql as $$
declare v numeric;
begin
  execute format('select %I from public.salary_slips where payroll_entry_id = $1 and employee_id = $2 and status <> ''Annulé''', p_col)
    into v using p_entry, p_emp;
  return v;
end $$;

do $$
declare
  c t_ctx; e_dec uuid; e_jan uuid; loan uuid; pair record;
  n0 numeric; n1 numeric; n2 numeric; g0 numeric; g1 numeric; cnt int; a0 int; a1 int;
  aug_before numeric; aug_after numeric; v_src date;
begin
  select * into c from t_ctx;
  select period_start into v_src from public.payroll_entries where status in ('Validée', 'Payée', 'Clôturée') order by period_start desc limit 1;
  if v_src is null then raise exception 'aucun mois validé pour le test'; end if;
  if c.user_paie is null or c.emp is null or c.company is null then raise exception 'jeu de données insuffisant'; end if;

  insert into public.payroll_entries (company_id, period_start, period_end, status) values (c.company, '2026-12-01', '2026-12-31', 'Brouillon') returning id into e_dec;
  insert into public.payroll_entries (company_id, period_start, period_end, status) values (c.company, '2027-01-01', '2027-01-31', 'Brouillon') returning id into e_jan;

  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', c.user_paie::text, true);

  -- T-I20 : somme des échéances = capital, nombre exact, montants entiers > 0, pour des cas limites
  for pair in select * from (values (100000, 3), (100001, 7), (7, 7), (999999, 60), (1, 1), (250000, 12)) as t(p, n) loop
    loan := public.create_loan(c.emp, 'Test propriété', pair.p, pair.n, '2026-12-01');
    select count(*), sum(amount) into cnt, n0 from public.loan_installments where loan_id = loan;
    if cnt <> pair.n or n0 <> pair.p then raise exception 'T-I20 : prêt % en % échéances -> % échéances, somme %', pair.p, pair.n, cnt, n0; end if;
    if exists (select 1 from public.loan_installments where loan_id = loan and (amount <= 0 or amount <> round(amount))) then
      raise exception 'T-I20 : échéance non entière ou non positive pour % en %', pair.p, pair.n;
    end if;
    perform public.cancel_loan(loan, 'nettoyage du test');
  end loop;
  begin
    perform public.create_loan(c.emp, 'trop petit', 3, 5, '2026-12-01');
    raise exception 'prêt inférieur au nombre d''échéances accepté';
  exception when others then
    if sqlerrm not like '%au moins égal au nombre d''échéances%' then raise; end if;
  end;
  begin
    perform public.create_loan(c.emp, 'mois validé', 30000, 3, v_src);
    raise exception 'prêt démarrant dans un mois validé accepté';
  exception when others then
    if sqlerrm not like '%déjà validée%' then raise; end if;
  end;

  -- T-I7 / T-I19 : le prêt est retenu par le chemin unique, et un recalcul ne change rien
  perform public.run_payroll_entry(e_dec);
  n0 := pg_temp.slip(e_dec, c.emp, 'net_pay');
  loan := public.create_loan(c.emp, 'Prêt de test', 30000, 3, '2026-12-01');
  perform public.run_payroll_entry(e_dec);
  n1 := pg_temp.slip(e_dec, c.emp, 'net_pay');
  if n0 - n1 <> 10000 then raise exception 'T-I7 : la retenue de prêt attendue est 10000, écart de net = %', n0 - n1; end if;
  select count(*) into cnt from public.additional_salaries where employee_id = c.emp and period = '2026-12-01' and component_code = 'RET_PRET' and amount = 10000 and kind = 'pret';
  if cnt <> 1 then raise exception 'T-I7 : ligne RET_PRET attendue une fois, trouvée % fois', cnt; end if;

  select count(*) into a0 from public.audit_log where table_name = 'additional_salaries';
  perform public.run_payroll_entry(e_dec);
  n2 := pg_temp.slip(e_dec, c.emp, 'net_pay');
  select count(*) into a1 from public.audit_log where table_name = 'additional_salaries';
  if n2 <> n1 then raise exception 'T-I19 : le recalcul change le net (% -> %)', n1, n2; end if;
  if a1 <> a0 then raise exception 'T-I19 : un recalcul à l''identique écrit % ligne(s) d''audit', a1 - a0; end if;
-- dernière échéance d'un prêt : appliquée au premier calcul, toujours retenue au recalcul (prêt « Soldé »)  perform public.create_loan(c.emp, 'Prêt en une échéance', 5000, 1, '2026-12-01');  perform public.run_payroll_entry(e_dec);  n1 := pg_temp.slip(e_dec, c.emp, 'net_pay');  perform public.run_payroll_entry(e_dec);  n2 := pg_temp.slip(e_dec, c.emp, 'net_pay');  if n1 <> n2 then raise exception 'T-I19 : le recalcul perd la dernière échéance (% -> %)', n1, n2; end if;  if (select amount from public.additional_salaries where employee_id = c.emp and period = '2026-12-01' and component_code = 'RET_PRET') <> 15000 then    raise exception 'T-I19 : retenue attendue 15000 (10000 + 5000), trouvée autre';  end if;

  -- T-I6 : une correction sur un mois validé n'altère pas ce mois et s'applique à la période ouverte
  select sum(s.net_pay) into aug_before from public.salary_slips s join public.payroll_entries p on p.id = s.payroll_entry_id
   where p.period_start = v_src and s.status <> 'Annulé';
  g0 := pg_temp.slip(e_dec, c.emp, 'gross_pay');
  perform public.create_payroll_correction(c.emp, v_src, 'gain', 25000, 'Test de régularisation');
  begin
    perform public.create_payroll_correction(c.emp, '2026-12-01', 'gain', 1000, 'mois non validé');
    raise exception 'régularisation acceptée sur un mois non validé';
  exception when others then
    if sqlerrm not like '%pas encore validée%' then raise; end if;
  end;
  perform public.run_payroll_entry(e_dec);
  g1 := pg_temp.slip(e_dec, c.emp, 'gross_pay');
  if g1 <= g0 then raise exception 'T-I6 : la régularisation n''a pas augmenté le brut (% -> %)', g0, g1; end if;
  select count(*) into cnt from public.additional_salaries where employee_id = c.emp and period = '2026-12-01' and component_code = 'REGUL_BRUT' and amount = 25000 and kind = 'regularisation';
  if cnt <> 1 then raise exception 'T-I6 : ligne REGUL_BRUT attendue une fois, trouvée %', cnt; end if;
  select sum(s.net_pay) into aug_after from public.salary_slips s join public.payroll_entries p on p.id = s.payroll_entry_id
   where p.period_start = v_src and s.status <> 'Annulé';
  if aug_after <> aug_before then raise exception 'T-I6 : le mois validé a changé (% -> %)', aug_before, aug_after; end if;
  perform public.run_payroll_entry(e_dec);
  if (select count(*) from public.additional_salaries where employee_id = c.emp and period = '2026-12-01' and component_code = 'REGUL_BRUT') <> 1 then
    raise exception 'T-I19 : la régularisation est dupliquée par un recalcul';
  end if;
  if not exists (select 1 from public.payroll_corrections where employee_id = c.emp and status = 'Appliquée' and applied_period = '2026-12-01') then
    raise exception 'T-I6 : la correction n''est pas marquée appliquée à décembre';
  end if;

  -- report : si décembre est annulé, correction et échéance de décembre sont reprises en janvier
  execute 'reset role';
  update public.payroll_entries set status = 'Annulée' where id = e_dec;
  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', c.user_paie::text, true);
  perform public.run_payroll_entry(e_jan);
  select amount into n0 from public.additional_salaries where employee_id = c.emp and period = '2027-01-01' and component_code = 'RET_PRET';
  if n0 is distinct from 20000 then raise exception 'report : janvier devait retenir 2 échéances (20000), obtenu %', n0; end if;
  if not exists (select 1 from public.payroll_corrections where employee_id = c.emp and status = 'Appliquée' and applied_period = '2027-01-01') then
    raise exception 'report : la régularisation n''a pas été reprise en janvier';
  end if;

  execute 'reset role';
end $$;

rollback;
select 'OK l2_adjustments';
