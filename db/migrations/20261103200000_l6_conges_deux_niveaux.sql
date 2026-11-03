-- =============================================================================
-- L6 — Congé à deux niveaux (manager puis RH), délégation, délai/escalade, décision idempotente
--  L6-01 : leave_approval_steps, approval_delegations, decide_leave, delegate_approvals, escalate_overdue_leave_steps
--  L6-02 : notifications dans l'application + file d'e-mails (email_outbox) avec clé anti-doublon.
--          L'envoi réel (Gmail, décision D5) n'est pas branché : un travailleur lira la file plus tard.
-- Règles : nul ne décide de sa propre demande ; une même personne ne décide pas deux niveaux ;
--          un rejet exige un motif ; rejouer la même décision ne change rien (idempotence).
-- Une décision directe sur leave_applications est refusée : on passe par decide_leave.
-- =============================================================================

-- ------------------------------------------------------------ tables
create table if not exists public.leave_approval_steps (
  id          uuid primary key default gen_random_uuid(),
  leave_id    uuid not null references public.leave_applications(id) on delete cascade,
  step        smallint not null check (step in (1, 2)),
  level       text not null check (level in ('manager', 'rh')),
  status      text not null default 'En attente' check (status in ('En attente', 'Approuvée', 'Rejetée', 'Ignorée')),
  due_at      timestamptz,
  decided_by  uuid references auth.users(id) on delete set null,
  decided_at  timestamptz,
  note        text,
  via_delegation boolean not null default false,
  unique (leave_id, step)
);
create index if not exists leave_approval_steps_pending_idx on public.leave_approval_steps(status, due_at) where status = 'En attente';
create index if not exists leave_approval_steps_decided_by_idx on public.leave_approval_steps(decided_by);

create table if not exists public.approval_delegations (
  id             uuid primary key default gen_random_uuid(),
  delegator_user uuid not null references auth.users(id) on delete cascade,
  delegate_user  uuid not null references auth.users(id) on delete cascade,
  valid_from     date not null,
  valid_to       date not null,
  reason         text,
  active         boolean not null default true,
  created_at     timestamptz not null default now(),
  check (valid_to >= valid_from),
  check (delegator_user <> delegate_user)
);
create index if not exists approval_delegations_delegate_idx on public.approval_delegations(delegate_user) where active;
create index if not exists approval_delegations_delegator_idx on public.approval_delegations(delegator_user);

create table if not exists public.email_outbox (
  id         uuid primary key default gen_random_uuid(),
  to_email   text not null,
  subject    text not null,
  body       text not null,
  dedup_key  text not null unique,
  status     text not null default 'En attente' check (status in ('En attente', 'Envoyé', 'Erreur')),
  attempts   integer not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  sent_at    timestamptz
);
create index if not exists email_outbox_status_idx on public.email_outbox(status, created_at) where status <> 'Envoyé';

-- ------------------------------------------------------------ qui gère un salarié (direct ou par délégation)
create or replace function public.user_manages_employee(p_user uuid, p_employee uuid, p_on date)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.employee_manager_assignments a join public.employees m on m.id = a.manager_employee_id
     where m.user_id = p_user and a.employee_id = p_employee
       and p_on >= a.valid_from and (a.valid_to is null or p_on <= a.valid_to))
  or exists (
    select 1 from public.approval_delegations d
      join public.employees m on m.user_id = d.delegator_user
      join public.employee_manager_assignments a on a.manager_employee_id = m.id
     where d.delegate_user = p_user and d.active and current_date between d.valid_from and d.valid_to
       and a.employee_id = p_employee and p_on >= a.valid_from and (a.valid_to is null or p_on <= a.valid_to))
$$;

create or replace function public.can_see_leave(p_employee uuid, p_on date)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.user_manages_employee((select auth.uid()), p_employee, p_on)
$$;

-- ------------------------------------------------------------ RLS
alter table public.leave_approval_steps enable row level security;
alter table public.approval_delegations enable row level security;
alter table public.email_outbox enable row level security;

drop policy if exists leave_app_select_team on public.leave_applications;
create policy leave_app_select_team on public.leave_applications for select to authenticated
  using ((select public.can_see_leave(employee_id, from_date)));

drop policy if exists leave_steps_read on public.leave_approval_steps;
create policy leave_steps_read on public.leave_approval_steps for select to authenticated
  using (exists (select 1 from public.leave_applications l where l.id = leave_id));  -- hérite de la visibilité du congé

drop policy if exists approval_delegations_read on public.approval_delegations;
create policy approval_delegations_read on public.approval_delegations for select to authenticated
  using (delegator_user = (select auth.uid()) or delegate_user = (select auth.uid()) or (select public.has_role(array['rh'])));

drop policy if exists email_outbox_read on public.email_outbox;
create policy email_outbox_read on public.email_outbox for select to authenticated
  using ((select public.has_role(array['rh'])));

revoke insert, update, delete on public.leave_approval_steps, public.approval_delegations, public.email_outbox from anon, authenticated;

drop trigger if exists approval_delegations_audit on public.approval_delegations;
create trigger approval_delegations_audit after insert or update or delete on public.approval_delegations
  for each row execute function public.business_audit();

-- ------------------------------------------------------------ notification interne + file d'e-mails
create or replace function public.notify_user(p_user uuid, p_title text, p_message text, p_key text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_email text;
begin
  if p_user is null then return; end if;
  insert into public.employee_notifications(user_id, title, message) values (p_user, p_title, p_message);
  select email into v_email from auth.users where id = p_user;
  if v_email is not null then
    insert into public.email_outbox(to_email, subject, body, dedup_key)
    values (v_email, p_title, p_message, p_key || ':' || p_user::text)
    on conflict (dedup_key) do nothing;
  end if;
end;
$$;

create or replace function public.notify_leave_approvers(p_leave public.leave_applications, p_level text, p_text text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare r record;
begin
  if p_level = 'rh' then
    for r in select distinct user_id from public.user_roles where role = 'rh' loop
      perform public.notify_user(r.user_id, 'Congé à valider (RH)', p_text, 'leave:' || p_leave.id || ':rh');
    end loop;
  else
    for r in
      select m.user_id from public.employee_manager_assignments a join public.employees m on m.id = a.manager_employee_id
       where a.employee_id = p_leave.employee_id and p_leave.from_date >= a.valid_from and (a.valid_to is null or p_leave.from_date <= a.valid_to)
      union
      select d.delegate_user from public.approval_delegations d
        join public.employees m on m.user_id = d.delegator_user
        join public.employee_manager_assignments a on a.manager_employee_id = m.id
       where d.active and current_date between d.valid_from and d.valid_to and a.employee_id = p_leave.employee_id
    loop
      perform public.notify_user(r.user_id, 'Congé à valider (manager)', p_text, 'leave:' || p_leave.id || ':manager');
    end loop;
  end if;
end;
$$;

-- ------------------------------------------------------------ création des étapes
create or replace function public.leave_steps_init()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_has_manager boolean;
begin
  if new.status <> 'Ouverte' then return new; end if;
  select exists (select 1 from public.employee_manager_assignments a
                  where a.employee_id = new.employee_id and new.from_date >= a.valid_from and (a.valid_to is null or new.from_date <= a.valid_to))
    into v_has_manager;
  insert into public.leave_approval_steps(leave_id, step, level, status, due_at)
  values (new.id, 1, 'manager', case when v_has_manager then 'En attente' else 'Ignorée' end,
          case when v_has_manager then now() + interval '3 days' end);
  insert into public.leave_approval_steps(leave_id, step, level, status) values (new.id, 2, 'rh', 'En attente');
  perform public.notify_leave_approvers(new, case when v_has_manager then 'manager' else 'rh' end,
          'Une demande de congé du ' || to_char(new.from_date, 'DD/MM/YYYY') || ' au ' || to_char(new.to_date, 'DD/MM/YYYY') || ' attend votre décision.');
  return new;
end;
$$;
drop trigger if exists leave_steps_init_ai on public.leave_applications;
create trigger leave_steps_init_ai after insert on public.leave_applications
  for each row execute function public.leave_steps_init();

-- demandes déjà ouvertes : étapes sans notification
insert into public.leave_approval_steps(leave_id, step, level, status, due_at)
select l.id, 1, 'manager',
       case when exists (select 1 from public.employee_manager_assignments a where a.employee_id = l.employee_id and l.from_date >= a.valid_from and (a.valid_to is null or l.from_date <= a.valid_to)) then 'En attente' else 'Ignorée' end,
       case when exists (select 1 from public.employee_manager_assignments a where a.employee_id = l.employee_id and l.from_date >= a.valid_from and (a.valid_to is null or l.from_date <= a.valid_to)) then now() + interval '3 days' end
  from public.leave_applications l where l.status = 'Ouverte'
on conflict (leave_id, step) do nothing;
insert into public.leave_approval_steps(leave_id, step, level, status)
select l.id, 2, 'rh', 'En attente' from public.leave_applications l where l.status = 'Ouverte'
on conflict (leave_id, step) do nothing;

-- ------------------------------------------------------------ garde : plus de décision directe
create or replace function public.leave_decision_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status = 'Ouverte' and new.status in ('Approuvée', 'Rejetée')
     and coalesce(current_setting('soma.leave_decision', true), '') <> 'on' then
    raise exception 'Un congé se décide par le circuit de validation (manager puis RH) : utilisez « Approuver » ou « Rejeter » depuis la demande';
  end if;
  return new;
end;
$$;
drop trigger if exists leave_decision_guard_bu on public.leave_applications;
create trigger leave_decision_guard_bu before update of status on public.leave_applications
  for each row execute function public.leave_decision_guard();

-- ------------------------------------------------------------ décision
create or replace function public.decide_leave(p_leave_id uuid, p_decision text, p_note text default null, p_step smallint default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  l public.leave_applications; s public.leave_approval_steps;
  v_actor uuid := auth.uid(); v_me uuid := (select public.my_employee_id());
  v_note text := nullif(trim(coalesce(p_note, '')), ''); v_direct boolean; v_user uuid; v_final text;
begin
  if v_actor is null then raise exception 'Connexion requise'; end if;
  if p_decision not in ('Approuvée', 'Rejetée') then raise exception 'Décision invalide : « % »', p_decision; end if;
  select * into l from public.leave_applications where id = p_leave_id for update;
  if not found then raise exception 'Demande de congé introuvable'; end if;
  if v_me is not null and v_me = l.employee_id then
    raise exception 'Vous ne pouvez pas décider de votre propre demande de congé';
  end if;

  if l.status <> 'Ouverte' then   -- rejouer la même décision ne change rien
    if l.status = p_decision then return jsonb_build_object('status', l.status, 'idempotent', true); end if;
    raise exception 'Cette demande est déjà « % » : la décision ne peut plus être modifiée ici', l.status;
  end if;

  select * into s from public.leave_approval_steps where leave_id = l.id and status = 'En attente' order by step limit 1;
  if not found then raise exception 'Aucune étape de validation en attente pour cette demande'; end if;
  if p_step is not null and p_step <> s.step then
    if exists (select 1 from public.leave_approval_steps where leave_id = l.id and step = p_step and decided_by = v_actor and status = p_decision) then
      return jsonb_build_object('status', l.status, 'step', p_step, 'idempotent', true);
    end if;
    raise exception 'L''étape % a déjà été traitée : rechargez la page', p_step;
  end if;

  if not (public.has_role(array['admin'])
          or (s.level = 'rh' and public.has_role(array['rh']))
          or (s.level = 'manager' and public.user_manages_employee(v_actor, l.employee_id, l.from_date))) then
    raise exception '%', case s.level when 'manager' then 'Cette étape revient au manager du salarié (ou à son délégué)' else 'Cette étape revient au service RH' end;
  end if;
  if exists (select 1 from public.leave_approval_steps where leave_id = l.id and decided_by = v_actor) then
    raise exception 'Séparation des tâches : la même personne ne peut pas décider deux niveaux d''une même demande';
  end if;
  if p_decision = 'Rejetée' and v_note is null then raise exception 'Un motif est obligatoire pour rejeter une demande'; end if;

  select exists (select 1 from public.employee_manager_assignments a join public.employees m on m.id = a.manager_employee_id
                  where m.user_id = v_actor and a.employee_id = l.employee_id) into v_direct;

  update public.leave_approval_steps
     set status = p_decision, decided_by = v_actor, decided_at = now(), note = v_note,
         via_delegation = (s.level = 'manager' and not v_direct and not public.has_role(array['admin']))
   where id = s.id;

  select user_id into v_user from public.employees where id = l.employee_id;
  if p_decision = 'Rejetée' then
    update public.leave_approval_steps set status = 'Ignorée' where leave_id = l.id and status = 'En attente';
    v_final := 'Rejetée';
  elsif not exists (select 1 from public.leave_approval_steps where leave_id = l.id and status = 'En attente') then
    v_final := 'Approuvée';
  end if;

  if v_final is not null then
    perform set_config('soma.leave_decision', 'on', true);
    update public.leave_applications set status = v_final, approver_id = v_actor, approved_at = now() where id = l.id;
    perform public.notify_user(v_user, 'Votre demande de congé est ' || lower(v_final),
            'Votre demande du ' || to_char(l.from_date, 'DD/MM/YYYY') || ' au ' || to_char(l.to_date, 'DD/MM/YYYY') || ' est ' || lower(v_final) || coalesce('. ' || v_note, '.'),
            'leave:' || l.id || ':final');
  elsif s.level = 'manager' then   -- accord du manager : la RH prend le relais
    perform public.notify_leave_approvers(l, 'rh', 'Une demande de congé validée par le manager attend votre décision.');
  end if;

  return jsonb_build_object('status', coalesce(v_final, 'Ouverte'), 'step', s.step, 'idempotent', false);
end;
$$;

-- ------------------------------------------------------------ délégation
create or replace function public.delegate_approvals(p_delegate_user uuid, p_from date, p_to date, p_reason text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_id uuid;
begin
  if not (public.has_role(array['manager']) or public.has_role(array['rh'])) then
    raise exception 'Seul un manager (ou la RH) peut déléguer ses validations';
  end if;
  if p_delegate_user is null or p_delegate_user = (select auth.uid()) then raise exception 'Choisissez une autre personne comme délégué'; end if;
  if p_to < p_from then raise exception 'La date de fin doit être postérieure à la date de début'; end if;
  if not exists (select 1 from auth.users where id = p_delegate_user) then raise exception 'Délégué introuvable'; end if;
  insert into public.approval_delegations(delegator_user, delegate_user, valid_from, valid_to, reason)
  values ((select auth.uid()), p_delegate_user, p_from, p_to, nullif(trim(coalesce(p_reason, '')), ''))
  returning id into v_id;
  perform public.notify_user(p_delegate_user, 'Délégation de validation',
          'Vous pouvez valider les congés d''une équipe du ' || to_char(p_from, 'DD/MM/YYYY') || ' au ' || to_char(p_to, 'DD/MM/YYYY') || '.',
          'deleg:' || v_id);
  return v_id;
end;
$$;

create or replace function public.revoke_delegation(p_delegation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.approval_delegations set active = false
   where id = p_delegation_id and active and (delegator_user = (select auth.uid()) or public.has_role(array['rh']));
  if not found then raise exception 'Délégation introuvable, déjà retirée ou non autorisée'; end if;
end;
$$;

-- ------------------------------------------------------------ délai dépassé : la RH reprend la main
create or replace function public.escalate_overdue_leave_steps()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare r record; n integer := 0;
begin
  if not public.has_role(array['rh']) then raise exception 'Réservé au service RH'; end if;
  for r in select s.id, s.leave_id from public.leave_approval_steps s
            where s.level = 'manager' and s.status = 'En attente' and s.due_at < now() for update skip locked loop
    update public.leave_approval_steps set status = 'Ignorée', decided_at = now(), note = 'Délai dépassé : escalade vers la RH' where id = r.id;
    perform public.notify_leave_approvers((select l from public.leave_applications l where l.id = r.leave_id), 'rh',
            'Une demande de congé n''a pas été traitée par le manager dans le délai : elle attend votre décision.');
    n := n + 1;
  end loop;
  return n;
end;
$$;

revoke all on function public.user_manages_employee(uuid, uuid, date) from public, anon, authenticated;
revoke all on function public.notify_user(uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.notify_leave_approvers(public.leave_applications, text, text) from public, anon, authenticated;
revoke all on function public.decide_leave(uuid, text, text, smallint) from public, anon;
revoke all on function public.delegate_approvals(uuid, date, date, text) from public, anon;
revoke all on function public.revoke_delegation(uuid) from public, anon;
revoke all on function public.escalate_overdue_leave_steps() from public, anon;
grant execute on function public.decide_leave(uuid, text, text, smallint) to authenticated;
grant execute on function public.delegate_approvals(uuid, date, date, text) to authenticated;
grant execute on function public.revoke_delegation(uuid) to authenticated;
grant execute on function public.escalate_overdue_leave_steps() to authenticated;
grant execute on function public.can_see_leave(uuid, date) to authenticated;
