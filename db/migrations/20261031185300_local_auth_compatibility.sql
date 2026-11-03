-- Compatibilité auth locale : l'authentification locale ne conserve pas
-- last_sign_in_at dans auth.users.

create or replace function public.admin_list_users()
returns table (user_id uuid, email text, created_at timestamptz, last_sign_in_at timestamptz,
               roles text[], employee_id uuid, employee_number text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.has_role(array['admin']) then
    raise exception 'Réservé aux administrateurs';
  end if;
  return query
    select u.id, u.email::text, u.created_at, null::timestamptz,
           coalesce(array_agg(r.role order by r.role) filter (where r.role is not null), '{}'),
           e.id, e.employee_number
    from auth.users u
    left join public.user_roles r on r.user_id = u.id
    left join public.employees e on e.user_id = u.id
    group by u.id, u.email, u.created_at, e.id, e.employee_number
    order by u.created_at;
end;
$$;

revoke execute on function public.admin_list_users() from public, anon;
grant execute on function public.admin_list_users() to authenticated;

-- Le compte historique de référence conserve tous les accès applicatifs.
insert into public.user_roles(user_id, role)
select u.id, roles.role
from auth.users u
cross join unnest(array['admin','rh','paie','salarie']::text[]) as roles(role)
where lower(u.email) = lower('mdiene@gmail.com')
on conflict (user_id, role) do nothing;
