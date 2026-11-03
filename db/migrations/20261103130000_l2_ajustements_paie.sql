-- =============================================================================
-- L2 — Un seul chemin vers le bulletin : salaire additionnel unifié (I6, I7)
--  L2-01 : additional_salaries reçoit kind/source_id ; éléments récurrents (recurring_pay_items)
--  L2-02 : régularisations après clôture (payroll_corrections) appliquées sur la période ouverte suivante
--  L2-03 : prêts (loans, loan_installments), somme des échéances = capital (I20)
--  L2-04 : un prêt peut référencer une demande d'acompte (employee_requests)
-- Principe : compute_salary_slip n'est PAS modifié. Il lit additional_salaries pour la période ;
-- apply_period_adjustments y dépose, avant le calcul, les lignes dérivées (idempotent, I19).
-- Une saisie manuelle (kind = 'ponctuel') prime toujours sur une ligne dérivée de même rubrique.
-- =============================================================================

-- ------------------------------------------------------------ rubriques générées (masquées à la saisie)
insert into public.salary_components (code, name, component_type, input_mode, is_active, description) values
  ('REGUL_BRUT', 'Régularisation (brut imposable)', 'gross_earning', 'variable', false, 'Généré automatiquement à partir des régularisations : ne pas saisir.'),
  ('RET_REGUL',  'Retenue de régularisation',       'net_deduction', 'variable', false, 'Généré automatiquement à partir des régularisations : ne pas saisir.'),
  ('RET_PRET',   'Remboursement de prêt',           'net_deduction', 'variable', false, 'Généré automatiquement à partir des échéances de prêt : ne pas saisir.')
on conflict (code) do nothing;

-- ------------------------------------------------------------ L2-01 salaire additionnel
alter table public.additional_salaries
  add column if not exists kind text not null default 'ponctuel'
    check (kind in ('ponctuel', 'recurrent', 'pret', 'regularisation')),
  add column if not exists source_id uuid;
create index if not exists additional_salaries_kind_period_idx on public.additional_salaries(period) where kind <> 'ponctuel';

create table if not exists public.recurring_pay_items (
  id             uuid primary key default gen_random_uuid(),
  employee_id    uuid not null references public.employees(id) on delete cascade,
  component_code text not null references public.salary_components(code),
  amount         numeric not null check (amount > 0),
  from_period    date not null check (from_period = date_trunc('month', from_period)::date),
  to_period      date check (to_period is null or (to_period = date_trunc('month', to_period)::date and to_period >= from_period)),
  active         boolean not null default true,
  notes          text,
  created_by     uuid references auth.users(id) on delete set null default auth.uid(),
  created_at     timestamptz not null default now()
);
comment on table public.recurring_pay_items is 'Prime ou retenue reconduite chaque mois entre from_period et to_period (inclus). Rubriques à saisie variable uniquement.';
create index if not exists recurring_pay_items_employee_idx on public.recurring_pay_items(employee_id);
create index if not exists recurring_pay_items_component_idx on public.recurring_pay_items(component_code);
create index if not exists recurring_pay_items_created_by_idx on public.recurring_pay_items(created_by);

-- ------------------------------------------------------------ L2-03 prêts
create table if not exists public.loans (
  id             uuid primary key default gen_random_uuid(),
  employee_id    uuid not null references public.employees(id) on delete cascade,
  label          text not null check (length(trim(label)) > 0),
  principal      numeric not null check (principal > 0),
  installments   integer not null check (installments between 1 and 60),
  first_period   date not null check (first_period = date_trunc('month', first_period)::date),
  status         text not null default 'Actif' check (status in ('Actif', 'Soldé', 'Annulé')),
  request_id     uuid references public.employee_requests(id) on delete set null,
  cancel_reason  text,
  created_by     uuid references auth.users(id) on delete set null default auth.uid(),
  created_at     timestamptz not null default now()
);
create index if not exists loans_employee_idx on public.loans(employee_id);
create index if not exists loans_request_idx on public.loans(request_id);
create index if not exists loans_created_by_idx on public.loans(created_by);

create table if not exists public.loan_installments (
  id         uuid primary key default gen_random_uuid(),
  loan_id    uuid not null references public.loans(id) on delete cascade,
  due_period date not null,
  amount     numeric not null check (amount > 0),
  status     text not null default 'Prévue' check (status in ('Prévue', 'Retenue', 'Annulée')),
  applied_period date,
  unique (loan_id, due_period)
);
alter table public.loan_installments add column if not exists applied_period date;
create index if not exists loan_installments_due_idx on public.loan_installments(due_period) where status <> 'Annulée';

-- ------------------------------------------------------------ L2-02 régularisations
create table if not exists public.payroll_corrections (
  id             uuid primary key default gen_random_uuid(),
  employee_id    uuid not null references public.employees(id) on delete cascade,
  source_period  date not null check (source_period = date_trunc('month', source_period)::date),
  kind           text not null check (kind in ('gain', 'retenue')),
  amount         numeric not null check (amount > 0),
  reason         text not null check (length(trim(reason)) > 0),
  status         text not null default 'En attente' check (status in ('En attente', 'Appliquée', 'Annulée')),
  applied_period date,
  created_by     uuid references auth.users(id) on delete set null default auth.uid(),
  created_at     timestamptz not null default now()
);
comment on table public.payroll_corrections is 'Correction d''un mois déjà validé : appliquée comme ligne de régularisation sur la prochaine période calculée, le mois d''origine reste intact.';
create index if not exists payroll_corrections_employee_idx on public.payroll_corrections(employee_id);
create index if not exists payroll_corrections_status_idx on public.payroll_corrections(status, source_period);
create index if not exists payroll_corrections_created_by_idx on public.payroll_corrections(created_by);

-- ------------------------------------------------------------ RLS : lecture rh/paie, écriture par RPC
alter table public.recurring_pay_items enable row level security;
alter table public.loans enable row level security;
alter table public.loan_installments enable row level security;
alter table public.payroll_corrections enable row level security;

drop policy if exists recurring_pay_items_read on public.recurring_pay_items;
create policy recurring_pay_items_read on public.recurring_pay_items for select to authenticated
  using ((select public.has_role(array['rh', 'paie'])));
drop policy if exists recurring_pay_items_write on public.recurring_pay_items;
create policy recurring_pay_items_write on public.recurring_pay_items for all to authenticated
  using ((select public.has_role(array['rh', 'paie']))) with check ((select public.has_role(array['rh', 'paie'])));

drop policy if exists loans_read on public.loans;
create policy loans_read on public.loans for select to authenticated using ((select public.has_role(array['rh', 'paie'])));
drop policy if exists loan_installments_read on public.loan_installments;
create policy loan_installments_read on public.loan_installments for select to authenticated using ((select public.has_role(array['rh', 'paie'])));
drop policy if exists payroll_corrections_read on public.payroll_corrections;
create policy payroll_corrections_read on public.payroll_corrections for select to authenticated using ((select public.has_role(array['rh', 'paie'])));
revoke insert, update, delete on public.loans, public.loan_installments, public.payroll_corrections from anon, authenticated;

drop trigger if exists recurring_pay_items_audit on public.recurring_pay_items;
create trigger recurring_pay_items_audit after insert or update or delete on public.recurring_pay_items
  for each row execute function public.business_audit();
drop trigger if exists loans_audit on public.loans;
create trigger loans_audit after insert or update or delete on public.loans
  for each row execute function public.business_audit();
drop trigger if exists payroll_corrections_audit on public.payroll_corrections;
create trigger payroll_corrections_audit after insert or update or delete on public.payroll_corrections
  for each row execute function public.business_audit();

-- ------------------------------------------------------------ RPC : prêts
create or replace function public.create_loan(
  p_employee_id uuid, p_label text, p_principal numeric, p_installments integer,
  p_first_period date, p_request_id uuid default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_first date := date_trunc('month', p_first_period)::date;
  v_each numeric;
  i integer;
begin
  if not public.has_role(array['rh', 'paie']) then
    raise exception 'Droits insuffisants : rôle « rh » ou « paie » requis pour accorder un prêt';
  end if;
  if p_principal is null or p_principal <= 0 then raise exception 'Le montant du prêt doit être strictement positif'; end if;
  if p_installments is null or p_installments < 1 or p_installments > 60 then
    raise exception 'Le nombre d''échéances doit être compris entre 1 et 60';
  end if;
  if p_principal <> round(p_principal) then raise exception 'Le montant du prêt doit être en francs entiers (FCFA)'; end if;
  if p_principal < p_installments then
    raise exception 'Le montant du prêt (%) doit être au moins égal au nombre d''échéances (%)', p_principal, p_installments;
  end if;
  if exists (select 1 from public.payroll_entries
              where date_trunc('month', period_start)::date >= v_first and status in ('Validée', 'Payée', 'Clôturée')) then
    raise exception 'La première échéance (%) tombe dans un mois dont la paie est déjà validée : choisissez le premier mois non validé', to_char(v_first, 'MM/YYYY');
  end if;
  if not exists (select 1 from public.employees where id = p_employee_id and status = 'Active') then
    raise exception 'Salarié introuvable ou inactif';
  end if;
  if coalesce(trim(p_label), '') = '' then raise exception 'Un libellé est obligatoire'; end if;

  insert into public.loans (employee_id, label, principal, installments, first_period, request_id)
  values (p_employee_id, trim(p_label), p_principal, p_installments, v_first, p_request_id)
  returning id into v_id;

  -- échéances entières ; la dernière absorbe le reste : somme des échéances = capital exactement
  v_each := floor(p_principal / p_installments);
  for i in 1..p_installments loop
    insert into public.loan_installments (loan_id, due_period, amount)
    values (v_id, (v_first + make_interval(months => i - 1))::date,
            case when i = p_installments then p_principal - v_each * (p_installments - 1) else v_each end);
  end loop;
  return v_id;
end;
$$;

create or replace function public.cancel_loan(p_loan_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.has_role(array['rh', 'paie']) then
    raise exception 'Droits insuffisants : rôle « rh » ou « paie » requis pour annuler un prêt';
  end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'Un motif est obligatoire pour annuler un prêt'; end if;
  if not exists (select 1 from public.loans where id = p_loan_id and status = 'Actif') then
    raise exception 'Prêt introuvable ou déjà soldé/annulé';
  end if;
  -- les échéances déjà retenues restent dues : seules les échéances à venir sont annulées
  update public.loan_installments set status = 'Annulée' where loan_id = p_loan_id and status = 'Prévue';
  update public.loans set status = 'Annulé', cancel_reason = trim(p_reason) where id = p_loan_id;
end;
$$;

-- solde d'un prêt (lecture seule)
create or replace view public.loan_balances with (security_invoker = true) as
select l.id as loan_id, l.employee_id, l.label, l.principal, l.status,
       coalesce(sum(i.amount) filter (where i.status = 'Retenue'), 0) as retenu,
       coalesce(sum(i.amount) filter (where i.status = 'Prévue'), 0) as restant,
       min(i.due_period) filter (where i.status = 'Prévue') as prochaine_echeance
  from public.loans l left join public.loan_installments i on i.loan_id = l.id
 group by l.id;

-- ------------------------------------------------------------ RPC : régularisation
create or replace function public.create_payroll_correction(
  p_employee_id uuid, p_source_period date, p_kind text, p_amount numeric, p_reason text
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_src date := date_trunc('month', p_source_period)::date;
  v_id uuid;
begin
  if not public.has_role(array['rh', 'paie']) then
    raise exception 'Droits insuffisants : rôle « rh » ou « paie » requis pour saisir une régularisation';
  end if;
  if p_kind not in ('gain', 'retenue') then raise exception 'Le type doit être « gain » ou « retenue »'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Le montant doit être strictement positif'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'Un motif est obligatoire pour une régularisation'; end if;
  if not exists (select 1 from public.payroll_entries
                  where date_trunc('month', period_start)::date = v_src and status in ('Validée', 'Payée', 'Clôturée')) then
    raise exception 'La paie de % n''est pas encore validée : corrigez directement les variables du mois au lieu de saisir une régularisation', to_char(v_src, 'MM/YYYY');
  end if;
  insert into public.payroll_corrections (employee_id, source_period, kind, amount, reason)
  values (p_employee_id, v_src, p_kind, p_amount, trim(p_reason))
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.cancel_payroll_correction(p_correction_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.has_role(array['rh', 'paie']) then
    raise exception 'Droits insuffisants : rôle « rh » ou « paie » requis';
  end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'Un motif est obligatoire pour annuler une régularisation'; end if;
  update public.payroll_corrections
     set status = 'Annulée', reason = reason || ' [annulée : ' || trim(p_reason) || ']'
   where id = p_correction_id and status = 'En attente';
  if not found then raise exception 'Seule une régularisation « En attente » peut être annulée'; end if;
end;
$$;

-- ------------------------------------------------------------ dépôt des lignes dérivées avant calcul
create or replace function public.apply_period_adjustments(p_payroll_entry_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  pe public.payroll_entries;
  p date;
begin
  if not public.has_role(array['rh', 'paie']) then
    raise exception 'Droits insuffisants : rôle « rh » ou « paie » requis';
  end if;
  select * into pe from public.payroll_entries where id = p_payroll_entry_id;
  if not found or pe.status in ('Validée', 'Payée', 'Clôturée', 'Annulée') then return; end if;
  p := date_trunc('month', pe.period_start)::date;

  -- libère ce qui avait été appliqué à une période dont le traitement a été annulé
  update public.payroll_corrections c set status = 'En attente', applied_period = null
   where c.status = 'Appliquée' and c.applied_period is not null
     and not exists (select 1 from public.payroll_entries e
                      where date_trunc('month', e.period_start)::date = c.applied_period and e.status <> 'Annulée');
  update public.loan_installments i set status = 'Prévue', applied_period = null
   where i.status = 'Retenue' and i.applied_period is not null
     and not exists (select 1 from public.payroll_entries e
                      where date_trunc('month', e.period_start)::date = i.applied_period and e.status <> 'Annulée');

  create temp table if not exists pg_temp.adj_desired (
    employee_id uuid, component_code text, amount numeric, kind text, source_id uuid
  ) on commit drop;
  truncate pg_temp.adj_desired;

  -- éléments récurrents (rubriques à saisie variable)
  insert into pg_temp.adj_desired
  select r.employee_id, r.component_code, r.amount, 'recurrent', r.id
    from public.recurring_pay_items r
    join public.salary_components c on c.code = r.component_code and c.input_mode = 'variable'
   where r.active and r.from_period <= p and (r.to_period is null or r.to_period >= p);

  -- échéances de prêt échues non encore retenues (ou déjà retenues dans cette période), une ligne par salarié
  insert into pg_temp.adj_desired
  select l.employee_id, 'RET_PRET', sum(i.amount), 'pret', null::uuid
    from public.loan_installments i join public.loans l on l.id = i.loan_id
   where l.status = 'Actif'
     and ((i.status = 'Prévue' and i.due_period <= p) or (i.status = 'Retenue' and i.applied_period = p))
   group by l.employee_id;

  -- régularisations en attente (ou déjà appliquées à cette période) venant d'un mois antérieur
  insert into pg_temp.adj_desired
  select c.employee_id, case c.kind when 'gain' then 'REGUL_BRUT' else 'RET_REGUL' end, sum(c.amount), 'regularisation', null::uuid
    from public.payroll_corrections c
   where c.source_period < p and (c.status = 'En attente' or (c.status = 'Appliquée' and c.applied_period = p))
   group by c.employee_id, c.kind;

  -- ne touche que ce qui a changé (pas de bruit dans l'audit à chaque recalcul)
  delete from public.additional_salaries a
   where a.period = p and a.kind <> 'ponctuel'
     and not exists (select 1 from pg_temp.adj_desired d
                      where d.employee_id = a.employee_id and d.component_code = a.component_code
                        and d.amount = a.amount and d.kind = a.kind and d.source_id is not distinct from a.source_id);

  insert into public.additional_salaries (employee_id, period, component_code, amount, kind, source_id, notes)
  select d.employee_id, p, d.component_code, d.amount, d.kind, d.source_id, 'Généré automatiquement'
    from pg_temp.adj_desired d
  on conflict (employee_id, period, component_code) do nothing;

  update public.loan_installments set status = 'Retenue', applied_period = p
   where due_period <= p and status = 'Prévue'
     and loan_id in (select id from public.loans where status = 'Actif');
  update public.payroll_corrections set status = 'Appliquée', applied_period = p
   where status = 'En attente' and source_period < p;
  update public.loans l set status = 'Soldé'
   where l.status = 'Actif' and not exists (select 1 from public.loan_installments i where i.loan_id = l.id and i.status = 'Prévue');
end;
$$;

-- ------------------------------------------------------------ crochet unique dans run_payroll_entry
create or replace function public.run_payroll_entry(p_payroll_entry_id uuid)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  pe       public.payroll_entries;
  emp      record;
  v_done   int := 0;
  v_synced int := 0;
  v_errors jsonb := '[]'::jsonb;
begin
  if not public.has_role(array['paie','rh']) then
    raise exception 'Droits insuffisants : rôle « paie » requis';
  end if;
  select * into pe from public.payroll_entries where id = p_payroll_entry_id for update;
  if pe.id is null then raise exception 'Traitement de paie introuvable'; end if;
  if pe.status in ('Validée','Annulée') then
    raise exception 'Le traitement est % : recalcul impossible', pe.status;
  end if;

  v_synced := public.sync_attendance_to_payroll_inputs(pe.period_start);
  perform public.apply_period_adjustments(pe.id);

  for emp in
    select e.id, e.employee_number, e.last_name
    from public.employees e
    where e.company_id = pe.company_id
      and e.status in ('Active','Left')
      and e.date_of_joining <= pe.period_end
      and (e.relieving_date is null or e.relieving_date >= pe.period_start)
    order by e.employee_number
  loop
    begin
      perform public.calculate_salary_slip(emp.id, pe.period_start, pe.period_end, pe.id);
      v_done := v_done + 1;
    exception when others then
      v_errors := v_errors || jsonb_build_object('employee_number', emp.employee_number,
                                                 'name', emp.last_name, 'error', sqlerrm);
    end;
  end loop;

  update public.payroll_entries set status = 'Calculée' where id = pe.id;
  return jsonb_build_object('calculated', v_done, 'errors', v_errors, 'attendance_synced', v_synced);
end;
$$;

revoke all on function public.create_loan(uuid, text, numeric, integer, date, uuid) from public, anon;
revoke all on function public.cancel_loan(uuid, text) from public, anon;
revoke all on function public.create_payroll_correction(uuid, date, text, numeric, text) from public, anon;
revoke all on function public.cancel_payroll_correction(uuid, text) from public, anon;
revoke all on function public.apply_period_adjustments(uuid) from public, anon;
grant execute on function public.create_loan(uuid, text, numeric, integer, date, uuid) to authenticated;
grant execute on function public.cancel_loan(uuid, text) to authenticated;
grant execute on function public.create_payroll_correction(uuid, date, text, numeric, text) to authenticated;
grant execute on function public.cancel_payroll_correction(uuid, text) to authenticated;
grant execute on function public.apply_period_adjustments(uuid) to authenticated;
grant select on public.loan_balances to authenticated;
