-- =============================================================================
-- Lot 2 (début) : portail salarié — demandes (attestations, acompte, correction
-- de présence, données personnelles). Le salarié crée et annule ses demandes ;
-- le RH les traite. Les congés gardent leur circuit existant.
-- =============================================================================
create table if not exists public.employee_requests (
  id            uuid primary key default gen_random_uuid(),
  employee_id   uuid not null references public.employees(id) on delete cascade,
  request_type  text not null check (request_type in
                  ('attestation_travail', 'attestation_salaire', 'acompte', 'correction_presence', 'donnees_personnelles', 'autre')),
  amount        numeric check (amount > 0),
  target_date   date,
  message       text,
  status        text not null default 'Ouverte' check (status in ('Ouverte', 'Approuvée', 'Rejetée', 'Annulée')),
  decision_note text,
  decided_by    uuid references auth.users(id) on delete set null,
  decided_at    timestamptz,
  created_at    timestamptz not null default now(),
  check (request_type <> 'acompte' or amount is not null)
);
create index if not exists employee_requests_employee_idx on public.employee_requests (employee_id, created_at desc);
create index if not exists employee_requests_status_idx on public.employee_requests (status);
create index if not exists employee_requests_decided_by_idx on public.employee_requests (decided_by);

alter table public.employee_requests enable row level security;

create policy employee_requests_read on public.employee_requests for select to authenticated
  using ((select public.has_role(array['rh'])) or employee_id = (select public.my_employee_id()));
create policy employee_requests_ins on public.employee_requests for insert to authenticated
  with check (employee_id = (select public.my_employee_id()) and status = 'Ouverte' and decided_by is null);
create policy employee_requests_upd on public.employee_requests for update to authenticated
  using ((select public.has_role(array['rh']))) with check ((select public.has_role(array['rh'])));

-- Le salarié annule sa propre demande tant qu'elle est ouverte.
create or replace function public.cancel_my_request(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.employee_requests set status = 'Annulée'
   where id = p_request_id and employee_id = (select public.my_employee_id()) and status = 'Ouverte';
  if not found then
    raise exception 'Demande introuvable ou déjà traitée';
  end if;
end;
$$;
revoke execute on function public.cancel_my_request(uuid) from public, anon;
grant execute on function public.cancel_my_request(uuid) to authenticated;

create trigger employee_requests_audit after insert or update or delete on public.employee_requests
  for each row execute function public.business_audit();
