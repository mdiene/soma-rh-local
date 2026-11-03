-- Phase 3 ESS/MSS : décisions RH traçables et historique des demandes.

create table if not exists public.employee_request_history (
  id          uuid primary key default gen_random_uuid(),
  request_id  uuid not null references public.employee_requests(id) on delete cascade,
  status      text not null check (status in ('Ouverte', 'Approuvée', 'Rejetée', 'Annulée')),
  note        text,
  actor_id    uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at  timestamptz not null default now()
);

create index if not exists employee_request_history_request_idx
  on public.employee_request_history(request_id, created_at desc);
create index if not exists employee_request_history_actor_idx
  on public.employee_request_history(actor_id);

alter table public.employee_request_history enable row level security;

drop policy if exists employee_requests_access on public.employee_requests;
drop policy if exists employee_requests_upd on public.employee_requests;

drop policy if exists employee_request_history_read on public.employee_request_history;
create policy employee_request_history_read on public.employee_request_history
  for select to authenticated
  using (
    (select public.has_role(array['rh']))
    or exists (
      select 1
      from public.employee_requests er
      where er.id = request_id
        and er.employee_id = (select public.my_employee_id())
    )
  );

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

  return v_request;
end;
$$;

revoke execute on function public.decide_employee_request(uuid, text, text) from public, anon;
grant execute on function public.decide_employee_request(uuid, text, text) to authenticated;

create or replace function public.cancel_my_request(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request_id uuid;
begin
  update public.employee_requests
     set status = 'Annulée'
   where id = p_request_id
     and employee_id = (select public.my_employee_id())
     and status = 'Ouverte'
  returning id into v_request_id;

  if not found then
    raise exception 'Demande introuvable ou déjà traitée';
  end if;

  insert into public.employee_request_history(request_id, status, actor_id)
  values (v_request_id, 'Annulée', (select auth.uid()));
end;
$$;

revoke execute on function public.cancel_my_request(uuid) from public, anon;
grant execute on function public.cancel_my_request(uuid) to authenticated;
