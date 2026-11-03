-- Données de démonstration de l'organigramme : 10 salariés FICTIFS, 3 liens hors hiérarchie, 2 équipes, 1 congé.
-- Idempotent (relançable) ; à retirer avec demo_cleanup.sql.
-- Statut « Suspended » : ces salariés ne sont JAMAIS inclus dans un calcul de paie (la paie ne lit que Active et Left).
-- Usage : psql -v ON_ERROR_STOP=1 -f tests/fixtures/organigramme/demo_seed.sql
select user_id as u from public.user_roles where role = 'rh' order by user_id limit 1 \gset
select company_id as company from public.employees limit 1 \gset
select code as ltype from public.leave_types order by code limit 1 \gset
begin;

-- postes fictifs
insert into public.designations (name)
select v from (values ('Directeur général'), ('Directeur d''exploitation'), ('Directeur financier'), ('Responsable RH'), ('Chef de maintenance'),
                      ('Chef de sécurité'), ('Comptable'), ('Gestionnaire de paie'), ('Technicien de maintenance'), ('Responsable qualité')) t(v)
where not exists (select 1 from public.designations d where d.name = t.v);

-- salariés fictifs (le matricule est attribué automatiquement par la base)
insert into public.employees (company_id, first_name, last_name, employment_type, date_of_joining, status, designation_id, email_work)
select :'company', n.f, n.l, 'CDI', date '2019-01-01', 'Suspended', (select id from public.designations where name = n.p), n.e
  from (values
    ('Direction', 'Générale (fictif)', 'Directeur général', 'dg@exemple.test'),
    ('Exploitation', 'Responsable (fictif)', 'Directeur d''exploitation', 'exploitation@exemple.test'),
    ('Finances', 'Responsable (fictif)', 'Directeur financier', 'finances@exemple.test'),
    ('Ressources', 'Humaines (fictif)', 'Responsable RH', 'rh@exemple.test'),
    ('Maintenance', 'Chef (fictif)', 'Chef de maintenance', 'maintenance@exemple.test'),
    ('Sécurité', 'Chef (fictif)', 'Chef de sécurité', 'securite@exemple.test'),
    ('Comptable', 'Agent (fictif)', 'Comptable', 'comptable@exemple.test'),
    ('Paie', 'Gestionnaire (fictif)', 'Gestionnaire de paie', 'paie@exemple.test'),
    ('Technicien', 'Maintenance (fictif)', 'Technicien de maintenance', 'technicien@exemple.test'),
    ('Qualité', 'Intérim (fictif)', 'Responsable qualité', 'qualite@exemple.test')) n(f, l, p, e)
 where not exists (select 1 from public.employees x where x.email_work = n.e);

create temp table d as select e.id, e.email_work as e from public.employees e where e.email_work like '%@exemple.test';
create or replace function pg_temp.i(k text) returns uuid language sql as $$ select id from d where e = k || '@exemple.test' $$;

-- hiérarchie directe
insert into public.employee_manager_assignments (manager_employee_id, employee_id, valid_from, delegated_by)
select pg_temp.i(m), pg_temp.i(e), date '2024-01-01', :'u'
  from (values ('dg','exploitation'), ('dg','finances'), ('dg','rh'), ('exploitation','maintenance'), ('exploitation','securite'),
               ('finances','comptable'), ('rh','paie'), ('maintenance','technicien'), ('exploitation','qualite')) t(m, e)
 where not exists (select 1 from public.employee_manager_assignments a where a.employee_id = pg_temp.i(t.e));

-- liens hors hiérarchie
insert into public.org_relations (employee_id, related_employee_id, relation_type, start_date, end_date, allocation_pct, note, created_by)
select pg_temp.i(a), pg_temp.i(b), t, s::date, en::date, p, nt, :'u'
  from (values ('paie', 'finances', 'dotted', '2026-01-01', null, 30, 'Rattachement fonctionnel au financier pour la paie'),
               ('qualite', 'rh', 'interim', '2026-09-01', '2026-12-31', null, 'Intérim jusqu''au recrutement'),
               ('securite', 'dg', 'functional', '2026-01-01', null, null, 'Rapport direct à la direction pour les incidents')) v(a, b, t, s, en, p, nt)
 where not exists (select 1 from public.org_relations r where r.employee_id = pg_temp.i(v.a) and r.relation_type = v.t);

-- équipes transverses
insert into public.teams (name, kind, lead_employee_id, start_date, created_by)
select n, k, pg_temp.i(l), date '2026-01-01', :'u' from (values ('Comité de pilotage paie', 'committee', 'rh'), ('Projet sécurité du site', 'project', 'securite')) v(n, k, l)
 where not exists (select 1 from public.teams t where t.name = v.n);
insert into public.team_members (team_id, employee_id, role_in_team, allocation_pct, start_date)
select (select id from public.teams where name = v.t), pg_temp.i(v.e), 'membre', v.p, date '2026-01-01'
  from (values ('Comité de pilotage paie', 'finances', 10), ('Comité de pilotage paie', 'paie', 30),
               ('Projet sécurité du site', 'maintenance', 20), ('Projet sécurité du site', 'technicien', 20)) v(t, e, p)
on conflict do nothing;

-- un congé approuvé en cours (statut « en congé »)
insert into public.leave_applications (employee_id, leave_type, from_date, to_date, status)
select pg_temp.i('finances'), :'ltype', current_date - 2, current_date + 10, 'Approuvée'
 where not exists (select 1 from public.leave_applications l where l.employee_id = pg_temp.i('finances') and l.to_date >= current_date);

commit;
select 'démo prête : ' || count(*) || ' salariés fictifs' from public.employees where email_work like '%@exemple.test';
