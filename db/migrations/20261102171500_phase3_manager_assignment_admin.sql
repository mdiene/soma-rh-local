-- Phase 3 ESS/MSS : administration RH des équipes manager.

create or replace function public.assign_manager_employee(
  p_manager_employee_id uuid,
  p_employee_id uuid,
  p_valid_from date,
  p_valid_to date default null
)
returns public.employee_manager_assignments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_assignment public.employee_manager_assignments;
  v_manager_user_id uuid;
begin
  if not public.has_role(array['rh']) then
    raise exception 'Réservé au service RH';
  end if;
  if p_manager_employee_id = p_employee_id then
    raise exception 'Un salarié ne peut pas être son propre manager';
  end if;
  if p_valid_to is not null and p_valid_to < p_valid_from then
    raise exception 'La date de fin doit être postérieure à la date de début';
  end if;

  select user_id into v_manager_user_id
  from public.employees
  where id = p_manager_employee_id
    and status = 'Active';
  if v_manager_user_id is null then
    raise exception 'Le manager doit être un salarié actif avec un compte utilisateur';
  end if;

  insert into public.user_roles(user_id, role)
  values (v_manager_user_id, 'manager')
  on conflict (user_id, role) do nothing;

  insert into public.employee_manager_assignments(
    manager_employee_id, employee_id, valid_from, valid_to, delegated_by
  )
  values (
    p_manager_employee_id, p_employee_id, p_valid_from, p_valid_to, (select auth.uid())
  )
  returning * into v_assignment;

  return v_assignment;
exception
  when exclusion_violation then
    raise exception 'Une délégation existe déjà sur cette période';
end;
$$;

revoke execute on function public.assign_manager_employee(uuid, uuid, date, date) from public, anon;
grant execute on function public.assign_manager_employee(uuid, uuid, date, date) to authenticated;

create or replace function public.close_manager_assignment(
  p_assignment_id uuid,
  p_valid_to date
)
returns public.employee_manager_assignments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_assignment public.employee_manager_assignments;
begin
  if not public.has_role(array['rh']) then
    raise exception 'Réservé au service RH';
  end if;

  update public.employee_manager_assignments
     set valid_to = p_valid_to
   where id = p_assignment_id
     and p_valid_to >= valid_from
  returning * into v_assignment;

  if not found then
    raise exception 'Affectation introuvable ou date invalide';
  end if;
  return v_assignment;
end;
$$;

revoke execute on function public.close_manager_assignment(uuid, date) from public, anon;
grant execute on function public.close_manager_assignment(uuid, date) to authenticated;

notify pgrst, 'reload schema';
