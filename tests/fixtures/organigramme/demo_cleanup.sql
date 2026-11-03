-- Retire les données de démonstration de l'organigramme (salariés fictifs reconnus à leur e-mail @exemple.test).
-- Les liens, équipes et congés disparaissent avec eux (suppression en cascade). Les postes ne sont jamais supprimés (ils peuvent exister dans les données réelles).
-- Usage : psql -v ON_ERROR_STOP=1 -f tests/fixtures/organigramme/demo_cleanup.sql
begin;
delete from public.teams where lead_employee_id in (select id from public.employees where email_work like '%@exemple.test');
delete from public.employees where email_work like '%@exemple.test';
commit;
select 'démo retirée : ' || count(*) || ' salarié(s) fictif(s) restant(s)' from public.employees where email_work like '%@exemple.test';
