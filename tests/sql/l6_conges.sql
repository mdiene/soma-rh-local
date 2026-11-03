-- L6 : congé à deux niveaux, délégation, décision idempotente, séparation des tâches, escalade.
-- Usage : psql -v ON_ERROR_STOP=1 -f tests/sql/l6_conges.sql  (attendu : "OK l6_conges")
-- Les comptes sont pris dans la base (aucun identifiant écrit ici) ; tout est annulé.
begin;

create temp table t_ctx as
select
  m.user_id as mgr, a.employee_id as emp, e.user_id as emp_user, a.valid_from as d0,
  (select user_id from public.user_roles where role = 'rh' and user_id not in (select user_id from public.user_roles where role = 'admin') order by user_id limit 1) as rh,
  (select user_id from public.user_roles group by user_id having bool_and(role = 'salarie') and user_id is distinct from e.user_id order by user_id limit 1) as dlg,
  (select code from public.leave_types order by code limit 1) as ltype
from public.employee_manager_assignments a
join public.employees m on m.id = a.manager_employee_id and m.user_id is not null
join public.employees e on e.id = a.employee_id
order by a.valid_from limit 1;
grant select on t_ctx to authenticated;

create or replace function pg_temp.as_user(p_user uuid) returns void language plpgsql as $$
begin
  execute 'reset role'; execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', p_user::text, true);
end $$;
-- exécute une instruction ; renvoie 'OK' ou le message d'erreur
create or replace function pg_temp.try(p_sql text) returns text language plpgsql as $$
begin execute p_sql; return 'OK'; exception when others then return sqlerrm; end $$;
create or replace function pg_temp.decide(p_user uuid, p_leave uuid, p_dec text, p_note text, p_step smallint) returns text language plpgsql as $$
declare r jsonb;
begin
  perform pg_temp.as_user(p_user);
  begin r := public.decide_leave(p_leave, p_dec, p_note, p_step); execute 'reset role'; return 'OK' || case when (r->>'idempotent')::boolean then ' idempotent' else '' end;
  exception when others then execute 'reset role'; return sqlerrm; end;
end $$;
create or replace function pg_temp.new_leave(n int) returns uuid language plpgsql as $$
declare c t_ctx; v uuid;
begin
  select * into c from t_ctx;
  insert into public.leave_applications (employee_id, leave_type, from_date, to_date)
    values (c.emp, c.ltype, c.d0 + n * 3, c.d0 + n * 3 + 1) returning id into v;
  return v;
end $$;

do $$
declare c t_ctx; l1 uuid; l2 uuid; l3 uuid; l4 uuid; r text; n0 int; n1 int;
begin
  select * into c from t_ctx;
  if c.mgr is null or c.emp is null or c.rh is null or c.dlg is null or c.ltype is null then raise exception 'jeu de données insuffisant'; end if;

  -- 1. création : étape manager en attente, étape RH en attente
  l1 := pg_temp.new_leave(1);
  if (select count(*) from public.leave_approval_steps where leave_id = l1 and status = 'En attente') <> 2 then raise exception '1 : deux étapes en attente attendues'; end if;

  -- 2. plus de décision directe
  r := pg_temp.try(format('update public.leave_applications set status = %L where id = %L', 'Approuvée', l1));
  if r not like '%circuit de validation%' then raise exception '2 : décision directe acceptée : %', r; end if;

  -- 3. la RH ne saute pas l''étape manager ; un salarié sans délégation non plus
  r := pg_temp.decide(c.rh, l1, 'Approuvée', null, 1::smallint);
  if r not like '%manager du salarié%' then raise exception '3 : la RH a décidé à la place du manager : %', r; end if;
  r := pg_temp.decide(c.dlg, l1, 'Approuvée', null, 1::smallint);
  if r not like '%manager du salarié%' then raise exception '3 : un salarié sans délégation a décidé : %', r; end if;

  -- 4. délégation puis décision par le délégué
  perform pg_temp.as_user(c.mgr);
  perform public.delegate_approvals(c.dlg, current_date, current_date + 7, 'test');
  execute 'reset role';
  select count(*) into n0 from public.employee_notifications;
  r := pg_temp.decide(c.dlg, l1, 'Approuvée', null, 1::smallint);
  if r <> 'OK' then raise exception '4 : le délégué n''a pas pu décider : %', r; end if;
  if not (select via_delegation from public.leave_approval_steps where leave_id = l1 and step = 1) then raise exception '4 : décision par délégation non marquée'; end if;
  if (select status from public.leave_applications where id = l1) <> 'Ouverte' then raise exception '4 : le congé doit attendre la RH'; end if;
  select count(*) into n1 from public.employee_notifications;
  if n1 <= n0 then raise exception '4 : la RH n''a pas été notifiée'; end if;
  if (select count(*) from public.email_outbox where dedup_key like 'leave:' || l1 || ':rh:%') = 0 then raise exception '4 : e-mail RH absent de la file'; end if;

  -- 5. décision rejouée = aucun effet (idempotence), aucune notification en double
  select count(*) into n0 from public.employee_notifications;
  r := pg_temp.decide(c.dlg, l1, 'Approuvée', null, 1::smallint);
  if r <> 'OK idempotent' then raise exception '5 : décision rejouée non idempotente : %', r; end if;
  select count(*) into n1 from public.employee_notifications;
  if n1 <> n0 then raise exception '5 : notification en double'; end if;

  -- 6. le délégué ne décide pas l''étape RH ; la RH conclut
  r := pg_temp.decide(c.dlg, l1, 'Approuvée', null, null);
  if r not like '%service RH%' and r not like '%Séparation%' then raise exception '6 : le délégué a décidé l''étape RH : %', r; end if;
  r := pg_temp.decide(c.rh, l1, 'Approuvée', null, null);
  if r <> 'OK' then raise exception '6 : la RH n''a pas pu conclure : %', r; end if;
  if (select status from public.leave_applications where id = l1) <> 'Approuvée' then raise exception '6 : congé non approuvé'; end if;
  r := pg_temp.decide(c.rh, l1, 'Approuvée', null, null);
  if r <> 'OK idempotent' then raise exception '6 : rejeu de la décision finale : %', r; end if;
  r := pg_temp.decide(c.rh, l1, 'Rejetée', 'regret', null);
  if r not like '%déjà%' then raise exception '6 : décision contraire acceptée : %', r; end if;

  -- 7. séparation des tâches : la même personne ne décide pas deux niveaux
  l2 := pg_temp.new_leave(2);
  r := pg_temp.decide(c.mgr, l2, 'Approuvée', null, null);
  if r <> 'OK' then raise exception '7 : le manager n''a pas pu décider : %', r; end if;
  r := pg_temp.decide(c.mgr, l2, 'Approuvée', null, null);
  if r not like '%Séparation des tâches%' then raise exception '7 : une personne a décidé deux niveaux : %', r; end if;

  -- 8. rejet : motif obligatoire, étapes restantes ignorées
  l3 := pg_temp.new_leave(3);
  r := pg_temp.decide(c.dlg, l3, 'Rejetée', null, null);
  if r not like '%motif%' then raise exception '8 : rejet sans motif accepté : %', r; end if;
  r := pg_temp.decide(c.dlg, l3, 'Rejetée', 'Période de forte activité', null);
  if r <> 'OK' then raise exception '8 : rejet refusé : %', r; end if;
  if (select status from public.leave_applications where id = l3) <> 'Rejetée' then raise exception '8 : congé non rejeté'; end if;
  if exists (select 1 from public.leave_approval_steps where leave_id = l3 and status = 'En attente') then raise exception '8 : étape restée en attente'; end if;

  -- 9. nul ne décide de sa propre demande
  if c.emp_user is not null then
    r := pg_temp.decide(c.emp_user, pg_temp.new_leave(4), 'Approuvée', null, null);
    if r not like '%propre demande%' then raise exception '9 : décision sur sa propre demande : %', r; end if;
  end if;

  -- 10. délai dépassé : escalade vers la RH, rejouable sans effet
  l4 := pg_temp.new_leave(5);
  update public.leave_approval_steps set due_at = now() - interval '1 day' where leave_id = l4 and step = 1;
  perform pg_temp.as_user(c.rh);
  if public.escalate_overdue_leave_steps() < 1 then raise exception '10 : escalade non effectuée'; end if;
  if public.escalate_overdue_leave_steps() <> 0 then raise exception '10 : escalade non idempotente'; end if;
  execute 'reset role';
  if (select status from public.leave_approval_steps where leave_id = l4 and step = 1) <> 'Ignorée' then raise exception '10 : étape manager non escaladée'; end if;
  r := pg_temp.decide(c.rh, l4, 'Approuvée', null, null);
  if r <> 'OK' then raise exception '10 : la RH n''a pas pu décider après escalade : %', r; end if;
end $$;

rollback;
select 'OK l6_conges';
