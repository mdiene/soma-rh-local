-- Supprime uniquement les données QA (matricules QA*) ; les salariés d'origine ne sont jamais touchés.
-- Mode normal (pas de session_replication_role) : les suppressions en cascade des clés étrangères
-- (présences, congés, prêts, entrées de paie, etc.) doivent s'exécuter.
begin;
-- Clés étrangères sans cascade : bulletins (leurs lignes et paiements sont en cascade).
delete from public.salary_slips where employee_id in (select id from public.employees where employee_number like 'QA%');
delete from public.employees where employee_number like 'QA%';
delete from public.departments where name like 'QA %';
commit;
