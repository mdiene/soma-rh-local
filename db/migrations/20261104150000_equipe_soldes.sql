-- Mon équipe : un manager voit les soldes de congés (dotations) des salariés dont il est le manager à la date du jour.
-- La vue v_leave_balances est en security_invoker : elle suit donc cette politique. Aucune donnée de paie n'est concernée.
-- Retour : drop policy leave_alloc_select_team on public.leave_allocations;
create policy leave_alloc_select_team on public.leave_allocations
  for select to authenticated
  using ((select public.can_see_leave(employee_id, current_date)));
