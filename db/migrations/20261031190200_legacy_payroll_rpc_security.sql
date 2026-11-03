-- Les boutons historiques de validation/annulation utilisent encore ces RPC.
-- Ils doivent avoir le même contexte sécurisé que les nouvelles transitions.

alter function public.submit_payroll_entry(uuid) security definer;
alter function public.cancel_payroll_entry(uuid) security definer;

revoke execute on function public.submit_payroll_entry(uuid) from public, anon;
revoke execute on function public.cancel_payroll_entry(uuid) from public, anon;
grant execute on function public.submit_payroll_entry(uuid) to authenticated;
grant execute on function public.cancel_payroll_entry(uuid) to authenticated;
