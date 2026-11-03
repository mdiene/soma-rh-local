-- Pièces familiales multiples : une ligne par conjoint/enfant déclaré.

alter table public.employee_documents
  add column if not exists document_slot smallint not null default 1;

alter table public.employee_documents
  drop constraint if exists employee_documents_document_slot_check;
alter table public.employee_documents
  add constraint employee_documents_document_slot_check check (document_slot > 0);

create unique index if not exists employee_documents_family_slot_uidx
  on public.employee_documents(employee_id, requirement_code, document_slot)
  where archived_at is null;

create or replace function public.validate_employee_document_family_slot()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_spouses smallint;
  v_children smallint;
begin
  select spouses_count, children_count into v_spouses, v_children
  from public.employees where id = new.employee_id;
  if new.requirement_code = 'situation_matrimoniale' and new.document_slot > greatest(v_spouses, 1) then
    raise exception 'Le numéro de l''acte de mariage dépasse le nombre de conjoints déclaré';
  end if;
  if new.requirement_code = 'actes_enfants' and new.document_slot > v_children then
    raise exception 'Le numéro de l''acte de naissance dépasse le nombre d''enfants déclaré';
  end if;
  return new;
end;
$$;

drop trigger if exists employee_documents_family_slot_guard on public.employee_documents;
create trigger employee_documents_family_slot_guard
before insert or update of employee_id, requirement_code, document_slot
on public.employee_documents
for each row execute function public.validate_employee_document_family_slot();

notify pgrst, 'reload schema';
