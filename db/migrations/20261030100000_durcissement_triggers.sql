-- =============================================================================
-- SOMA-RH — Durcissement : fonctions de déclencheur non appelables par l'API
-- Les fonctions ci-dessous ne servent qu'aux déclencheurs (lots 6 et 7) ; elles
-- sont SECURITY DEFINER et ne doivent pas être exposées via /rest/v1/rpc.
-- PostgreSQL vérifie le droit EXECUTE à la création du déclencheur, pas à son
-- exécution : les déclencheurs existants continuent de fonctionner.
-- =============================================================================

revoke execute on function public.employees_assign_number() from public, anon, authenticated;
revoke execute on function public.reference_audit()         from public, anon, authenticated;
revoke execute on function public.reference_guard_delete()  from public, anon, authenticated;
