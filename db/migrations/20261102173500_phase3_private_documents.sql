-- Phase 3 ESS/MSS : registre documentaire privé et journal des consultations.

create table if not exists public.employee_documents (
  id              uuid primary key default gen_random_uuid(),
  employee_id     uuid not null references public.employees(id) on delete cascade,
  document_type   text not null check (document_type in (
    'attestation_travail', 'attestation_salaire', 'bulletin', 'justificatif', 'autre'
  )),
  title           text not null,
  file_name       text not null,
  storage_path    text not null unique,
  mime_type       text not null,
  size_bytes      bigint not null check (size_bytes >= 0),
  checksum        text,
  created_by      uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at      timestamptz not null default now()
);

create index if not exists employee_documents_employee_idx
  on public.employee_documents(employee_id, created_at desc);

create table if not exists public.employee_document_access_log (
  id          uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.employee_documents(id) on delete cascade,
  user_id     uuid not null default auth.uid() references auth.users(id) on delete restrict,
  accessed_at timestamptz not null default now()
);

create index if not exists employee_document_access_log_document_idx
  on public.employee_document_access_log(document_id, accessed_at desc);

alter table public.employee_documents enable row level security;
alter table public.employee_document_access_log enable row level security;

drop policy if exists employee_documents_select on public.employee_documents;
create policy employee_documents_select on public.employee_documents
  for select to authenticated
  using (
    (select public.has_role(array['rh']))
    or employee_id = (select public.my_employee_id())
  );

drop policy if exists employee_documents_insert on public.employee_documents;
create policy employee_documents_insert on public.employee_documents
  for insert to authenticated
  with check ((select public.has_role(array['rh'])));

drop policy if exists employee_document_access_log_select on public.employee_document_access_log;
create policy employee_document_access_log_select on public.employee_document_access_log
  for select to authenticated
  using (
    (select public.has_role(array['rh']))
    or user_id = (select auth.uid())
  );

create or replace function public.log_employee_document_access(p_document_id uuid)
returns public.employee_document_access_log
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_log public.employee_document_access_log;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentification requise';
  end if;
  if not exists (
    select 1
    from public.employee_documents d
    where d.id = p_document_id
      and (
        (select public.has_role(array['rh']))
        or d.employee_id = (select public.my_employee_id())
      )
  ) then
    raise exception 'Document introuvable ou non autorisé';
  end if;

  insert into public.employee_document_access_log(document_id, user_id)
  values (p_document_id, (select auth.uid()))
  returning * into v_log;
  return v_log;
end;
$$;

revoke execute on function public.log_employee_document_access(uuid) from public, anon;
grant execute on function public.log_employee_document_access(uuid) to authenticated;

notify pgrst, 'reload schema';
