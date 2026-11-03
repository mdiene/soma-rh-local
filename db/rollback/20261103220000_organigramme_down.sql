-- Annule 20261103220000_organigramme.sql (ne touche pas employee_manager_assignments : les liens directs sont conservés).
drop function if exists public.org_log_export(text, integer);
drop function if exists public.org_set_team_member(uuid, uuid, text, numeric, date, date, text);
drop function if exists public.org_save_team(uuid, text, text, uuid, date, date, text);
drop function if exists public.org_end_relation(uuid, date, text);
drop function if exists public.org_save_relation(uuid, uuid, uuid, text, date, date, numeric, text, text);
drop function if exists public.org_set_manager(uuid, uuid, date, text);
drop function if exists public.org_require_hr(text);
drop function if exists public.org_log(text, uuid, text, text, jsonb);
drop function if exists public.org_chart(date);
drop table if exists public.team_members;
drop table if exists public.teams;
drop table if exists public.org_relations;
drop function if exists public.org_relations_no_overlap();
drop trigger if exists employee_manager_assignments_no_cycle on public.employee_manager_assignments;
drop function if exists public.org_prevent_cycle();
