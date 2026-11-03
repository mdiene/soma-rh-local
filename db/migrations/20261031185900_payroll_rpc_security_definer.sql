-- Les RPC de gouvernance exécutent les opérations contrôlées avec les droits
-- du propriétaire, tout en conservant auth.uid() pour l'acteur courant.
-- Cela évite de donner au rôle applicatif un accès direct au schéma auth.

alter function public.create_payroll_snapshot(uuid) security definer;
alter function public.transition_payroll_entry(uuid, text, text) security definer;
alter function public.delete_payroll_entry(uuid) security definer;

revoke execute on function public.create_payroll_snapshot(uuid) from public, anon;
revoke execute on function public.transition_payroll_entry(uuid, text, text) from public, anon;
revoke execute on function public.delete_payroll_entry(uuid) from public, anon;
grant execute on function public.create_payroll_snapshot(uuid) to authenticated;
grant execute on function public.transition_payroll_entry(uuid, text, text) to authenticated;
grant execute on function public.delete_payroll_entry(uuid) to authenticated;
