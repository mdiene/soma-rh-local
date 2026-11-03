-- =============================================================================
-- SOMA-RH — 08 : administration des comptes (réservé au rôle admin)
-- =============================================================================

-- Liste des comptes avec leurs rôles et la fiche salarié liée.
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
    select u.id, u.email::text, u.created_at, u.last_sign_in_at,
           coalesce(array_agg(r.role order by r.role) filter (where r.role is not null), '{}'),
           e.id, e.employee_number
    from auth.users u
    left join public.user_roles r on r.user_id = u.id
    left join public.employees e on e.user_id = u.id
    group by u.id, u.email, u.created_at, u.last_sign_in_at, e.id, e.employee_number
    order by u.created_at;
end;
$$;

-- Relie (ou délie) un compte à une fiche salarié : donne accès à « Mes bulletins ».
create or replace function public.admin_link_employee(p_user_id uuid, p_employee_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.has_role(array['admin']) then
    raise exception 'Réservé aux administrateurs';
  end if;
  update public.employees set user_id = null where user_id = p_user_id;
  if p_employee_id is not null then
    update public.employees set user_id = p_user_id where id = p_employee_id;
    insert into public.user_roles(user_id, role) values (p_user_id, 'salarie') on conflict do nothing;
  end if;
end;
$$;

revoke execute on function public.admin_list_users() from public, anon;
revoke execute on function public.admin_link_employee(uuid, uuid) from public, anon;
grant execute on function public.admin_list_users() to authenticated;
grant execute on function public.admin_link_employee(uuid, uuid) to authenticated;
