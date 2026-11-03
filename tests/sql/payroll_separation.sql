-- T-I4 / L1-02 / L1-03 : séparation préparateur-approbateur, dérogation admin motivée,
-- refus journalisés, absence de contournement par submit_payroll_entry, contrôles de période.
-- Usage : psql -v ON_ERROR_STOP=1 -f tests/sql/payroll_separation.sql  (attendu : "OK payroll_separation")
-- Aucun identifiant personnel n'est écrit ici : les comptes sont pris dans user_roles. Tout est annulé.
begin;

create temp table t_ctx as
select
  (select id from public.payroll_entries where status = 'Validée' order by created_at limit 1) as entry_id,
  (select user_id from public.user_roles where role = 'rh' and user_id not in (select user_id from public.user_roles where role = 'admin') order by user_id limit 1) as user_rh,
  (select user_id from public.user_roles where role = 'admin' order by user_id limit 1) as user_admin,
  (select user_id from public.user_roles where role = 'paie' and user_id not in (select user_id from public.user_roles where role = 'admin') order by user_id limit 1) as user_paie,
  (select user_id from public.user_roles group by user_id having bool_and(role = 'salarie') order by user_id limit 1) as user_s;
grant select on t_ctx to authenticated;

-- prépare la paie : statut + préparateur donnés ; les salariés actifs sans bulletin sont mis de côté
-- pour que les contrôles bloquants n'interfèrent pas avec ce qu'on teste
create or replace function pg_temp.setup(p_status text, p_preparer uuid) returns void language plpgsql as $$
declare c t_ctx;
begin
  select * into c from t_ctx;
  perform set_config('soma.payroll_transition', 'on', true);
  update public.payroll_entries set status = p_status, created_by = p_preparer, submitted_by = p_preparer,
         approved_by = null where id = c.entry_id;
  update public.employees e set status = 'Inactive' where e.status = 'Active' and not exists
    (select 1 from public.salary_slips s where s.payroll_entry_id = c.entry_id and s.employee_id = e.id and s.status <> 'Annulé');
end $$;

create or replace function pg_temp.act(p_user uuid, p_target text, p_reason text) returns jsonb language plpgsql as $$
declare v jsonb; c t_ctx;
begin
  select * into c from t_ctx;
  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  v := public.try_transition_payroll_entry(c.entry_id, p_target, p_reason);
  execute 'reset role';
  return v;
end $$;

create or replace function pg_temp.submit_as(p_user uuid, p_reason text) returns text language plpgsql as $$
declare c t_ctx;
begin
  select * into c from t_ctx;
  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  begin
    perform public.submit_payroll_entry(c.entry_id, p_reason);
    execute 'reset role';
    return 'OK';
  exception when others then
    execute 'reset role';
    return sqlerrm;
  end;
end $$;

do $$ declare c t_ctx; r jsonb; n int; s text; begin
  select * into c from t_ctx;
  if c.entry_id is null or c.user_rh is null or c.user_admin is null or c.user_paie is null or c.user_s is null then
    raise exception 'jeu de données insuffisant (paie Validée, un rh, un admin, un paie, un salarié simple)';
  end if;

  -- 1. rôle insuffisant : refus explicite et journalisé
  perform pg_temp.setup('En revue', c.user_admin);
  r := pg_temp.act(c.user_s, 'Approuvée', null);
  if (r->>'ok')::boolean or r->>'message' not like 'Droits insuffisants%' then raise exception '1 : attendu refus de rôle, obtenu %', r; end if;
  select count(*) into n from public.audit_events where action = 'transition_refusee' and result = 'denied' and payroll_entry_id = c.entry_id;
  if n <> 1 then raise exception '1 : refus non journalisé (% ligne)', n; end if;
  select count(*) into n from public.audit_log where action = 'transition_refusee' and result = 'denied' and payroll_entry_id = c.entry_id;
  if n <> 1 then raise exception '1 : refus absent du journal unique'; end if;

  -- 2. le préparateur (ici un admin) sans motif : refus avec invitation à déroger
  r := pg_temp.act(c.user_admin, 'Approuvée', null);
  if (r->>'ok')::boolean or r->>'code' <> 'SD403' or r->>'message' not like '%déroger%' then raise exception '2 : attendu refus de séparation, obtenu %', r; end if;

  -- 3. dérogation admin avec motif : acceptée et journalisée
  r := pg_temp.act(c.user_admin, 'Approuvée', 'Absence du second responsable (test)');
  if not (r->>'ok')::boolean then raise exception '3 : dérogation refusée : %', r; end if;
  select count(*) into n from public.audit_events where action = 'derogation_separation' and payroll_entry_id = c.entry_id
     and reason = 'Absence du second responsable (test)' and actor_id = c.user_admin;
  if n <> 1 then raise exception '3 : dérogation non journalisée'; end if;

  -- 4. un autre responsable rh approuve sans dérogation
  perform pg_temp.setup('En revue', c.user_admin);
  r := pg_temp.act(c.user_rh, 'Approuvée', null);
  if not (r->>'ok')::boolean then raise exception '4 : rh non préparateur refusé : %', r; end if;

  -- 5. pas de contournement par la validation directe (rôle paie, préparateur = lui-même)
  perform pg_temp.setup('Calculée', c.user_paie);
  s := pg_temp.submit_as(c.user_paie, null);
  if s not like 'Séparation des tâches%' then raise exception '5 : submit_payroll_entry contourne I4 : %', s; end if;
  s := pg_temp.submit_as(c.user_paie, 'motif sans être admin');
  if s not like 'Séparation des tâches%' then raise exception '5 : un non-admin ne doit pas déroger : %', s; end if;

  -- 6. les contrôles de période sont appelables (fonction restaurée)
  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', c.user_rh::text, true);
  perform public.payroll_entry_checks(c.entry_id);
  execute 'reset role';

  -- 7. le journal unique reste intact après toutes ces écritures
  if exists (select 1 from public.audit_verify()) then raise exception '7 : chaîne d''audit rompue'; end if;
end $$;

rollback;
select 'OK payroll_separation';
