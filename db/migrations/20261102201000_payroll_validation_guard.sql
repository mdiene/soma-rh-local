-- Empêche toute approbation/validation d'une paie qui contient un contrôle bloquant.
-- La règle est portée par PostgreSQL afin de rester effective hors de l'interface web.
create or replace function public.guard_payroll_validation()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_blocking integer;
begin
  if new.status in ('Approuvée', 'Validée')
     and old.status is distinct from new.status
     and public.has_role(array['rh', 'paie']) then
    select count(*) into v_blocking
    from jsonb_array_elements(public.payroll_entry_checks(new.id)) as item
    where item ->> 'niveau' = 'erreur';

    if v_blocking > 0 then
      raise exception 'Validation impossible : % contrôle(s) bloquant(s) doit/doivent être résolu(s)', v_blocking;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists payroll_validation_guard on public.payroll_entries;
create trigger payroll_validation_guard
before update of status on public.payroll_entries
for each row execute function public.guard_payroll_validation();

revoke execute on function public.guard_payroll_validation() from public, anon, authenticated;
