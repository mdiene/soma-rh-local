-- Phase 3 ESS/MSS : notifications internes liées aux demandes.

create table if not exists public.employee_notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  request_id  uuid references public.employee_requests(id) on delete cascade,
  title       text not null,
  message     text not null,
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);

create index if not exists employee_notifications_user_idx
  on public.employee_notifications(user_id, created_at desc);
create index if not exists employee_notifications_unread_idx
  on public.employee_notifications(user_id, read_at)
  where read_at is null;

alter table public.employee_notifications enable row level security;

drop policy if exists employee_notifications_select on public.employee_notifications;
create policy employee_notifications_select on public.employee_notifications
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists employee_notifications_update on public.employee_notifications;
create policy employee_notifications_update on public.employee_notifications
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create or replace function public.decide_employee_request(
  p_request_id uuid,
  p_status text,
  p_note text default null
)
returns public.employee_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.employee_requests;
  v_note text := nullif(trim(coalesce(p_note, '')), '');
  v_user_id uuid;
  v_label text;
begin
  if not public.has_role(array['rh']) then
    raise exception 'Réservé au service RH';
  end if;
  if p_status not in ('Approuvée', 'Rejetée') then
    raise exception 'Décision invalide';
  end if;
  if p_status = 'Rejetée' and v_note is null then
    raise exception 'Un motif est obligatoire pour un rejet';
  end if;

  update public.employee_requests
     set status = p_status,
         decision_note = v_note,
         decided_by = (select auth.uid()),
         decided_at = now()
   where id = p_request_id
     and status = 'Ouverte'
  returning * into v_request;

  if not found then
    raise exception 'Demande introuvable ou déjà traitée';
  end if;

  insert into public.employee_request_history(request_id, status, note, actor_id)
  values (v_request.id, v_request.status, v_note, (select auth.uid()));

  select e.user_id into v_user_id
  from public.employees e
  where e.id = v_request.employee_id;

  v_label := case when p_status = 'Approuvée' then 'approuvée' else 'rejetée' end;
  if v_user_id is not null then
    insert into public.employee_notifications(user_id, request_id, title, message)
    values (
      v_user_id,
      v_request.id,
      'Mise à jour de votre demande',
      'Votre demande a été ' || v_label || coalesce('. ' || v_note, '.')
    );
  end if;

  return v_request;
end;
$$;

revoke execute on function public.decide_employee_request(uuid, text, text) from public, anon;
grant execute on function public.decide_employee_request(uuid, text, text) to authenticated;
