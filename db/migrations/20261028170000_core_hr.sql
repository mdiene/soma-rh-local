-- =============================================================================
-- SOMA-RH — 01 : Noyau RH (inspiré de Frappe HRMS : Company, Department,
-- Designation, Employee Grade, Employee, Leave, Attendance)
-- Adapté au classeur « GESTION DE LA PAIE DES CONGES » (feuilles
-- FICHE DE PERSONNEL et PARAMETRES).
-- =============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- utilitaires
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ------------------------------------------------------------------ sociétés
create table public.companies (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  legal_form    text,
  share_capital numeric,
  address       text,
  phone         text,
  email         text,
  ninea         text,
  rccm          text,
  logo_url      text,
  currency      text not null default 'XOF',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
comment on table public.companies is 'Sociétés employeuses (Frappe: Company).';

-- -------------------------------------------------------------- départements
create table public.departments (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id) on delete cascade,
  name        text not null,
  parent_id   uuid references public.departments(id) on delete set null,
  created_at  timestamptz not null default now(),
  unique (company_id, name)
);
create index departments_parent_idx on public.departments(parent_id);

-- ------------------------------------------------------- fonctions / emplois
create table public.designations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  created_at  timestamptz not null default now()
);
comment on table public.designations is 'Emplois / fonctions (Frappe: Designation ; Excel: colonne fonction).';

-- -------------------------------------------- conventions collectives & grilles
create table public.collective_agreements (
  code        text primary key,
  name        text not null,
  created_at  timestamptz not null default now()
);
comment on table public.collective_agreements is 'Conventions collectives (Excel: PARAMETRES!CONVENTIONS_COLLECTIVES).';

create table public.employee_grades (
  id              uuid primary key default gen_random_uuid(),
  agreement_code  text not null references public.collective_agreements(code) on update cascade,
  code            text not null,                       -- catégorie (ex. « 2ème », « A.M.4 »)
  hourly_rate     numeric not null,                    -- TH
  base_salary     numeric not null,                    -- salaire de base mensuel (173,33 h)
  staff_status    text not null,                       -- Ouvriers / Employés / Agents de maîtrise / Cadres …
  grade_class     text,                                -- classe (I..IV) si la convention en prévoit
  effective_from  date not null default date '2023-01-01',
  created_at      timestamptz not null default now(),
  unique nulls not distinct (agreement_code, code, staff_status, grade_class, effective_from)
);
create index employee_grades_agreement_idx on public.employee_grades(agreement_code);
comment on table public.employee_grades is 'Grille des salaires minima par convention et catégorie (Frappe: Employee Grade ; Excel: table CC).';

-- ----------------------------------------------------------------- salariés
create table public.employees (
  id                       uuid primary key default gen_random_uuid(),
  company_id               uuid not null references public.companies(id),
  employee_number          text not null unique,                   -- MATRICULE
  first_name               text not null,
  last_name                text not null,
  gender                   text check (gender in ('M','F')),
  date_of_birth            date,
  place_of_birth           text,
  nationality              text,
  father_name              text,
  mother_name              text,
  id_document_number       text,                                    -- CNI ou passeport
  id_issue_date            date,
  id_expiry_date           date,
  ninea                    text,
  ipres_number             text,
  css_number               text,                                    -- N° allocation familiale
  address                  text,
  phone_personal           text,
  phone_work               text,
  email_personal           text,
  email_work               text,
  emergency_contact_name   text,
  emergency_contact_phone  text,
  marital_status           text check (marital_status in ('Marié(e)','Célibataire','Divorcé(e)','Veuf(ve)')),
  spouses_count            smallint not null default 0 check (spouses_count >= 0),
  children_count           smallint not null default 0 check (children_count >= 0),
  trimf_parts              numeric(4,1) not null default 1 check (trimf_parts > 0),
  ir_parts                 numeric(4,1) not null default 1 check (ir_parts between 1 and 5),  -- quotient familial
  designation_id           uuid references public.designations(id),
  department_id            uuid references public.departments(id),
  agreement_code           text references public.collective_agreements(code) on update cascade,
  grade_id                 uuid references public.employee_grades(id),
  employment_type          text not null check (employment_type in ('CDI','CDD','COD','STAGE','APPRENTISSAGE','PRESTATION')),
  date_of_joining          date not null,                           -- date d'entrée
  contract_start           date,                                    -- DATE DEBUT (contrat en cours)
  contract_end             date,                                    -- DATE DE FIN
  relieving_date           date,                                    -- date de sortie
  exit_reason              text check (exit_reason in ('DEMISSION','LICENCIEMENT','RETRAITE','DECES','FIN DE CONTRAT')),
  leave_return_date        date,                                    -- date retour de congé
  bank_name                text,
  bank_account             text,                                    -- RIB
  payment_mode             text not null default 'espèces' check (payment_mode in ('espèces','virement','chèque','mobile money')),
  status                   text not null default 'Active' check (status in ('Active','Inactive','Suspended','Left')),
  user_id                  uuid unique references auth.users(id) on delete set null,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  check (relieving_date is null or relieving_date >= date_of_joining),
  check (relieving_date is null or exit_reason is not null)
);
create index employees_company_idx     on public.employees(company_id);
create index employees_designation_idx on public.employees(designation_id);
create index employees_department_idx  on public.employees(department_id);
create index employees_grade_idx       on public.employees(grade_id);
create index employees_agreement_idx   on public.employees(agreement_code);
create index employees_status_idx      on public.employees(status);
create trigger employees_updated_at before update on public.employees
  for each row execute function public.set_updated_at();
comment on table public.employees is 'Fiche de personnel (Frappe: Employee ; Excel: FICHE DE PERSONNEL).';

-- ------------------------------------------------------------------- congés
create table public.leave_types (
  code               text primary key,
  name               text not null,
  is_paid            boolean not null default true,
  affects_payroll    text not null default 'none'
                     check (affects_payroll in ('none','absence','sick_leave')),
  days_per_month     numeric not null default 0,       -- acquisition mensuelle (2 j ouvrables / mois au Sénégal)
  max_days_per_year  numeric,
  created_at         timestamptz not null default now()
);

create table public.leave_allocations (
  id            uuid primary key default gen_random_uuid(),
  employee_id   uuid not null references public.employees(id) on delete cascade,
  leave_type    text not null references public.leave_types(code),
  from_date     date not null,
  to_date       date not null,
  days          numeric not null check (days >= 0),
  notes         text,
  created_at    timestamptz not null default now(),
  check (to_date >= from_date)
);
create index leave_allocations_employee_idx on public.leave_allocations(employee_id);
create index leave_allocations_type_idx on public.leave_allocations(leave_type);

create table public.leave_applications (
  id            uuid primary key default gen_random_uuid(),
  employee_id   uuid not null references public.employees(id) on delete cascade,
  leave_type    text not null references public.leave_types(code),
  from_date     date not null,
  to_date       date not null,
  half_day      boolean not null default false,
  total_days    numeric generated always as
                  (case when half_day then 0.5 else (to_date - from_date + 1) end) stored,
  reason        text,
  status        text not null default 'Ouverte' check (status in ('Ouverte','Approuvée','Rejetée','Annulée')),
  approver_id   uuid references auth.users(id) on delete set null,
  approved_at   timestamptz,
  created_by    uuid references auth.users(id) on delete set null default auth.uid(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (to_date >= from_date)
);
create index leave_applications_employee_idx on public.leave_applications(employee_id);
create index leave_applications_type_idx on public.leave_applications(leave_type);
create index leave_applications_dates_idx on public.leave_applications(from_date, to_date);
create index leave_applications_approver_idx on public.leave_applications(approver_id);
create index leave_applications_created_by_idx on public.leave_applications(created_by);
create trigger leave_applications_updated_at before update on public.leave_applications
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------- présences
create table public.attendance (
  id               uuid primary key default gen_random_uuid(),
  employee_id      uuid not null references public.employees(id) on delete cascade,
  attendance_date  date not null,
  status           text not null check (status in ('Présent','Absent','Demi-journée','Congé','Maladie')),
  working_hours    numeric check (working_hours >= 0),
  absence_hours    numeric not null default 0 check (absence_hours >= 0),
  overtime_15      numeric not null default 0 check (overtime_15 >= 0),
  overtime_40      numeric not null default 0 check (overtime_40 >= 0),
  overtime_60      numeric not null default 0 check (overtime_60 >= 0),
  overtime_100     numeric not null default 0 check (overtime_100 >= 0),
  leave_application_id uuid references public.leave_applications(id) on delete set null,
  notes            text,
  created_at       timestamptz not null default now(),
  unique (employee_id, attendance_date)
);
create index attendance_date_idx on public.attendance(attendance_date);
create index attendance_leave_idx on public.attendance(leave_application_id);
comment on table public.attendance is 'Pointage journalier (Frappe: Attendance) — agrégé en heures d''absence / HS pour la paie.';
