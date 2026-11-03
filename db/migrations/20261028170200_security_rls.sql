-- =============================================================================
-- SOMA-RH — 03 : Rôles applicatifs et Row Level Security
-- Rôles : admin (tout), rh (dossiers du personnel, congés, présences),
--         paie (paramétrage et traitement de la paie), salarie (ses propres données).
-- =============================================================================

create table public.user_roles (
  user_id     uuid not null references auth.users(id) on delete cascade,
  role        text not null check (role in ('admin','rh','paie','salarie')),
  created_at  timestamptz not null default now(),
  primary key (user_id, role)
);

-- Fonctions d'aide (SECURITY DEFINER pour éviter la récursion RLS sur user_roles)
create or replace function public.has_role(p_roles text[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.user_roles ur
    where ur.user_id = (select auth.uid())
      and (ur.role = any(p_roles) or ur.role = 'admin')
  );
$$;

create or replace function public.my_employee_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select e.id from public.employees e where e.user_id = (select auth.uid()) limit 1;
$$;

-- Le tout premier utilisateur connecté peut se déclarer administrateur.
create or replace function public.claim_first_admin()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Authentification requise';
  end if;
  if exists (select 1 from public.user_roles where role = 'admin') then
    return false;
  end if;
  insert into public.user_roles(user_id, role) values ((select auth.uid()), 'admin');
  return true;
end;
$$;

revoke execute on function public.has_role(text[]) from public, anon;
revoke execute on function public.my_employee_id() from public, anon;
revoke execute on function public.claim_first_admin() from public, anon;
grant execute on function public.has_role(text[]) to authenticated;
grant execute on function public.my_employee_id() to authenticated;
grant execute on function public.claim_first_admin() to authenticated;

-- ------------------------------------------------------------- activation RLS
alter table public.user_roles                    enable row level security;
alter table public.companies                     enable row level security;
alter table public.departments                   enable row level security;
alter table public.designations                  enable row level security;
alter table public.collective_agreements         enable row level security;
alter table public.employee_grades               enable row level security;
alter table public.employees                     enable row level security;
alter table public.leave_types                   enable row level security;
alter table public.leave_allocations             enable row level security;
alter table public.leave_applications            enable row level security;
alter table public.attendance                    enable row level security;
alter table public.payroll_settings              enable row level security;
alter table public.tax_slabs                     enable row level security;
alter table public.tax_slab_brackets             enable row level security;
alter table public.ir_family_reductions          enable row level security;
alter table public.trimf_brackets                enable row level security;
alter table public.salary_components             enable row level security;
alter table public.salary_structures             enable row level security;
alter table public.salary_structure_components   enable row level security;
alter table public.salary_structure_assignments  enable row level security;
alter table public.payroll_inputs                enable row level security;
alter table public.additional_salaries           enable row level security;
alter table public.payroll_entries               enable row level security;
alter table public.salary_slips                  enable row level security;
alter table public.salary_slip_details           enable row level security;

-- ---------------------------------------------------------------- user_roles
create policy user_roles_select on public.user_roles for select to authenticated
  using (user_id = (select auth.uid()) or (select public.has_role(array['admin'])));
create policy user_roles_admin_ins on public.user_roles for insert to authenticated
  with check ((select public.has_role(array['admin'])));
create policy user_roles_admin_del on public.user_roles for delete to authenticated
  using ((select public.has_role(array['admin'])));

-- --------------------------------- référentiels : lecture pour tous, écriture RH
do $$
declare t text;
begin
  foreach t in array array['companies','departments','designations','collective_agreements',
                           'employee_grades','leave_types']
  loop
    execute format('create policy %1$s_read on public.%1$s for select to authenticated using (true);', t);
    execute format('create policy %1$s_ins on public.%1$s for insert to authenticated with check ((select public.has_role(array[''rh''])));', t);
    execute format('create policy %1$s_upd on public.%1$s for update to authenticated using ((select public.has_role(array[''rh'']))) with check ((select public.has_role(array[''rh''])));', t);
    execute format('create policy %1$s_del on public.%1$s for delete to authenticated using ((select public.has_role(array[''rh''])));', t);
  end loop;
end $$;

-- --------------------------------- paramétrage paie : lecture tous, écriture paie
do $$
declare t text;
begin
  foreach t in array array['payroll_settings','tax_slabs','tax_slab_brackets','ir_family_reductions',
                           'trimf_brackets','salary_components','salary_structures',
                           'salary_structure_components']
  loop
    execute format('create policy %1$s_read on public.%1$s for select to authenticated using (true);', t);
    execute format('create policy %1$s_ins on public.%1$s for insert to authenticated with check ((select public.has_role(array[''paie''])));', t);
    execute format('create policy %1$s_upd on public.%1$s for update to authenticated using ((select public.has_role(array[''paie'']))) with check ((select public.has_role(array[''paie''])));', t);
    execute format('create policy %1$s_del on public.%1$s for delete to authenticated using ((select public.has_role(array[''paie''])));', t);
  end loop;
end $$;

-- ------------------------------------------------------------------ salariés
create policy employees_select on public.employees for select to authenticated
  using ((select public.has_role(array['rh','paie'])) or user_id = (select auth.uid()));
create policy employees_ins on public.employees for insert to authenticated
  with check ((select public.has_role(array['rh'])));
create policy employees_upd on public.employees for update to authenticated
  using ((select public.has_role(array['rh']))) with check ((select public.has_role(array['rh'])));
create policy employees_del on public.employees for delete to authenticated
  using ((select public.has_role(array['rh'])));

-- --------------------------------------------- congés : allocations & demandes
create policy leave_alloc_select on public.leave_allocations for select to authenticated
  using ((select public.has_role(array['rh','paie'])) or employee_id = (select public.my_employee_id()));
create policy leave_alloc_ins on public.leave_allocations for insert to authenticated
  with check ((select public.has_role(array['rh'])));
create policy leave_alloc_upd on public.leave_allocations for update to authenticated
  using ((select public.has_role(array['rh']))) with check ((select public.has_role(array['rh'])));
create policy leave_alloc_del on public.leave_allocations for delete to authenticated
  using ((select public.has_role(array['rh'])));

create policy leave_app_select on public.leave_applications for select to authenticated
  using ((select public.has_role(array['rh','paie'])) or employee_id = (select public.my_employee_id()));
create policy leave_app_ins on public.leave_applications for insert to authenticated
  with check ((select public.has_role(array['rh']))
              or (employee_id = (select public.my_employee_id()) and status = 'Ouverte'));
create policy leave_app_upd on public.leave_applications for update to authenticated
  using ((select public.has_role(array['rh']))
         or (employee_id = (select public.my_employee_id()) and status = 'Ouverte'))
  with check ((select public.has_role(array['rh']))
              or (employee_id = (select public.my_employee_id()) and status in ('Ouverte','Annulée')));
create policy leave_app_del on public.leave_applications for delete to authenticated
  using ((select public.has_role(array['rh'])));

-- ---------------------------------------------------------------- présences
create policy attendance_select on public.attendance for select to authenticated
  using ((select public.has_role(array['rh','paie'])) or employee_id = (select public.my_employee_id()));
create policy attendance_ins on public.attendance for insert to authenticated
  with check ((select public.has_role(array['rh'])));
create policy attendance_upd on public.attendance for update to authenticated
  using ((select public.has_role(array['rh']))) with check ((select public.has_role(array['rh'])));
create policy attendance_del on public.attendance for delete to authenticated
  using ((select public.has_role(array['rh'])));

-- ------------------------------------- données de paie : équipe paie (RH en lecture)
do $$
declare t text;
begin
  foreach t in array array['salary_structure_assignments','payroll_inputs','additional_salaries',
                           'payroll_entries']
  loop
    execute format('create policy %1$s_read on public.%1$s for select to authenticated using ((select public.has_role(array[''paie'',''rh''])));', t);
    execute format('create policy %1$s_ins on public.%1$s for insert to authenticated with check ((select public.has_role(array[''paie''])));', t);
    execute format('create policy %1$s_upd on public.%1$s for update to authenticated using ((select public.has_role(array[''paie'']))) with check ((select public.has_role(array[''paie''])));', t);
    execute format('create policy %1$s_del on public.%1$s for delete to authenticated using ((select public.has_role(array[''paie''])));', t);
  end loop;
end $$;

-- ------------------------------------------- bulletins : paie + salarié (validés)
create policy salary_slips_select on public.salary_slips for select to authenticated
  using ((select public.has_role(array['paie','rh']))
         or (employee_id = (select public.my_employee_id()) and status = 'Validé'));
create policy salary_slips_ins on public.salary_slips for insert to authenticated
  with check ((select public.has_role(array['paie'])));
create policy salary_slips_upd on public.salary_slips for update to authenticated
  using ((select public.has_role(array['paie']))) with check ((select public.has_role(array['paie'])));
create policy salary_slips_del on public.salary_slips for delete to authenticated
  using ((select public.has_role(array['paie'])));

-- les lignes héritent de la visibilité du bulletin parent
create policy slip_details_select on public.salary_slip_details for select to authenticated
  using (exists (select 1 from public.salary_slips s where s.id = salary_slip_id));
create policy slip_details_ins on public.salary_slip_details for insert to authenticated
  with check ((select public.has_role(array['paie'])));
create policy slip_details_upd on public.salary_slip_details for update to authenticated
  using ((select public.has_role(array['paie']))) with check ((select public.has_role(array['paie'])));
create policy slip_details_del on public.salary_slip_details for delete to authenticated
  using ((select public.has_role(array['paie'])));
