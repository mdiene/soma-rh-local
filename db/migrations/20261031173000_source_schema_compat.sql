-- Compatibility for the current production schema discovered during migration.

alter table public.payroll_entries
  add column if not exists settings_snapshot jsonb;

alter table public.payroll_settings
  add column if not exists allowance_absence_basis text not null default 'gross',
  add column if not exists ipm_on_contractors boolean not null default false,
  add column if not exists severance_basis text not null default 'base_salary';

create table if not exists public.employee_requests (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  request_type text not null,
  amount numeric,
  target_date date,
  message text,
  status text not null default 'Ouverte',
  decision_note text,
  decided_by uuid references auth.users(id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  check (amount > 0),
  check (request_type <> 'acompte' or amount is not null),
  check (request_type in ('attestation_travail','attestation_salaire','acompte','correction_presence','donnees_personnelles','autre')),
  check (status in ('Ouverte',U&'Approuv\00E9e',U&'Rejet\00E9e',U&'Annul\00E9e'))
);

create table if not exists public.salary_payments (
  slip_id uuid primary key references public.salary_slips(id) on delete cascade,
  payment_mode text not null,
  status text not null default U&'\00C0 payer',
  paid_at date,
  reference text,
  note text,
  paid_by uuid default auth.uid() references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  check (status = U&'\00C0 payer' or paid_at is not null),
  check (status in (U&'\00C0 payer',U&'Pay\00E9'))
);

create table if not exists public.shift_types (
  code text primary key,
  label text not null,
  start_time time,
  end_time time,
  hours numeric not null default 0 check (hours between 0 and 24),
  is_night boolean not null default false,
  is_rest boolean not null default false,
  is_active boolean not null default true,
  sort_order integer not null default 100
);

create table if not exists public.work_posts (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  site text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.shift_assignments (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  work_date date not null,
  shift_code text not null references public.shift_types(code),
  post_id uuid references public.work_posts(id) on delete set null,
  notes text,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (employee_id, work_date)
);

create index if not exists employee_requests_employee_idx on public.employee_requests(employee_id);
create index if not exists shift_assignments_employee_idx on public.shift_assignments(employee_id);
create index if not exists shift_assignments_post_idx on public.shift_assignments(post_id);

alter table public.employee_requests enable row level security;
alter table public.salary_payments enable row level security;
alter table public.shift_types enable row level security;
alter table public.work_posts enable row level security;
alter table public.shift_assignments enable row level security;

create policy employee_requests_access on public.employee_requests for all to authenticated
  using ((select public.has_role(array['rh','paie'])) or employee_id = (select public.my_employee_id()))
  with check ((select public.has_role(array['rh','paie'])) or employee_id = (select public.my_employee_id()));
create policy salary_payments_access on public.salary_payments for all to authenticated
  using ((select public.has_role(array['paie'])))
  with check ((select public.has_role(array['paie'])));
create policy shift_types_read on public.shift_types for select to authenticated using (true);
create policy shift_types_admin on public.shift_types for all to authenticated
  using ((select public.has_role(array['rh','paie'])))
  with check ((select public.has_role(array['rh','paie'])));
create policy work_posts_read on public.work_posts for select to authenticated using (true);
create policy work_posts_admin on public.work_posts for all to authenticated
  using ((select public.has_role(array['rh'])))
  with check ((select public.has_role(array['rh'])));
create policy shift_assignments_access on public.shift_assignments for all to authenticated
  using ((select public.has_role(array['rh'])) or employee_id = (select public.my_employee_id()))
  with check ((select public.has_role(array['rh'])) or employee_id = (select public.my_employee_id()));
