-- =============================================================================
-- SOMA-RH — 02 : Structure et traitement de la paie
-- (Frappe: Salary Component, Salary Structure, Salary Structure Assignment,
--  Income Tax Slab, Additional Salary, Payroll Entry, Salary Slip)
-- Paramètres repris de PARAMETRES!A1:E12 et des formules de
-- « élements de salaires » (IR, TRIMF, IPRES, CSS, IPM, CFCE, BRS).
-- =============================================================================

-- ------------------------------------------------------ paramètres de paie
create table public.payroll_settings (
  id                         uuid primary key default gen_random_uuid(),
  effective_from             date not null unique,
  monthly_hours              numeric not null default 173.33,     -- base horaire mensuelle (173,33 h)
  hourly_rate_divisor        numeric not null default 173.3333333333333333, -- 40*52/12 (calcul du TH)
  cfce_rate                  numeric not null default 0.03,
  brs_rate                   numeric not null default 0.05,
  ipres_rg_ceiling           numeric not null default 432000,     -- 360 000 x 1,2
  ipres_rg_rate              numeric not null default 0.14,
  ipres_rg_employee_share    numeric not null default 0.4,
  ipres_rc_ceiling           numeric not null default 1296000,    -- 1 080 000 x 1,2
  ipres_rc_rate              numeric not null default 0.06,
  ipres_rc_employee_share    numeric not null default 0.4,
  css_ceiling                numeric not null default 63000,
  css_af_rate                numeric not null default 0.07,
  css_at_rate                numeric not null default 0.05,
  ipm_ceiling                numeric not null default 10000,
  ipm_rate                   numeric not null default 1,
  ipm_employee_share         numeric not null default 0.5,
  transport_allowance        numeric not null default 26000,
  smig_hourly                numeric not null default 370.526,
  meal_allowance_factor      numeric not null default 3,          -- indemnité de panier = nb x SMIG x 3
  km_allowance               numeric not null default 50000,
  ir_abatement_rate          numeric not null default 0.30,
  ir_abatement_cap           numeric not null default 900000,
  precarity_rate             numeric not null default 0.07,
  seniority_min_years        integer not null default 2,
  created_at                 timestamptz not null default now()
);
comment on table public.payroll_settings is 'Taux, plafonds et constantes (Excel: PARAMETRES!A1:E12). Une ligne par date d''effet.';

-- ------------------------------------------ barème IR (Frappe: Income Tax Slab)
create table public.tax_slabs (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  effective_from  date not null unique,
  created_at      timestamptz not null default now()
);

create table public.tax_slab_brackets (
  id          uuid primary key default gen_random_uuid(),
  slab_id     uuid not null references public.tax_slabs(id) on delete cascade,
  from_amount numeric not null,              -- revenu annuel imposable arrondi au millier inférieur
  rate        numeric not null check (rate >= 0 and rate < 1),
  unique (slab_id, from_amount)
);

create table public.ir_family_reductions (
  id          uuid primary key default gen_random_uuid(),
  slab_id     uuid not null references public.tax_slabs(id) on delete cascade,
  parts       numeric(4,1) not null,
  rate        numeric not null,
  min_amount  numeric not null,
  max_amount  numeric not null,
  unique (slab_id, parts)
);
comment on table public.ir_family_reductions is 'Réductions d''impôt pour charges de famille selon le nombre de parts (quotient familial).';

create table public.trimf_brackets (
  id                uuid primary key default gen_random_uuid(),
  slab_id           uuid not null references public.tax_slabs(id) on delete cascade,
  min_annual_gross  numeric not null,
  annual_amount     numeric not null,
  per_part          boolean not null default true,   -- montant x parts TRIMF
  unique (slab_id, min_annual_gross)
);
comment on table public.trimf_brackets is 'Taxe représentative de l''impôt du minimum fiscal (TRIMF).';

-- ---------------------------------------------- composants (rubriques) de paie
create table public.salary_components (
  code             text primary key,
  name             text not null,
  rubric_number    integer,                     -- N° de rubrique du bulletin Excel
  component_type   text not null check (component_type in
                     ('gross_earning','statutory_deduction','employer_contribution',
                      'non_taxable_earning','net_deduction','rounding')),
  input_mode       text not null default 'computed' check (input_mode in ('computed','variable','fixed')),
  is_active        boolean not null default true,
  description      text,
  created_at       timestamptz not null default now()
);
comment on table public.salary_components is 'Rubriques de paie (Frappe: Salary Component). input_mode=variable => saisie mensuelle via additional_salaries.';

-- --------------------------------------------------------- structures salariales
create table public.salary_structures (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references public.companies(id) on delete cascade,
  name         text not null,
  description  text,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  unique (company_id, name)
);

create table public.salary_structure_components (
  structure_id    uuid not null references public.salary_structures(id) on delete cascade,
  component_code  text not null references public.salary_components(code) on update cascade,
  sort_order      integer not null default 0,
  primary key (structure_id, component_code)
);
create index salary_structure_components_component_idx on public.salary_structure_components(component_code);

create table public.salary_structure_assignments (
  id                  uuid primary key default gen_random_uuid(),
  employee_id         uuid not null references public.employees(id) on delete cascade,
  structure_id        uuid not null references public.salary_structures(id),
  from_date           date not null,
  base_salary         numeric,                                  -- null => salaire de base de la catégorie
  sursalaire          numeric not null default 0,
  fees                numeric not null default 0,               -- honoraires prestataires (fixe mensuel)
  other_fixed         numeric not null default 0,               -- colonne « xxxxxxxx » (autre élément fixe)
  transport_mode      text not null default 'Prime de transport'
                      check (transport_mode in ('Prime de transport','Indemnité kilométrique','Aucun')),
  leave_paid_monthly  boolean not null default true,            -- « le congé est-il à payer ? » (OUI)
  target_net          numeric,                                  -- « Net à simuler » (valeur cible)
  notes               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (employee_id, from_date)
);
create index ssa_structure_idx on public.salary_structure_assignments(structure_id);
create trigger ssa_updated_at before update on public.salary_structure_assignments
  for each row execute function public.set_updated_at();
comment on table public.salary_structure_assignments is 'Affectation de structure (Frappe: Salary Structure Assignment) : base, sursalaire, transport…';

-- ------------------------------------------------ variables mensuelles de paie
create table public.payroll_inputs (
  id                 uuid primary key default gen_random_uuid(),
  employee_id        uuid not null references public.employees(id) on delete cascade,
  period             date not null check (extract(day from period) = 1),   -- 1er jour du mois
  absence_hours      numeric not null default 0 check (absence_hours >= 0),
  sick_leave_hours   numeric not null default 0 check (sick_leave_hours >= 0),
  sick_leave_rate    numeric not null default 1 check (sick_leave_rate between 0 and 1),
  meal_count         numeric not null default 0 check (meal_count >= 0),
  overtime_15        numeric not null default 0 check (overtime_15 >= 0),
  overtime_40        numeric not null default 0 check (overtime_40 >= 0),
  overtime_60        numeric not null default 0 check (overtime_60 >= 0),
  overtime_100       numeric not null default 0 check (overtime_100 >= 0),
  leave_allowance    numeric not null default 0,       -- allocation congé du mois (colonne « Congé »)
  previous_rounding  numeric not null default 0,       -- appoint du mois précédent
  notes              text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (employee_id, period)
);
create index payroll_inputs_period_idx on public.payroll_inputs(period);
create trigger payroll_inputs_updated_at before update on public.payroll_inputs
  for each row execute function public.set_updated_at();
comment on table public.payroll_inputs is 'Éléments variables du mois (Excel: colonnes W à AE, AY, CQ de « élements de salaires »).';

create table public.additional_salaries (
  id              uuid primary key default gen_random_uuid(),
  employee_id     uuid not null references public.employees(id) on delete cascade,
  period          date not null check (extract(day from period) = 1),
  component_code  text not null references public.salary_components(code) on update cascade,
  amount          numeric not null check (amount >= 0),
  notes           text,
  created_at      timestamptz not null default now(),
  unique (employee_id, period, component_code)
);
create index additional_salaries_period_idx on public.additional_salaries(period);
create index additional_salaries_component_idx on public.additional_salaries(component_code);
comment on table public.additional_salaries is 'Primes et retenues ponctuelles du mois (Frappe: Additional Salary). Montants toujours positifs.';

-- ----------------------------------------------------------- traitement de paie
create table public.payroll_entries (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references public.companies(id),
  period_start   date not null,
  period_end     date not null,
  posting_date   date not null default current_date,
  payment_mode   text not null default 'espèces',
  status         text not null default 'Brouillon'
                 check (status in ('Brouillon','Calculée','Validée','Annulée')),
  notes          text,
  created_by     uuid references auth.users(id) on delete set null default auth.uid(),
  submitted_by   uuid references auth.users(id) on delete set null,
  submitted_at   timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  check (period_end >= period_start)
);
create unique index payroll_entries_unique_period
  on public.payroll_entries(company_id, period_start) where status <> 'Annulée';
create index payroll_entries_created_by_idx on public.payroll_entries(created_by);
create index payroll_entries_submitted_by_idx on public.payroll_entries(submitted_by);
create trigger payroll_entries_updated_at before update on public.payroll_entries
  for each row execute function public.set_updated_at();

create table public.salary_slips (
  id                        uuid primary key default gen_random_uuid(),
  payroll_entry_id          uuid references public.payroll_entries(id) on delete cascade,
  employee_id               uuid not null references public.employees(id),
  period_start              date not null,
  period_end                date not null,
  status                    text not null default 'Brouillon' check (status in ('Brouillon','Validé','Annulé')),
  -- instantané de la fiche au moment du calcul
  employee_number           text not null,
  employee_name             text not null,
  designation               text,
  address                   text,
  grade_code                text,
  grade_class               text,
  staff_status              text,
  employment_type           text,
  contract_situation        text,          -- TRAVAIL / STAGE / APPRENTISSAGE / PRESTATION
  date_of_joining           date,
  seniority_years           integer,
  seniority_months          integer,
  marital_status            text,
  spouses_count             smallint,
  children_count            smallint,
  trimf_parts               numeric,
  ir_parts                  numeric,
  payment_mode              text,
  hourly_rate               numeric,
  -- totaux (pleine précision, comme l'Excel)
  gross_pay                 numeric not null default 0,   -- BRUT
  income_tax                numeric not null default 0,   -- IR
  trimf                     numeric not null default 0,
  total_employee_deductions numeric not null default 0,   -- TOTAL RETENUES
  net_remuneration          numeric not null default 0,   -- Rémunération nette
  total_non_taxable         numeric not null default 0,   -- indemnités hors brut
  total_net_deductions      numeric not null default 0,   -- avances, coopérative…
  net_pay                   numeric not null default 0,   -- NET A PAYER
  employer_charges          numeric not null default 0,   -- CHARGES PATRONALES
  payroll_cost              numeric not null default 0,   -- MASSE SALARIALE
  ipres_rg_base             numeric not null default 0,
  ipres_rc_base             numeric not null default 0,
  css_base                  numeric not null default 0,
  ipm_base                  numeric not null default 0,
  leave_provision           numeric not null default 0,   -- provision congé du mois
  calculation               jsonb,                        -- trace complète du calcul
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  check (period_end >= period_start)
);
create unique index salary_slips_unique_period
  on public.salary_slips(employee_id, period_start) where status <> 'Annulé';
create index salary_slips_entry_idx on public.salary_slips(payroll_entry_id);
create index salary_slips_period_idx on public.salary_slips(period_start);
create trigger salary_slips_updated_at before update on public.salary_slips
  for each row execute function public.set_updated_at();

create table public.salary_slip_details (
  id               uuid primary key default gen_random_uuid(),
  salary_slip_id   uuid not null references public.salary_slips(id) on delete cascade,
  component_code   text not null references public.salary_components(code) on update cascade,
  label            text not null,
  section          text not null check (section in ('gain','retenue','patronal','indemnite','retenue_net','appoint')),
  sort_order       integer not null,
  base             numeric,
  quantity         numeric,
  employee_rate    numeric,
  gain_amount      numeric not null default 0,
  deduction_amount numeric not null default 0,
  employer_rate    numeric,
  employer_amount  numeric not null default 0
);
create index salary_slip_details_slip_idx on public.salary_slip_details(salary_slip_id);
create index salary_slip_details_component_idx on public.salary_slip_details(component_code);
comment on table public.salary_slip_details is 'Lignes du bulletin (Excel: BULLETIN!A18:J67).';
