-- Phase 3 ESS/MSS : périmètre manager daté et limité à son équipe.

alter table public.user_roles drop constraint if exists user_roles_role_check;
alter table public.user_roles
  add constraint user_roles_role_check
  check (role in ('admin', 'rh', 'paie', 'manager', 'salarie'));

create table if not exists public.employee_manager_assignments (
  id                  uuid primary key default gen_random_uuid(),
  manager_employee_id uuid not null references public.employees(id) on delete cascade,
  employee_id         uuid not null references public.employees(id) on delete cascade,
  valid_from          date not null,
  valid_to            date,
  delegated_by        uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at          timestamptz not null default now(),
  check (manager_employee_id <> employee_id),
  check (valid_to is null or valid_to >= valid_from),
  unique (manager_employee_id, employee_id, valid_from)
);

create index if not exists employee_manager_assignments_manager_idx
  on public.employee_manager_assignments(manager_employee_id, valid_from, valid_to);
create index if not exists employee_manager_assignments_employee_idx
  on public.employee_manager_assignments(employee_id, valid_from, valid_to);

create or replace function public.prevent_manager_assignment_overlap()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (
    select 1
    from public.employee_manager_assignments a
    where a.id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid)
      and a.manager_employee_id = new.manager_employee_id
      and a.employee_id = new.employee_id
      and daterange(a.valid_from, coalesce(a.valid_to, 'infinity'::date), '[]')
          && daterange(new.valid_from, coalesce(new.valid_to, 'infinity'::date), '[]')
  ) then
    raise exception 'La délégation manager existe déjà sur cette période';
  end if;
  return new;
end;
$$;

drop trigger if exists employee_manager_assignments_no_overlap
  on public.employee_manager_assignments;
create trigger employee_manager_assignments_no_overlap
  before insert or update on public.employee_manager_assignments
  for each row execute function public.prevent_manager_assignment_overlap();

alter table public.employee_manager_assignments enable row level security;

create or replace function public.manager_has_employee(
  p_employee_id uuid,
  p_on_date date default current_date
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.employee_manager_assignments a
    where (select public.has_role(array['manager']))
      and a.manager_employee_id = (select public.my_employee_id())
      and a.employee_id = p_employee_id
      and p_on_date >= a.valid_from
      and (a.valid_to is null or p_on_date <= a.valid_to)
  );
$$;

revoke execute on function public.manager_has_employee(uuid, date) from public, anon;
grant execute on function public.manager_has_employee(uuid, date) to authenticated;

drop policy if exists employee_manager_assignments_select on public.employee_manager_assignments;
create policy employee_manager_assignments_select
  on public.employee_manager_assignments for select to authenticated
  using (
    (select public.has_role(array['rh']))
    or (
      (select public.has_role(array['manager']))
      and manager_employee_id = (select public.my_employee_id())
    )
  );

drop policy if exists employee_manager_assignments_ins on public.employee_manager_assignments;
create policy employee_manager_assignments_ins
  on public.employee_manager_assignments for insert to authenticated
  with check ((select public.has_role(array['rh'])));

drop policy if exists employee_manager_assignments_upd on public.employee_manager_assignments;
create policy employee_manager_assignments_upd
  on public.employee_manager_assignments for update to authenticated
  using ((select public.has_role(array['rh'])))
  with check ((select public.has_role(array['rh'])));

drop policy if exists employee_manager_assignments_del on public.employee_manager_assignments;
create policy employee_manager_assignments_del
  on public.employee_manager_assignments for delete to authenticated
  using ((select public.has_role(array['rh'])));

drop policy if exists employees_select on public.employees;
create policy employees_select on public.employees for select to authenticated
  using (
    (select public.has_role(array['rh','paie']))
    or user_id = (select auth.uid())
    or (select public.manager_has_employee(id))
  );

drop policy if exists employee_requests_read on public.employee_requests;
create policy employee_requests_read on public.employee_requests for select to authenticated
  using (
    (select public.has_role(array['rh']))
    or employee_id = (select public.my_employee_id())
    or (select public.manager_has_employee(employee_id))
  );

drop policy if exists employee_request_history_read on public.employee_request_history;
create policy employee_request_history_read on public.employee_request_history
  for select to authenticated
  using (
    (select public.has_role(array['rh']))
    or exists (
      select 1 from public.employee_requests er
      where er.id = request_id
        and (
          er.employee_id = (select public.my_employee_id())
          or (select public.manager_has_employee(er.employee_id))
        )
    )
  );

notify pgrst, 'reload schema';
