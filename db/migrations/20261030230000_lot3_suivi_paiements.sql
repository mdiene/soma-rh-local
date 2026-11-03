-- =============================================================================
-- Lot 3 (version réduite, décisions D3/D8) : suivi du paiement des salaires.
-- Paiement par chèque, espèces ou mobile money (Wave / Orange Money) fait par
-- le comptable ; l'application garde l'état payé / à payer, la date et la
-- référence par bulletin. Aucun format bancaire, aucune transmission externe.
-- =============================================================================
create table if not exists public.salary_payments (
  slip_id      uuid primary key references public.salary_slips(id) on delete cascade,
  payment_mode text not null,
  status       text not null default 'À payer' check (status in ('À payer', 'Payé')),
  paid_at      date,
  reference    text,
  note         text,
  paid_by      uuid references auth.users(id) on delete set null default auth.uid(),
  updated_at   timestamptz not null default now(),
  check (status = 'À payer' or paid_at is not null)
);
create index if not exists salary_payments_status_idx on public.salary_payments (status);
create index if not exists salary_payments_paid_by_idx on public.salary_payments (paid_by);

alter table public.salary_payments enable row level security;
create policy salary_payments_read on public.salary_payments for select to authenticated
  using ((select public.has_role(array['rh', 'paie'])));
create policy salary_payments_ins on public.salary_payments for insert to authenticated
  with check ((select public.has_role(array['paie'])));
create policy salary_payments_upd on public.salary_payments for update to authenticated
  using ((select public.has_role(array['paie']))) with check ((select public.has_role(array['paie'])));
create policy salary_payments_del on public.salary_payments for delete to authenticated
  using ((select public.has_role(array['admin'])));

create or replace function public.salary_payments_touch()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  new.paid_by := coalesce((select auth.uid()), new.paid_by);
  return new;
end;
$$;
create trigger salary_payments_touch before insert or update on public.salary_payments
  for each row execute function public.salary_payments_touch();

create or replace function public.salary_payments_audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.audit_log (table_name, record_id, record_key, action, old_data, new_data)
  values ('salary_payments', null, coalesce(new.slip_id, old.slip_id)::text,
          case tg_op when 'INSERT' then 'création' when 'UPDATE' then 'modification' else 'suppression' end,
          case when tg_op <> 'INSERT' then to_jsonb(old) - 'updated_at' end,
          case when tg_op <> 'DELETE' then to_jsonb(new) - 'updated_at' end);
  return null;
end;
$$;
revoke execute on function public.salary_payments_audit() from public, anon, authenticated;
create trigger salary_payments_audit after insert or update or delete on public.salary_payments
  for each row execute function public.salary_payments_audit();
