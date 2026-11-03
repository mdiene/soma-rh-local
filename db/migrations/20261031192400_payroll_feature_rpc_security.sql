-- Compatibilité PostgREST/auth locale pour les actions de paie exposées dans
-- les lots GitHub.

alter function public.payroll_entry_comparison(uuid) security definer;
alter function public.hr_analytics(integer) security definer;
alter function public.generate_rotation(uuid[], date, date, text[], integer, uuid) security definer;
alter function public.salary_payments_touch() security definer;

revoke execute on function public.payroll_entry_comparison(uuid) from public, anon;
revoke execute on function public.hr_analytics(integer) from public, anon;
revoke execute on function public.generate_rotation(uuid[], date, date, text[], integer, uuid) from public, anon;
grant execute on function public.payroll_entry_comparison(uuid) to authenticated;
grant execute on function public.hr_analytics(integer) to authenticated;
grant execute on function public.generate_rotation(uuid[], date, date, text[], integer, uuid) to authenticated;

-- Recharge le cache PostgREST après la création/compatibilisation des RPC.
notify pgrst, 'reload schema';
