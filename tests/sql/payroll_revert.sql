-- Retour à « Calculée » puis suppression d'une paie (revert_payroll_entry, delete_payroll_entry).
-- Usage : psql -v ON_ERROR_STOP=1 -f tests/sql/payroll_revert.sql  (attendu : "OK payroll_revert")
-- Les comptes sont pris dans user_roles ; la paie testée est créée puis tout est annulé.
begin;

create temp table t_ctx as
select
  (select user_id from public.user_roles where role = 'admin' order by user_id limit 1) as user_admin,
  (select user_id from public.user_roles where role = 'paie' and user_id not in (select user_id from public.user_roles where role = 'admin') order by user_id limit 1) as user_paie,
  (select company_id from public.payroll_entries limit 1) as company;
grant select on t_ctx to authenticated;

create or replace function pg_temp.as_user(p_user uuid) returns void language plpgsql as $$
begin
  execute 'reset role';
  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', p_user::text, true);
end $$;

-- renvoie le message d'erreur d'une instruction, ou 'OK'
create or replace function pg_temp.try(p_sql text) returns text language plpgsql as $$
begin execute p_sql; return 'OK'; exception when others then return sqlerrm; end $$;

do $$
declare
  c t_ctx; e uuid; s uuid; emp uuid; r text; n int;
begin
  select * into c from t_ctx;
  if c.user_admin is null or c.user_paie is null or c.company is null then raise exception 'jeu de données insuffisant'; end if;
  select id into emp from public.employees where status = 'Active' order by employee_number limit 1;

  -- une paie « Approuvée » avec un bulletin validé et un paiement enregistré
  perform set_config('soma.payroll_transition', 'on', true);
  insert into public.payroll_entries (company_id, period_start, period_end, status, approved_by, approved_at)
    values (c.company, '2030-01-01', '2030-01-31', 'Approuvée', c.user_admin, now()) returning id into e;
  insert into public.salary_slips (payroll_entry_id, employee_id, period_start, period_end, status, employee_number, employee_name)
    select e, emp, '2030-01-01', '2030-01-31', 'Validé', employee_number, last_name from public.employees where id = emp returning id into s;
  insert into public.salary_payments (slip_id, payment_mode, status, paid_at) values (s, 'espèces', 'Payé', current_date);

  -- 1. la suppression directe est refusée, avec la marche à suivre
  perform pg_temp.as_user(c.user_paie);
  r := pg_temp.try(format('select public.delete_payroll_entry(%L)', e));
  if r not like '%remettre à l''état « Calculée »%' then raise exception '1 : message de suppression sans consigne : %', r; end if;

  -- 2. un non-admin ne peut pas remettre en Calculée
  r := pg_temp.try(format('select public.revert_payroll_entry(%L, %L)', e, 'tentative non admin'));
  if r not like 'Seul un administrateur%' then raise exception '2 : attendu refus de rôle, obtenu %', r; end if;

  -- 3. admin : motif obligatoire, puis paiements à confirmer
  perform pg_temp.as_user(c.user_admin);
  r := pg_temp.try(format('select public.revert_payroll_entry(%L, %L)', e, 'ok'));
  if r not like '%motif%' then raise exception '3 : motif trop court accepté : %', r; end if;
  r := pg_temp.try(format('select public.revert_payroll_entry(%L, %L)', e, 'Paie saisie par erreur'));
  if r not like '1 paiement%confirmez%' then raise exception '3 : attendu demande de confirmation des paiements, obtenu %', r; end if;

  -- 4. confirmation : retour en Calculée, bulletins en brouillon, paiements annulés, journalisé
  r := pg_temp.try(format('select public.revert_payroll_entry(%L, %L, true)', e, 'Paie saisie par erreur'));
  if r <> 'OK' then raise exception '4 : retour refusé : %', r; end if;
  if (select status from public.payroll_entries where id = e) <> 'Calculée' then raise exception '4 : statut non remis à Calculée'; end if;
  if (select approved_by from public.payroll_entries where id = e) is not null then raise exception '4 : approbation non effacée'; end if;
  if (select status from public.salary_slips where id = s) <> 'Brouillon' then raise exception '4 : bulletin non remis en brouillon'; end if;
  if exists (select 1 from public.salary_payments where slip_id = s) then raise exception '4 : paiement conservé'; end if;
  select count(*) into n from public.audit_events where action = 'retour_calculee' and payroll_entry_id = e
     and reason = 'Paie saisie par erreur' and (after_data->>'paiements_annules')::int = 1;
  if n <> 1 then raise exception '4 : retour non journalisé'; end if;

  -- 5. la suppression passe maintenant
  perform pg_temp.as_user(c.user_paie);
  r := pg_temp.try(format('select public.delete_payroll_entry(%L)', e));
  if r <> 'OK' then raise exception '5 : suppression refusée après retour : %', r; end if;
  if exists (select 1 from public.payroll_entries where id = e) then raise exception '5 : paie toujours présente'; end if;

  -- 6. une paie clôturée doit d'abord être rouverte
  execute 'reset role';
  perform set_config('soma.payroll_transition', 'on', true);
  insert into public.payroll_entries (company_id, period_start, period_end, status) values (c.company, '2030-02-01', '2030-02-28', 'Brouillon') returning id into e;
  update public.payroll_entries set status = 'Clôturée' where id = e;
  perform pg_temp.as_user(c.user_admin);
  r := pg_temp.try(format('select public.revert_payroll_entry(%L, %L)', e, 'Paie saisie par erreur'));
  if r not like '%rouverte%' then raise exception '6 : paie clôturée non orientée vers la réouverture : %', r; end if;

  execute 'reset role';
end $$;

rollback;
select 'OK payroll_revert';
