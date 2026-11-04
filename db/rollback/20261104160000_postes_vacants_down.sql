-- Annule 20261104160000_postes_vacants.sql. L'ancien org_chart revient en rejouant 20261104120000_organigramme_poste_vide.sql.
drop function if exists public.org_delete_position(uuid);
drop function if exists public.org_save_position(uuid, uuid, integer, text);
drop table if exists public.org_positions;
