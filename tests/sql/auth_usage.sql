-- Non-régression : « permission denied for schema auth » à l'écriture d'une présence.
-- Usage : psql -v ON_ERROR_STOP=1 -f tests/sql/auth_usage.sql  (attendu : "OK auth_usage")
-- Tout est annulé. Aucun identifiant personnel n'est écrit ici.
select user_id from public.user_roles where role = 'rh' limit 1 \gset
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', :'user_id', true) is not null;

do $$
declare n int;
begin
  if auth.uid() is null then raise exception 'auth.uid() inutilisable par authenticated'; end if;
  -- écriture d'une présence : passe par le déclencheur attendance_touch (auth.uid() avec les droits de l'appelant)
  insert into public.attendance (employee_id, attendance_date, status, working_hours)
    select id, date '2031-01-05', 'Présent', 8 from public.employees where status = 'Active' limit 1
    on conflict (employee_id, attendance_date) do update set status = excluded.status;
  update public.attendance set working_hours = 7 where attendance_date = '2031-01-05';
  select count(*) into n from public.attendance where attendance_date = '2031-01-05' and updated_by = auth.uid();
  if n <> 1 then raise exception 'présence non écrite ou auteur non enregistré (% ligne)', n; end if;
  -- le droit sur le schéma n'ouvre pas la table des comptes
  begin
    perform 1 from auth.users limit 1;
    raise exception 'auth.users lisible par authenticated';
  exception when insufficient_privilege then null; end;
end $$;

rollback;
select 'OK auth_usage';
