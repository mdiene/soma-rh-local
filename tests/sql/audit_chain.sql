-- T-I16 / T-I18 : journal unique, chaîne vérifiable, immuable. Tout est annulé à la fin.
-- Usage : psql -v ON_ERROR_STOP=1 -f tests/sql/audit_chain.sql  (attendu : "OK audit_chain")
begin;

insert into public.audit_log (table_name, action, reason) values ('test', 'A', 'un'), ('test', 'B', 'deux');
do $$ begin
  if exists (select 1 from public.audit_verify()) then raise exception 'chaîne cassée avant altération'; end if;
end $$;

-- altération : le déclencheur d'immuabilité doit refuser
do $$ begin
  begin
    update public.audit_log set reason = 'falsifié' where table_name = 'test' and action = 'A';
    raise exception 'UPDATE accepté sur le journal';
  exception when insufficient_privilege then null; end;
  begin
    delete from public.audit_log where table_name = 'test';
    raise exception 'DELETE accepté sur le journal';
  exception when insufficient_privilege then null; end;
end $$;

-- altération contournée (déclencheur coupé) : audit_verify doit la signaler
alter table public.audit_log disable trigger audit_log_immutable_bud;
update public.audit_log set reason = 'falsifié' where table_name = 'test' and action = 'A';
do $$ begin
  if not exists (select 1 from public.audit_verify() where problem like 'contenu modif%') then
    raise exception 'altération non détectée';
  end if;
end $$;

rollback;
select 'OK audit_chain';
