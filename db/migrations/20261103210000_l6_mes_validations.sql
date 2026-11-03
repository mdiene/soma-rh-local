-- L6 : « mes validations » — les congés que l'utilisateur connecté peut décider maintenant
-- (étape en attente dont il est le manager, le délégué ou la RH ; jamais sa propre demande ;
--  pas un niveau supplémentaire s'il a déjà décidé un niveau de la même demande).
create or replace function public.my_leave_approvals()
returns table (leave_id uuid, employee_number text, employee_name text, leave_type text, from_date date, to_date date,
               total_days numeric, reason text, step smallint, level text, due_at timestamptz, overdue boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select l.id, e.employee_number, e.first_name || ' ' || e.last_name, l.leave_type, l.from_date, l.to_date,
         l.total_days, l.reason, s.step, s.level, s.due_at, coalesce(s.due_at < now(), false)
    from public.leave_applications l
    join public.employees e on e.id = l.employee_id
    join lateral (select * from public.leave_approval_steps x where x.leave_id = l.id and x.status = 'En attente' order by x.step limit 1) s on true
   where l.status = 'Ouverte'
     and l.employee_id is distinct from (select public.my_employee_id())
     and not exists (select 1 from public.leave_approval_steps d where d.leave_id = l.id and d.decided_by = (select auth.uid()))
     and (public.has_role(array['admin'])
          or (s.level = 'rh' and public.has_role(array['rh']))
          or (s.level = 'manager' and public.user_manages_employee((select auth.uid()), l.employee_id, l.from_date)))
   order by l.from_date
$$;
revoke all on function public.my_leave_approvals() from public, anon;
grant execute on function public.my_leave_approvals() to authenticated;
