-- Annule 20261104100000_organigramme_structure.sql.
-- Les anciennes versions de org_chart, org_set_manager, org_require_hr et org_log reviennent en rejouant
-- db/migrations/20261103220000_organigramme.sql (create or replace) ; les colonnes ajoutées à departments sont retirées.
drop function if exists public.org_remove_team_member(uuid, uuid, text);
drop function if exists public.org_set_employee_post(uuid, uuid);
drop function if exists public.org_save_post(text);
drop function if exists public.org_set_unit_head(uuid, uuid);
drop function if exists public.org_set_employee_unit(uuid, uuid, text);
drop function if exists public.org_delete_unit(uuid);
drop function if exists public.org_save_unit(uuid, text, text, uuid, uuid, text);
drop trigger if exists departments_no_cycle on public.departments;
drop function if exists public.org_unit_no_cycle();
alter table public.departments drop column if exists note, drop column if exists head_employee_id, drop column if exists kind;
