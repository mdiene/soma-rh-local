-- SOMA-RH — Phase 1 : gouvernance du cycle de paie
-- Périodes, anomalies, approbations, snapshots, transitions et immutabilité.

create table if not exists public.payroll_periods (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references public.companies(id),
  period_start    date not null,
  period_end      date not null,
  status          text not null default 'Brouillon'
                  check (status in ('Brouillon','Calculée','En revue','Approuvée','Validée','Payée','Clôturée','Annulée','Réouverte')),
  locked_at       timestamptz,
  locked_by       uuid references auth.users(id) on delete set null,
  reopened_at     timestamptz,
  reopened_by     uuid references auth.users(id) on delete set null,
  reopen_reason   text,
  created_by      uuid references auth.users(id) on delete set null default auth.uid(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check (period_end >= period_start),
  unique (company_id, period_start)
);

create index if not exists payroll_periods_company_status_idx
  on public.payroll_periods(company_id, status);
create index if not exists payroll_periods_locked_by_idx
  on public.payroll_periods(locked_by);
create trigger payroll_periods_updated_at before update on public.payroll_periods
  for each row execute function public.set_updated_at();

alter table public.payroll_entries
  add column if not exists period_id uuid references public.payroll_periods(id),
  add column if not exists approved_by uuid references auth.users(id) on delete set null,
  add column if not exists approved_at timestamptz,
  add column if not exists paid_by uuid references auth.users(id) on delete set null,
  add column if not exists paid_at timestamptz,
  add column if not exists closed_by uuid references auth.users(id) on delete set null,
  add column if not exists closed_at timestamptz,
  add column if not exists reopened_by uuid references auth.users(id) on delete set null,
  add column if not exists reopened_at timestamptz,
  add column if not exists reopen_reason text;

alter table public.payroll_entries drop constraint if exists payroll_entries_status_check;
alter table public.payroll_entries add constraint payroll_entries_status_check
  check (status in ('Brouillon','Calculée','En revue','Approuvée','Validée','Payée','Clôturée','Réouverte','Annulée'));
create index if not exists payroll_entries_period_id_idx on public.payroll_entries(period_id);

insert into public.payroll_periods(company_id, period_start, period_end, status, created_by)
select pe.company_id, pe.period_start, pe.period_end,
       case pe.status
         when 'Validée' then 'Validée'
         when 'Annulée' then 'Annulée'
         when 'Calculée' then 'Calculée'
         else 'Brouillon'
       end,
       pe.created_by
from public.payroll_entries pe
on conflict (company_id, period_start) do nothing;

update public.payroll_entries pe
set period_id = pp.id
from public.payroll_periods pp
where pp.company_id = pe.company_id
  and pp.period_start = pe.period_start
  and pe.period_id is null;

create table if not exists public.payroll_anomalies (
  id                uuid primary key default gen_random_uuid(),
  payroll_entry_id  uuid not null references public.payroll_entries(id) on delete cascade,
  severity          text not null check (severity in ('bloquante','avertissement','information')),
  code              text not null,
  message           text not null,
  employee_id       uuid references public.employees(id) on delete set null,
  status            text not null default 'ouverte'
                    check (status in ('ouverte','justifiée','résolue','ignorée')),
  resolution_note   text,
  resolved_by       uuid references auth.users(id) on delete set null,
  resolved_at       timestamptz,
  created_at        timestamptz not null default now(),
  unique (payroll_entry_id, code, employee_id)
);
create index if not exists payroll_anomalies_entry_status_idx
  on public.payroll_anomalies(payroll_entry_id, status);
create index if not exists payroll_anomalies_employee_id_idx
  on public.payroll_anomalies(employee_id);

create table if not exists public.payroll_approvals (
  id                uuid primary key default gen_random_uuid(),
  payroll_entry_id  uuid not null references public.payroll_entries(id) on delete cascade,
  role              text not null check (role in ('paie','rh','admin')),
  decision          text not null check (decision in ('approuvée','rejetée')),
  comment           text,
  actor_id          uuid not null references auth.users(id) on delete restrict default auth.uid(),
  created_at        timestamptz not null default now()
);
create index if not exists payroll_approvals_entry_idx
  on public.payroll_approvals(payroll_entry_id, created_at desc);
create unique index if not exists payroll_approvals_entry_role_idx
  on public.payroll_approvals(payroll_entry_id, role)
  where decision = 'approuvée';

create table if not exists public.payroll_snapshots (
  id                uuid primary key default gen_random_uuid(),
  payroll_entry_id  uuid not null unique references public.payroll_entries(id) on delete restrict,
  payload           jsonb not null,
  payload_hash      text not null,
  created_by        uuid references auth.users(id) on delete set null default auth.uid(),
  created_at        timestamptz not null default now()
);
create index if not exists payroll_snapshots_created_by_idx
  on public.payroll_snapshots(created_by);

create table if not exists public.audit_events (
  id                uuid primary key default gen_random_uuid(),
  actor_id          uuid references auth.users(id) on delete set null,
  action            text not null,
  resource_type     text not null,
  resource_id       uuid,
  payroll_entry_id  uuid references public.payroll_entries(id) on delete set null,
  before_data       jsonb,
  after_data        jsonb,
  reason            text,
  result            text not null default 'success'
                    check (result in ('success','denied','error')),
  created_at        timestamptz not null default now()
);
create index if not exists audit_events_resource_idx
  on public.audit_events(resource_type, resource_id, created_at desc);
create index if not exists audit_events_payroll_entry_idx
  on public.audit_events(payroll_entry_id, created_at desc);

alter table public.payroll_periods enable row level security;
alter table public.payroll_anomalies enable row level security;
alter table public.payroll_approvals enable row level security;
alter table public.payroll_snapshots enable row level security;
alter table public.audit_events enable row level security;

drop policy if exists payroll_periods_read on public.payroll_periods;
create policy payroll_periods_read on public.payroll_periods for select to authenticated
  using ((select public.has_role(array['rh','paie'])));
drop policy if exists payroll_periods_write on public.payroll_periods;
create policy payroll_periods_write on public.payroll_periods for all to authenticated
  using ((select public.has_role(array['paie'])))
  with check ((select public.has_role(array['paie'])));

drop policy if exists payroll_anomalies_read on public.payroll_anomalies;
create policy payroll_anomalies_read on public.payroll_anomalies for select to authenticated
  using ((select public.has_role(array['rh','paie'])));
drop policy if exists payroll_anomalies_write on public.payroll_anomalies;
create policy payroll_anomalies_write on public.payroll_anomalies for all to authenticated
  using ((select public.has_role(array['paie'])))
  with check ((select public.has_role(array['paie'])));

drop policy if exists payroll_approvals_read on public.payroll_approvals;
create policy payroll_approvals_read on public.payroll_approvals for select to authenticated
  using ((select public.has_role(array['rh','paie'])));
drop policy if exists payroll_approvals_insert on public.payroll_approvals;
create policy payroll_approvals_insert on public.payroll_approvals for insert to authenticated
  with check ((select public.has_role(array['rh','paie'])));

drop policy if exists payroll_snapshots_read on public.payroll_snapshots;
create policy payroll_snapshots_read on public.payroll_snapshots for select to authenticated
  using ((select public.has_role(array['rh','paie'])));

drop policy if exists audit_events_read on public.audit_events;
create policy audit_events_read on public.audit_events for select to authenticated
  using ((select public.has_role(array['admin','rh','paie'])));
drop policy if exists audit_events_insert on public.audit_events;
create policy audit_events_insert on public.audit_events for insert to authenticated
  with check ((select public.has_role(array['admin','rh','paie'])));

create or replace function public.prevent_closed_payroll_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_status text;
begin
  if tg_table_name = 'payroll_entries' then
    v_status := old.status;
  else
    select status into v_status
    from public.payroll_entries
    where id = old.payroll_entry_id;
  end if;
  if v_status = 'Clôturée' then
    raise exception 'La paie clôturée est immuable';
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists payroll_entries_closed_guard on public.payroll_entries;
create trigger payroll_entries_closed_guard
before update or delete on public.payroll_entries
for each row execute function public.prevent_closed_payroll_mutation();
drop trigger if exists salary_slips_closed_guard on public.salary_slips;
create trigger salary_slips_closed_guard
before update or delete on public.salary_slips
for each row execute function public.prevent_closed_payroll_mutation();

create or replace function public.create_payroll_snapshot(p_payroll_entry_id uuid)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_payload jsonb;
  v_snapshot_id uuid;
begin
  if not public.has_role(array['paie']) then
    raise exception 'Droits insuffisants : rôle « paie » requis';
  end if;
  if exists (select 1 from public.payroll_entries where id = p_payroll_entry_id and status = 'Clôturée') then
    raise exception 'La paie est déjà clôturée';
  end if;
  select jsonb_build_object(
    'payroll_entry', to_jsonb(pe),
    'salary_slips', coalesce((select jsonb_agg(to_jsonb(ss) order by ss.employee_number)
                             from public.salary_slips ss where ss.payroll_entry_id = pe.id), '[]'::jsonb),
    'captured_at', now()
  ) into v_payload
  from public.payroll_entries pe
  where pe.id = p_payroll_entry_id;
  if v_payload is null then raise exception 'Traitement de paie introuvable'; end if;
  insert into public.payroll_snapshots(payroll_entry_id, payload, payload_hash)
  values (p_payroll_entry_id, v_payload, md5(v_payload::text))
  on conflict (payroll_entry_id) do update
    set payload = excluded.payload, payload_hash = excluded.payload_hash,
        created_by = auth.uid(), created_at = now()
  returning id into v_snapshot_id;
  return v_snapshot_id;
end;
$$;

create or replace function public.transition_payroll_entry(
  p_payroll_entry_id uuid,
  p_target_status text,
  p_reason text default null
)
returns text
language plpgsql
set search_path = ''
as $$
declare
  v_entry public.payroll_entries;
  v_allowed boolean := false;
  v_actor uuid := auth.uid();
begin
  select * into v_entry from public.payroll_entries
  where id = p_payroll_entry_id for update;
  if v_entry.id is null then raise exception 'Traitement de paie introuvable'; end if;
  if p_target_status not in ('En revue','Approuvée','Validée','Payée','Clôturée','Réouverte','Annulée') then
    raise exception 'Statut de transition invalide: %', p_target_status;
  end if;
  if p_target_status in ('Annulée','Réouverte') and not public.has_role(array['admin']) then
    raise exception 'Seul un administrateur peut annuler ou rouvrir une paie';
  end if;
  if p_target_status in ('Payée','Clôturée') and not public.has_role(array['paie']) then
    raise exception 'Droits insuffisants : rôle « paie » requis';
  end if;
  if p_target_status = 'En revue' and v_entry.status = 'Calculée' then v_allowed := true; end if;
  if p_target_status = 'Approuvée' and v_entry.status = 'En revue' then v_allowed := true; end if;
  if p_target_status = 'Validée' and v_entry.status in ('Calculée','Approuvée') then v_allowed := true; end if;
  if p_target_status = 'Payée' and v_entry.status = 'Validée' then v_allowed := true; end if;
  if p_target_status = 'Clôturée' and v_entry.status in ('Validée','Payée') then v_allowed := true; end if;
  if p_target_status = 'Réouverte' and v_entry.status in ('Validée','Payée') and nullif(trim(p_reason), '') is not null then v_allowed := true; end if;
  if p_target_status = 'Annulée' and v_entry.status <> 'Clôturée' then v_allowed := true; end if;
  if not v_allowed then raise exception 'Transition interdite: % -> %', v_entry.status, p_target_status; end if;

  if p_target_status = 'Clôturée' then
    perform public.create_payroll_snapshot(p_payroll_entry_id);
    update public.payroll_entries set closed_by = v_actor, closed_at = now() where id = p_payroll_entry_id;
  elsif p_target_status = 'Réouverte' then
    update public.payroll_entries set reopened_by = v_actor, reopened_at = now(), reopen_reason = p_reason where id = p_payroll_entry_id;
  elsif p_target_status = 'Approuvée' then
    update public.payroll_entries set approved_by = v_actor, approved_at = now() where id = p_payroll_entry_id;
  elsif p_target_status = 'Payée' then
    update public.payroll_entries set paid_by = v_actor, paid_at = now() where id = p_payroll_entry_id;
  end if;
  update public.payroll_entries set status = p_target_status where id = p_payroll_entry_id;
  insert into public.audit_events(actor_id, action, resource_type, resource_id, payroll_entry_id, before_data, after_data, reason)
  values (v_actor, 'transition', 'payroll_entry', p_payroll_entry_id, p_payroll_entry_id,
          jsonb_build_object('status', v_entry.status),
          jsonb_build_object('status', p_target_status), p_reason);
  return p_target_status;
end;
$$;

create or replace function public.delete_payroll_entry(p_payroll_entry_id uuid)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_status text;
  v_slips integer;
begin
  select status into v_status from public.payroll_entries where id = p_payroll_entry_id for update;
  if v_status is null then raise exception 'Traitement de paie introuvable'; end if;
  if not public.has_role(array['paie']) then raise exception 'Droits insuffisants : rôle « paie » requis'; end if;
  if v_status not in ('Brouillon','Calculée','Réouverte','Annulée') then
    raise exception 'Une paie en revue, approuvée, validée, payée ou clôturée ne peut pas être supprimée';
  end if;
  select count(*) into v_slips from public.salary_slips where payroll_entry_id = p_payroll_entry_id;
  insert into public.audit_events(actor_id, action, resource_type, resource_id, payroll_entry_id, before_data)
  values (auth.uid(), 'delete', 'payroll_entry', p_payroll_entry_id, p_payroll_entry_id,
          jsonb_build_object('status', v_status, 'slips', v_slips));
  delete from public.payroll_entries where id = p_payroll_entry_id;
  return v_slips;
end;
$$;

revoke execute on function public.create_payroll_snapshot(uuid) from public, anon;
revoke execute on function public.transition_payroll_entry(uuid, text, text) from public, anon;
grant execute on function public.create_payroll_snapshot(uuid) to authenticated;
grant execute on function public.transition_payroll_entry(uuid, text, text) to authenticated;
