-- Module Organigramme : cohérence en base, droits par rôle, statuts calculés, date d'effet, journalisation.
-- Usage : psql -v ON_ERROR_STOP=1 -f tests/sql/organigramme.sql  (attendu : "OK organigramme")
-- Salariés 100 % synthétiques (noms artificiels), créés puis annulés ; aucun identifiant personnel écrit ici.
select user_id as u_rh from public.user_roles where role = 'rh' order by user_id limit 1 \gset
select user_id as u_sal from public.user_roles group by user_id having bool_and(role = 'salarie') order by user_id limit 1 \gset
select company_id as company from public.employees limit 1 \gset
select code as ltype from public.leave_types order by code limit 1 \gset
begin;
select set_config('t.company', :'company', true) is not null;
select set_config('t.u_rh', :'u_rh', true) is not null;
select set_config('t.u_sal', :'u_sal', true) is not null;
select set_config('t.ltype', :'ltype', true) is not null;

create temp table t_emp (k text primary key, id uuid);
insert into public.employees (company_id, employee_number, first_name, last_name, employment_type, date_of_joining, email_work)
select current_setting('t.company')::uuid, 'T-ORG-' || n, 'Prénom' || n, 'Fictif' || n, 'CDI', date '2020-01-01', 'fictif' || n || '@exemple.test'
  from generate_series(1, 7) n;
insert into t_emp select 'e' || right(first_name, 1), id from public.employees where last_name like 'Fictif%';
grant select on t_emp to authenticated, anon;
create or replace function pg_temp.id(k text) returns uuid language sql as $$ select id from t_emp where t_emp.k = $1 $$;
create or replace function pg_temp.as_user(p uuid) returns void language plpgsql as $$
begin execute 'reset role'; execute 'set local role authenticated'; perform set_config('request.jwt.claim.sub', p::text, true); end $$;
create or replace function pg_temp.try(p_sql text) returns text language plpgsql as $$
begin execute p_sql; return 'OK'; exception when others then return sqlerrm; end $$;
create or replace function pg_temp.node(c jsonb, k text) returns jsonb language sql as $$
  select n from jsonb_array_elements(c->'noeuds') n where n->>'id' = pg_temp.id(k)::text $$;

do $$
declare r text; c jsonb; n jsonb; u_rh uuid := current_setting('t.u_rh')::uuid; u_sal uuid := current_setting('t.u_sal')::uuid; k text; d1 uuid; d2 uuid; p1 uuid; tm uuid;
begin
  -- 1. hiérarchie : e2 -> e1, e3 -> e2 ; cycle, auto-rattachement et double manager refusés
  insert into public.employee_manager_assignments(manager_employee_id, employee_id, valid_from, delegated_by) values
    (pg_temp.id('e1'), pg_temp.id('e2'), '2024-01-01', u_rh), (pg_temp.id('e2'), pg_temp.id('e3'), '2024-01-01', u_rh);
  r := pg_temp.try(format('insert into public.employee_manager_assignments(manager_employee_id, employee_id, valid_from, delegated_by) values (%L, %L, date %L, %L)', pg_temp.id('e3'), pg_temp.id('e1'), '2024-06-01', u_rh));
  if r not like 'Cycle hiérarchique refusé%' then raise exception '1 : cycle accepté : %', r; end if;
  r := pg_temp.try(format('insert into public.employee_manager_assignments(manager_employee_id, employee_id, valid_from, delegated_by) values (%L, %L, date %L, %L)', pg_temp.id('e1'), pg_temp.id('e1'), '2024-06-01', u_rh));
  if r not like '%propre manager%' then raise exception '1 : auto-rattachement accepté : %', r; end if;
  r := pg_temp.try(format('insert into public.employee_manager_assignments(manager_employee_id, employee_id, valid_from, delegated_by) values (%L, %L, date %L, %L)', pg_temp.id('e4'), pg_temp.id('e3'), '2024-06-01', u_rh));
  if r = 'OK' then raise exception '1 : deux managers directs valides à la même date acceptés'; end if;

  -- 2. liens hors hiérarchie : soi-même, dates incohérentes
  r := pg_temp.try(format('insert into public.org_relations(employee_id, related_employee_id, relation_type, start_date) values (%L, %L, %L, date %L)', pg_temp.id('e5'), pg_temp.id('e5'), 'dotted', '2025-01-01'));
  if r = 'OK' then raise exception '2 : lien vers soi-même accepté'; end if;
  r := pg_temp.try(format('insert into public.org_relations(employee_id, related_employee_id, relation_type, start_date, end_date) values (%L, %L, %L, date %L, date %L)', pg_temp.id('e5'), pg_temp.id('e1'), 'dotted', '2025-02-01', '2025-01-01'));
  if r = 'OK' then raise exception '2 : dates incohérentes acceptées'; end if;

  -- 3. écritures : motif obligatoire, réservé RH, journalisé
  perform pg_temp.as_user(u_sal);
  r := pg_temp.try(format('select public.org_set_manager(%L, %L, date %L, %L)', pg_temp.id('e4'), pg_temp.id('e2'), '2025-01-01', 'Réorganisation du service'));
  if r not like 'Réservé au service RH%' then raise exception '3 : écriture acceptée pour un salarié : %', r; end if;
  perform pg_temp.as_user(u_rh);
  r := pg_temp.try(format('select public.org_set_manager(%L, %L, date %L, %L)', pg_temp.id('e3'), pg_temp.id('e1'), '2025-02-01', 'ok'));
  if r not like '%motif%' then raise exception '3 : remplacement d''un manager sans motif valide accepté : %', r; end if;
  -- premier rattachement : motif facultatif ; retrait d'un manager : motif exigé
  perform public.org_set_manager(pg_temp.id('e7'), pg_temp.id('e5'), date '2025-01-01', null);
  r := pg_temp.try(format('select public.org_set_manager(%L, null, date %L, null)', pg_temp.id('e7'), '2025-03-01'));
  if r not like '%motif%' then raise exception '3 : retrait sans motif accepté : %', r; end if;
  perform public.org_set_manager(pg_temp.id('e7'), null, date '2025-03-01', 'Changement de service');
  if (select count(*) from public.audit_log where action = 'detachement_manager' and reason = 'Changement de service') <> 1 then raise exception '3 : détachement non journalisé'; end if;
  perform public.org_set_manager(pg_temp.id('e7'), pg_temp.id('e5'), date '2025-04-01', null);
  perform public.org_set_manager(pg_temp.id('e4'), pg_temp.id('e2'), date '2025-01-01', 'Rattachement initial');
  perform public.org_set_manager(pg_temp.id('e4'), pg_temp.id('e3'), date '2025-07-01', 'Changement de responsable');
  execute 'reset role';
  if (select count(*) from public.audit_log where action = 'changement_manager' and reason in ('Rattachement initial', 'Changement de responsable')) <> 2 then
    raise exception '3 : changements de manager non journalisés';
  end if;

  -- 4. date d'effet : à une date passée, l'ancien manager ; ensuite le nouveau ; subordonnés exacts
  perform pg_temp.as_user(u_rh);
  c := public.org_chart(date '2025-03-01');
  if not exists (select 1 from jsonb_array_elements(c->'liens') l where l->>'type' = 'direct' and l->>'source' = pg_temp.id('e2')::text and l->>'target' = pg_temp.id('e4')::text) then raise exception '4 : manager passé absent'; end if;
  if (pg_temp.node(c, 'e2')->>'subordonnes')::int <> 2 then raise exception '4 : e2 devrait avoir 2 subordonnés en mars 2025, a %', pg_temp.node(c, 'e2')->>'subordonnes'; end if;
  c := public.org_chart(date '2025-09-01');
  if not exists (select 1 from jsonb_array_elements(c->'liens') l where l->>'type' = 'direct' and l->>'source' = pg_temp.id('e3')::text and l->>'target' = pg_temp.id('e4')::text) then raise exception '4 : nouveau manager absent'; end if;
  if (pg_temp.node(c, 'e2')->>'subordonnes')::int <> 1 then raise exception '4 : e2 devrait avoir 1 subordonné en sept. 2025'; end if;
  if (pg_temp.node(c, 'e1')->>'subordonnes')::int <> 1 then raise exception '4 : e1 devrait avoir 1 subordonné'; end if;
  execute 'reset role';

  -- 5. statuts calculés : congé approuvé, intérim, sorti
  insert into public.leave_applications(employee_id, leave_type, from_date, to_date, status) values (pg_temp.id('e5'), current_setting('t.ltype'), '2025-09-01', '2025-09-10', 'Approuvée');
  perform pg_temp.as_user(u_rh);
  perform public.org_save_relation(null, pg_temp.id('e6'), pg_temp.id('e1'), 'interim', date '2025-08-01', date '2025-12-31', null, 'Intérim', 'Absence du titulaire');
  execute 'reset role';
  update public.employees set relieving_date = '2025-08-31', exit_reason = 'DEMISSION', status = 'Left' where id = pg_temp.id('e7');
  perform pg_temp.as_user(u_rh);
  c := public.org_chart(date '2025-09-05');
  if pg_temp.node(c, 'e5')->>'statut' <> 'en_conge' then raise exception '5 : e5 devrait être en congé, est %', pg_temp.node(c, 'e5')->>'statut'; end if;
  if pg_temp.node(c, 'e6')->>'statut' <> 'interim' then raise exception '5 : e6 devrait être en intérim'; end if;
  if pg_temp.node(c, 'e7') is not null then raise exception '5 : e7 sorti ne doit plus apparaître après sa date de sortie'; end if;
  if pg_temp.node(public.org_chart(date '2025-08-15'), 'e7') is null then raise exception '5 : e7 doit apparaître avant sa sortie'; end if;
  if pg_temp.node(public.org_chart(date '2025-10-01'), 'e5')->>'statut' <> 'actif' then raise exception '5 : e5 doit être actif après son congé'; end if;

  -- 6. quotes-parts : > 100 % = anomalie visible (équipe + lien pointillé)
  perform public.org_save_relation(null, pg_temp.id('e5'), pg_temp.id('e1'), 'dotted', date '2025-01-01', null, 60, 'Rattachement matriciel', 'Matrice finances');
  perform public.org_save_team(null, 'Projet fictif', 'project', pg_temp.id('e1'), date '2025-01-01', null, 'Création du projet');
  perform public.org_set_team_member((select t.id from public.teams t where t.name = 'Projet fictif'), pg_temp.id('e5'), 'membre', 60, date '2025-01-01', null, 'Affectation au projet');
  c := public.org_chart(date '2025-10-01');
  if not exists (select 1 from jsonb_array_elements(c->'anomalies') a where a->>'code' = 'allocation_depassee' and a->>'employe' = pg_temp.id('e5')::text) then raise exception '6 : anomalie d''allocation non signalée'; end if;
  if (pg_temp.node(c, 'e5')->>'equipes')::int <> 1 then raise exception '6 : e5 devrait appartenir à 1 équipe'; end if;
  perform public.org_end_relation((select o.id from public.org_relations o where o.employee_id = pg_temp.id('e5') limit 1), date '2025-12-31', 'Fin du rattachement');
  execute 'reset role';

  -- 7. aucune donnée de paie ou personnelle dans les nœuds ; e-mail réservé à la RH
  perform pg_temp.as_user(u_rh);
  n := pg_temp.node(public.org_chart(date '2025-10-01'), 'e1');
  if n->>'email' is null then raise exception '7 : e-mail invisible pour la RH'; end if;
  for k in select jsonb_object_keys(n) loop
    if k not in ('id', 'matricule', 'prenom', 'nom', 'poste', 'poste_id', 'departement', 'unite', 'email', 'statut', 'sortie', 'responsable_de', 'subordonnes', 'equipes') then raise exception '7 : champ inattendu dans un nœud : %', k; end if;
  end loop;
  perform pg_temp.as_user(u_sal);
  n := pg_temp.node(public.org_chart(date '2025-10-01'), 'e1');
  if n is null then raise exception '7 : un salarié doit voir l''organigramme'; end if;
  if n->>'email' is not null then raise exception '7 : e-mail visible pour un salarié'; end if;
  if (select count(*) from public.org_relations) <> 0 then raise exception '7 : table des liens lisible directement par un salarié'; end if;

  -- 8. export journalisé ; aucune lecture anonyme
  perform public.org_log_export('csv', 26);
  execute 'reset role';
  if not exists (select 1 from public.audit_log where action = 'export_organigramme' and (new_data->>'lignes')::int = 26) then raise exception '8 : export non journalisé'; end if;
  execute 'set local role anon';
  r := pg_temp.try('select public.org_chart()');
  if r not like '%permission denied%' then raise exception '8 : lecture anonyme possible : %', r; end if;

  -- 9. structure de l'entreprise : unités, rattachements, postes, retrait d'équipe ; motif facultatif
  perform pg_temp.as_user(u_rh);
  d1 := public.org_save_unit(null, 'Direction fictive A', 'direction', null, pg_temp.id('e1'), null);
  d2 := public.org_save_unit(null, 'Secteur fictif A1', 'secteur', d1, null, null);
  r := pg_temp.try(format('select public.org_save_unit(%L, %L, %L, %L, null, null)', d1, 'Direction fictive A', 'direction', d2));
  if r not like 'Cycle refusé%' then raise exception '9 : cycle d''unités accepté : %', r; end if;
  r := pg_temp.try(format('select public.org_save_unit(null, %L, %L, null, null, null)', 'Direction fictive A', 'direction'));
  if r not like '%porte déjà le nom%' then raise exception '9 : doublon d''unité accepté : %', r; end if;
  perform public.org_set_employee_unit(pg_temp.id('e5'), d2);
  perform public.org_set_employee_unit(pg_temp.id('e6'), d2);
  c := public.org_chart(date '2025-10-01');
  if pg_temp.node(c, 'e5')->>'unite' <> d2::text then raise exception '9 : unité du salarié absente du nœud'; end if;
  if (select (u->>'membres')::int from jsonb_array_elements(c->'unites') u where u->>'id' = d2::text) <> 2 then raise exception '9 : membres de l''unité inexacts'; end if;
  if jsonb_array_length(pg_temp.node(c, 'e1')->'responsable_de') < 1 then raise exception '9 : responsable d''unité non signalé'; end if;
  r := pg_temp.try(format('select public.org_delete_unit(%L)', d1));
  if r not like '%sous-unités%' then raise exception '9 : suppression d''une unité avec sous-unités acceptée : %', r; end if;
  p1 := public.org_save_post('Poste fictif de test');
  if p1 <> public.org_save_post('poste FICTIF de test') then raise exception '9 : doublon de poste créé'; end if;
  perform public.org_set_employee_post(pg_temp.id('e5'), p1);
  if pg_temp.node(public.org_chart(date '2025-10-01'), 'e5')->>'poste' <> 'Poste fictif de test' then raise exception '9 : poste non affecté'; end if;
  -- retrait d'un membre d'équipe : il n'est plus membre à une date future
  select t.id into tm from public.teams t where t.name = 'Projet fictif';
  perform public.org_remove_team_member(tm, pg_temp.id('e5'));
  if exists (select 1 from jsonb_array_elements(public.org_chart(date '2031-01-01')->'equipes') q, jsonb_array_elements(q->'membres') m
              where q->>'id' = tm::text and m->>'employe' = pg_temp.id('e5')::text) then raise exception '9 : membre toujours actif après retrait'; end if;
  if public.org_delete_unit(d2) <> 2 then raise exception '9 : la suppression doit détacher les 2 salariés'; end if;
  if pg_temp.node(public.org_chart(date '2025-10-01'), 'e5')->>'unite' is not null then raise exception '9 : salarié encore rattaché à l''unité supprimée'; end if;
  perform public.org_delete_unit(d1);
  perform pg_temp.as_user(u_sal);
  r := pg_temp.try(format('select public.org_save_unit(null, %L, %L, null, null, null)', 'Interdit', 'direction'));
  if r not like 'Réservé au service RH%' then raise exception '9 : création d''unité acceptée pour un salarié : %', r; end if;
  execute 'reset role';
end $$;

rollback;
select 'OK organigramme';
