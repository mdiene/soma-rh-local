-- Postes vacants : calcul prévu − pourvus, droits (rh écrit, salarié refusé), journalisation.
-- Usage : psql -v ON_ERROR_STOP=1 -f tests/sql/postes_vacants.sql  (attendu : "OK postes vacants"). Données synthétiques, annulées en fin de test.
select user_id as u_rh from public.user_roles where role = 'rh' order by user_id limit 1 \gset
select user_id as u_sal from public.user_roles group by user_id having bool_and(role = 'salarie') order by user_id limit 1 \gset
begin;
select set_config('t.u_rh', :'u_rh', true) is not null;
select set_config('t.u_sal', :'u_sal', true) is not null;
create or replace function pg_temp.try(p_sql text) returns text language plpgsql as $$
begin execute p_sql; return 'OK'; exception when others then return sqlerrm; end $$;
do $$
declare u_rh uuid := current_setting('t.u_rh')::uuid; u_sal uuid := current_setting('t.u_sal')::uuid;
  d uuid; p uuid; pos uuid; r text; c jsonb; v jsonb; e uuid;
begin
  execute 'set local role authenticated'; perform set_config('request.jwt.claim.sub', u_rh::text, true);
  d := public.org_save_unit(null, 'Direction vacance test', 'direction', null, null, null);
  p := public.org_save_post('Poste vacance test');
  pos := public.org_save_position(d, p, 3, 'test');
  c := public.org_chart(current_date);
  select x into v from jsonb_array_elements(c->'vacants') x where x->>'id' = pos::text;
  if (v->>'vacants')::int <> 3 or (v->>'pourvus')::int <> 0 then raise exception 'vacants initiaux faux : %', v; end if;
  -- un salarié occupe le poste : 2 restent à pourvoir (mise à jour idempotente de l'effectif)
  select id into e from public.employees where status = 'Active' and (department_id is null or department_id <> d) order by id limit 1;
  perform public.org_attach_to_unit(e, d, false);
  perform public.org_set_employee_post(e, p);
  perform public.org_save_position(d, p, 3, 'test');
  select x into v from jsonb_array_elements(public.org_chart(current_date)->'vacants') x where x->>'id' = pos::text;
  if (v->>'vacants')::int <> 2 or (v->>'pourvus')::int <> 1 then raise exception 'vacants après affectation faux : %', v; end if;
  if (select count(*) from public.org_positions where unit_id = d) <> 1 then raise exception 'doublon de poste prévu'; end if;
  r := pg_temp.try(format('select public.org_save_position(%L, %L, 0, null)', d, p));
  if r not like '%au moins 1%' then raise exception 'effectif nul accepté : %', r; end if;
  if (select count(*) from public.audit_log where action = 'poste_prevu' and record_id = pos) < 2 then raise exception 'postes prévus non journalisés'; end if;
  -- droits : un salarié ne peut ni créer ni voir les postes prévus
  execute 'reset role'; execute 'set local role authenticated'; perform set_config('request.jwt.claim.sub', u_sal::text, true);
  r := pg_temp.try(format('select public.org_save_position(%L, %L, 1, null)', d, p));
  if r not like 'Réservé au service RH%' then raise exception 'écriture acceptée pour un salarié : %', r; end if;
  if (select count(*) from public.org_positions) <> 0 then raise exception 'postes prévus visibles par un salarié'; end if;
  execute 'reset role';
end $$;
rollback;
select 'OK postes vacants';
