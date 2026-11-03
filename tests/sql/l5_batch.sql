-- L5 : lot de paie filtré idempotent (run_payroll_batch) et bulletin expliqué (salary_slip_explained).
-- Usage : psql -v ON_ERROR_STOP=1 -f tests/sql/l5_batch.sql  (attendu : "OK l5_batch")
-- Aucun identifiant n'est écrit ici ; tout est annulé.
begin;

create temp table t_ctx as
select
  (select user_id from public.user_roles where role = 'paie' and user_id not in (select user_id from public.user_roles where role = 'admin') order by user_id limit 1) as user_paie,
  (select company_id from public.payroll_entries limit 1) as company;
grant select on t_ctx to authenticated;
-- isolement : les prêts réels de la base ne doivent pas interférer avec le test (annulé en fin de transaction)
update public.loan_installments set status = 'Annulée' where status = 'Prévue';
update public.loans set status = 'Annulé' where status <> 'Annulé';

do $$
declare
  c t_ctx; e uuid; n_all int; n_cdd int; n1 int; n2 int; ids uuid[]; net1 numeric; net2 numeric; ex jsonb; l jsonb;
begin
  select * into c from t_ctx;
  if c.user_paie is null or c.company is null then raise exception 'jeu de données insuffisant'; end if;
  insert into public.payroll_entries (company_id, period_start, period_end, status) values (c.company, '2030-03-01', '2030-03-31', 'Brouillon') returning id into e;
  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', c.user_paie::text, true);

  -- lot filtré par type de contrat : seuls les CDD sont calculés
  perform public.run_payroll_batch(e, 'CDD', null);
  select count(*) into n_cdd from public.salary_slips s join public.employees m on m.id = s.employee_id
   where s.payroll_entry_id = e and s.status <> 'Annulé';
  if n_cdd <> (select count(*) from public.employees where status in ('Active','Left') and employment_type = 'CDD' and date_of_joining <= '2030-03-31' and (relieving_date is null or relieving_date >= '2030-03-01')) then
    raise exception 'filtre contrat : % bulletins', n_cdd;
  end if;
  if exists (select 1 from public.salary_slips s join public.employees m on m.id = s.employee_id where s.payroll_entry_id = e and m.employment_type <> 'CDD') then
    raise exception 'filtre contrat : un autre type a été calculé';
  end if;

  -- idempotence : même lot deux fois = mêmes bulletins, mêmes montants
  select count(*), coalesce(sum(net_pay), 0) into n1, net1 from public.salary_slips where payroll_entry_id = e and status <> 'Annulé';
  perform public.run_payroll_batch(e, 'CDD', null);
  select count(*), coalesce(sum(net_pay), 0) into n2, net2 from public.salary_slips where payroll_entry_id = e and status <> 'Annulé';
  if n1 <> n2 or net1 <> net2 then raise exception 'idempotence : % / % bulletins, net % / %', n1, n2, net1, net2; end if;

  -- sélection explicite d'un salarié, puis lot complet : aucun doublon
  select array[id] into ids from public.employees where status = 'Active' and employment_type = 'CDI'
     and date_of_joining <= '2030-03-31' order by employee_number limit 1;
  perform public.run_payroll_batch(e, null, ids);
  perform public.run_payroll_entry(e);
  select count(*) into n_all from public.salary_slips where payroll_entry_id = e and status <> 'Annulé';
  if n_all <> (select count(*) from public.employees where status in ('Active','Left') and date_of_joining <= '2030-03-31' and (relieving_date is null or relieving_date >= '2030-03-01')) then
    raise exception 'lot complet : % bulletins', n_all;
  end if;
  if exists (select employee_id from public.salary_slips where payroll_entry_id = e and status <> 'Annulé' group by 1 having count(*) > 1) then
    raise exception 'doublon de bulletin après lots successifs';
  end if;

  -- bulletin expliqué : lignes présentes, cumul annuel >= montant du mois
  ex := public.salary_slip_explained((select id from public.salary_slips where status = 'Validé' order by period_start desc, employee_number limit 1));
  if jsonb_array_length(ex->'lines') = 0 then raise exception 'explication : aucune ligne'; end if;
  for l in select * from jsonb_array_elements(ex->'lines') loop
    if (l->>'ytd_gain')::numeric < (l->>'gain')::numeric or (l->>'ytd_deduction')::numeric < (l->>'deduction')::numeric then
      raise exception 'explication : cumul inférieur au mois pour %', l->>'code';
    end if;
  end loop;
  if (ex->>'payroll_cost') is null then raise exception 'explication : coût employeur absent'; end if;

  execute 'reset role';
end $$;

rollback;
select 'OK l5_batch';
