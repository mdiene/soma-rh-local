-- Autorise explicitement les rôles administrateur et RH à valider les documents.

create or replace function public.review_employee_document(
  p_document_id uuid,
  p_status text,
  p_reason text default null
)
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
  if p_status not in ('valide', 'refuse') then
    raise exception 'Statut de validation invalide';
  end if;
  if p_status = 'refuse' and nullif(trim(p_reason), '') is null then
    raise exception 'Le motif de refus est obligatoire';
  end if;

  update public.employee_documents
  set status = p_status,
      rejection_reason = case when p_status = 'refuse' then trim(p_reason) else null end,
      validated_by = (select auth.uid()),
      validated_at = now()
  where id = p_document_id
  returning * into v_document;

  if not found then
    raise exception 'Document introuvable';
  end if;

  insert into public.document_reviews(document_id, status, reason, reviewed_by)
  values (p_document_id, p_status, case when p_status = 'refuse' then trim(p_reason) else null end, (select auth.uid()));
  return v_document;
end;
$$;

revoke execute on function public.review_employee_document(uuid, text, text) from public, anon;
grant execute on function public.review_employee_document(uuid, text, text) to authenticated;

notify pgrst, 'reload schema';
