-- Annule 20261104110000_organigramme_actions.sql.
-- Les anciennes versions reviennent en rejouant (create or replace), dans cet ordre :
--   db/migrations/20261102171500_phase3_manager_assignment_admin.sql  (assign_manager_employee, close_manager_assignment)
--   db/migrations/20261104100000_organigramme_structure.sql           (org_set_manager avec motif exigé pour remplacer / retirer)
drop function if exists public.org_attach_to_unit(uuid, uuid, boolean);
