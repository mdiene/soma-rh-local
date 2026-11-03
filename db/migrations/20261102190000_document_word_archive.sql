-- Formats Word et archivage des documents refusés.

alter table public.employee_documents
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references auth.users(id);

update public.document_requirements
set allowed_mime_types = array[
  'application/pdf',
  'image/jpeg',
  'image/png',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
]
where active;

create or replace function public.archive_employee_document(p_document_id uuid)
returns public.employee_documents
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_document public.employee_documents;
begin
  if not (select public.has_role(array['admin', 'rh'])) then
    raise exception 'Droits administrateur ou RH requis';
  end if;

  update public.employee_documents
  set archived_at = now(), archived_by = (select auth.uid())
  where id = p_document_id and status = 'refuse' and archived_at is null
  returning * into v_document;

  if not found then
    raise exception 'Seul un document refusé non archivé peut être archivé';
  end if;
  return v_document;
end;
$$;

revoke execute on function public.archive_employee_document(uuid) from public, anon;
grant execute on function public.archive_employee_document(uuid) to authenticated;

notify pgrst, 'reload schema';
