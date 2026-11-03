-- Correctif de 20261103100000 : audit_log.payroll_entry_id avait une clé étrangère « on delete set null ».
-- Le journal étant en lecture seule, supprimer une paie ayant des lignes d'audit échouait
-- (« Le journal d'audit est en lecture seule »). Un journal garde la trace de ce qui a existé :
-- l'identifiant reste en place (et dans l'empreinte), sans contrainte vers la table vivante.
alter table public.audit_log drop constraint if exists audit_log_payroll_entry_id_fkey;
