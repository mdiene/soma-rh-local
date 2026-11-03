-- T-I4 : séparation préparateur / approbateur et contrôle de rôle sur transition_payroll_entry.
-- Usage : psql -v ON_ERROR_STOP=1 -f tests/sql/payroll_separation.sql  (attendu : "OK payroll_separation")
-- Aucun identifiant personnel n'est écrit ici : les comptes sont pris dans user_roles. Tout est annulé.
begin;

create temp table t_ctx as
select
  (select id from public.payroll_entries where status = 'Validée' order by created_at limit 1) as entry_id,
  (select user_id from public.user_roles where role = 'rh' order by user_id limit 1) as user_a,
  (select user_id from public.user_roles where role = 'rh' order by user_id offset 1 limit 1) as user_b,
  (select user_id from public.user_roles group by user_id having bool_and(role = 'salarie') order by user_id limit 1) as user_s;
grant select on t_ctx to authenticated;

do $$ declare c t_ctx; begin
  select * into c from t_ctx;
  if c.entry_id is null or c.user_a is null or c.user_b is null or c.user_s is null then
    raise exception 'jeu de données insuffisant pour le test (paie Validée, 2 rh, 1 salarié simple)';
  end if;
  -- remet la paie « En revue », préparée par A
  perform set_config('soma.payroll_transition', 'on', true);
  update public.payroll_entries set status = 'En revue', created_by = c.user_a, submitted_by = c.user_a, approved_by = null
   where id = c.entry_id;
end $$;

create or replace function pg_temp.try_approve(p_user uuid) returns text language plpgsql as $$
declare v_entry uuid := (select entry_id from t_ctx);
begin
  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  begin
    perform public.transition_payroll_entry(v_entry, 'Approuvée', null);
    execute 'reset role';
    return 'OK';
  exception when others then
    execute 'reset role';
    return sqlerrm;
  end;
end $$;

do $$ declare c t_ctx; r text; begin
  select * into c from t_ctx;

  r := pg_temp.try_approve(c.user_s);
  if r not like 'Droits insuffisants%' then raise exception 'salarié simple : attendu refus de rôle, obtenu « % »', r; end if;

  r := pg_temp.try_approve(c.user_a);
  if r not like 'Séparation des tâches%' then raise exception 'préparateur : attendu refus de séparation, obtenu « % »', r; end if;

  r := pg_temp.try_approve(c.user_b);
  if r like 'Séparation%' or r like 'Droits insuffisants%' then raise exception 'autre rh : refusé à tort : « % »', r; end if;
end $$;

rollback;
select 'OK payroll_separation';
