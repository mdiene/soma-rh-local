-- =============================================================================
-- SOMA-RH — Lot 6 : matricule salarié automatique et inviolable
-- * format métier conservé : « S » + 4 chiffres minimum (S0001…S0026 existants)
-- * séquence en base : aucune collision en cas de créations simultanées,
--   numéro jamais réutilisé (un numéro consommé par une création annulée est perdu)
-- * déclencheur avant insertion : attribue le matricule (seul un administrateur
--   peut imposer une valeur, pour une reprise de données)
-- * déclencheur avant mise à jour : refuse tout changement de matricule, sauf via
--   admin_change_employee_number (administrateur, motif obligatoire, journalisé)
-- * preview_employee_number : prochain matricule probable, pour l'affichage
-- * audit_log : journal des changements importants (réutilisé par le lot 7)
-- =============================================================================

-- --------------------------------------------------------------- journal d'audit
create table if not exists public.audit_log (
  id          bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  actor       uuid references auth.users(id) on delete set null default auth.uid(),
  table_name  text not null,
  record_id   uuid,
  action      text not null,
  old_data    jsonb,
  new_data    jsonb,
  reason      text
);
comment on table public.audit_log is 'Journal des modifications importantes (matricules, référentiels). Alimenté uniquement par des fonctions et déclencheurs.';
create index if not exists audit_log_actor_idx on public.audit_log(actor);
create index if not exists audit_log_record_idx on public.audit_log(table_name, record_id);
create index if not exists audit_log_occurred_idx on public.audit_log(occurred_at desc);

alter table public.audit_log enable row level security;
drop policy if exists audit_log_select on public.audit_log;
create policy audit_log_select on public.audit_log
  for select to authenticated using ((select public.has_role(array['admin','rh'])));
-- aucune politique d'écriture : seules les fonctions SECURITY DEFINER écrivent dans le journal
revoke insert, update, delete on public.audit_log from anon, authenticated;

-- ---------------------------------------------------------------- séquence
create sequence if not exists public.employee_number_seq as integer minvalue 1;
select setval('public.employee_number_seq',
              greatest(coalesce((select max(substring(employee_number from '^S([0-9]{4,})$')::int) from public.employees), 0), 1),
              coalesce((select max(substring(employee_number from '^S([0-9]{4,})$')::int) from public.employees), 0) > 0);

-- prochain numéro libre (insensible à la casse : « s0027 » saisi à la main bloque S0027)
create or replace function public.next_employee_number()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare v text;
begin
  loop
    v := 'S' || lpad(nextval('public.employee_number_seq')::text, 4, '0');
    exit when not exists (select 1 from public.employees where upper(employee_number) = v);
  end loop;
  return v;
end;
$$;
revoke execute on function public.next_employee_number() from public, anon, authenticated;

-- aperçu sans consommer la séquence
create or replace function public.preview_employee_number()
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare n bigint; called boolean; v text;
begin
  select last_value, is_called into n, called from public.employee_number_seq;
  if called then n := n + 1; end if;
  loop
    v := 'S' || lpad(n::text, 4, '0');
    exit when not exists (select 1 from public.employees where upper(employee_number) = v);
    n := n + 1;
  end loop;
  return v;
end;
$$;
revoke execute on function public.preview_employee_number() from public, anon;
grant execute on function public.preview_employee_number() to authenticated;

-- ------------------------------------------------------------- déclencheurs
create or replace function public.employees_assign_number()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(trim(new.employee_number), '') = '' or not public.has_role(array['admin']) then
    new.employee_number := public.next_employee_number();
  else
    new.employee_number := trim(new.employee_number);
  end if;
  return new;
end;
$$;

drop trigger if exists employees_assign_number on public.employees;
create trigger employees_assign_number before insert on public.employees
  for each row execute function public.employees_assign_number();

create or replace function public.employees_lock_number()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.employee_number is distinct from old.employee_number
     and coalesce(current_setting('soma.allow_matricule_change', true), '') <> 'on' then
    raise exception 'Le matricule % ne peut pas être modifié', old.employee_number
      using hint = 'Un administrateur peut le corriger avec la procédure de changement de matricule.';
  end if;
  return new;
end;
$$;

drop trigger if exists employees_lock_number on public.employees;
create trigger employees_lock_number before update of employee_number on public.employees
  for each row execute function public.employees_lock_number();

-- --------------------------------------------- procédure d'administration exceptionnelle
create or replace function public.admin_change_employee_number(p_employee_id uuid, p_new_number text, p_reason text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare v_old text; v_new text := upper(trim(p_new_number));
begin
  if not public.has_role(array['admin']) then
    raise exception 'Seul un administrateur peut changer un matricule';
  end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'Le motif du changement est obligatoire';
  end if;
  if v_new !~ '^S[0-9]{4,}$' then
    raise exception 'Format attendu : S suivi d''au moins 4 chiffres (ex. S0027)';
  end if;
  select employee_number into v_old from public.employees where id = p_employee_id for update;
  if v_old is null then raise exception 'Salarié introuvable'; end if;
  if exists (select 1 from public.employees where upper(employee_number) = v_new and id <> p_employee_id) then
    raise exception 'Le matricule % est déjà attribué', v_new;
  end if;
  perform set_config('soma.allow_matricule_change', 'on', true);
  update public.employees set employee_number = v_new where id = p_employee_id;
  perform set_config('soma.allow_matricule_change', '', true);
  insert into public.audit_log(table_name, record_id, action, old_data, new_data, reason)
  values ('employees', p_employee_id, 'changement de matricule',
          jsonb_build_object('employee_number', v_old), jsonb_build_object('employee_number', v_new), trim(p_reason));
  return v_new;
end;
$$;
revoke execute on function public.admin_change_employee_number(uuid, text, text) from public, anon;
grant execute on function public.admin_change_employee_number(uuid, text, text) to authenticated;
