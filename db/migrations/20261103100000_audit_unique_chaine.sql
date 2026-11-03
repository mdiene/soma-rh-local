-- =============================================================================
-- L1-04 — Journal d'audit unique (décision Q2 : audit_log est le journal métier)
-- Expand uniquement : audit_events reste lisible et alimenté ; chaque insertion
-- y est recopiée dans audit_log. Contract (suppression d'audit_events) après un
-- cycle de paie validé.
-- audit_log reçoit une chaîne d'empreintes SHA-256 (I16, I18) et devient immuable.
-- =============================================================================

alter table public.audit_log
  add column if not exists payroll_entry_id uuid references public.payroll_entries(id) on delete set null,
  add column if not exists result           text not null default 'success'
                                            check (result in ('success','denied','error')),
  add column if not exists source_event_id  uuid,
  add column if not exists chain_pos        bigint,
  add column if not exists prev_hash        text,
  add column if not exists row_hash         text;

create index if not exists audit_log_payroll_entry_idx on public.audit_log(payroll_entry_id);
create unique index if not exists audit_log_source_event_uidx on public.audit_log(source_event_id) where source_event_id is not null;
create unique index if not exists audit_log_chain_pos_uidx on public.audit_log(chain_pos) where chain_pos is not null;

-- Empreinte d'une ligne. L'acteur est exclu : la suppression d'un compte le met à null (FK set null).
create or replace function public.audit_row_hash(p_prev text, r public.audit_log)
returns text language sql immutable set search_path = public, pg_temp as $$
  select encode(sha256(convert_to(concat_ws('|',
    coalesce(p_prev, ''), r.chain_pos, extract(epoch from r.occurred_at)::text, r.table_name, r.record_id::text,
    r.record_key, r.action, r.old_data::text, r.new_data::text, r.reason, r.result,
    r.payroll_entry_id::text), 'UTF8')), 'hex')
$$;

-- --------------------------------------------------------------- chaînage à l'insertion
create or replace function public.audit_log_chain()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare v_prev text; v_pos bigint;
begin
  perform pg_advisory_xact_lock(hashtext('audit_log_chain'));
  select row_hash, chain_pos into v_prev, v_pos
  from public.audit_log where chain_pos is not null order by chain_pos desc limit 1;
  new.chain_pos := coalesce(v_pos, 0) + 1;
  new.prev_hash := v_prev;
  new.row_hash  := public.audit_row_hash(v_prev, new);
  return new;
end $$;

-- --------------------------------------------------------------- historique : chaînage des lignes existantes
do $$
declare r public.audit_log; v_prev text := null; v_pos bigint := 0;
begin
  for r in select * from public.audit_log order by occurred_at, id loop
    v_pos := v_pos + 1;
    r.chain_pos := v_pos; r.prev_hash := v_prev;
    r.row_hash := public.audit_row_hash(v_prev, r);
    update public.audit_log set chain_pos = r.chain_pos, prev_hash = r.prev_hash, row_hash = r.row_hash where id = r.id;
    v_prev := r.row_hash;
  end loop;
end $$;

drop trigger if exists audit_log_chain_bi on public.audit_log;
create trigger audit_log_chain_bi before insert on public.audit_log
  for each row execute function public.audit_log_chain();

-- --------------------------------------------------------------- immuabilité
create or replace function public.audit_log_immutable()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  -- seule exception : mise à null de l'acteur quand son compte est supprimé
  if tg_op = 'UPDATE' and new.actor is null
     and (to_jsonb(new) - 'actor') = (to_jsonb(old) - 'actor') then
    return new;
  end if;
  raise exception 'Le journal d''audit est en lecture seule (% refusé).', tg_op using errcode = '42501';
end $$;

drop trigger if exists audit_log_immutable_bud on public.audit_log;
create trigger audit_log_immutable_bud before update or delete on public.audit_log
  for each row execute function public.audit_log_immutable();

-- --------------------------------------------------------------- audit_events -> audit_log
create or replace function public.audit_events_to_log()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into public.audit_log (occurred_at, actor, table_name, record_id, action, old_data, new_data,
                                reason, payroll_entry_id, result, source_event_id)
  values (new.created_at, new.actor_id, new.resource_type, new.resource_id, new.action, new.before_data,
          new.after_data, new.reason, new.payroll_entry_id, new.result, new.id)
  on conflict (source_event_id) where source_event_id is not null do nothing;
  return new;
end $$;

-- reprise de l'historique (idempotente)
insert into public.audit_log (occurred_at, actor, table_name, record_id, action, old_data, new_data,
                              reason, payroll_entry_id, result, source_event_id)
select e.created_at, e.actor_id, e.resource_type, e.resource_id, e.action, e.before_data, e.after_data,
       e.reason, e.payroll_entry_id, e.result, e.id
from public.audit_events e
order by e.created_at, e.id
on conflict (source_event_id) where source_event_id is not null do nothing;

drop trigger if exists audit_events_to_log_ai on public.audit_events;
create trigger audit_events_to_log_ai after insert on public.audit_events
  for each row execute function public.audit_events_to_log();

-- --------------------------------------------------------------- vérification
-- Renvoie une ligne par rupture de chaîne ; aucun résultat = chaîne intacte.
create or replace function public.audit_verify()
returns table (chain_pos bigint, id bigint, problem text)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare r public.audit_log; v_prev text := null; v_expected bigint := 1;
begin
  if not (select public.has_role(array['admin','rh'])) and current_user not in ('postgres','soma') then
    raise exception 'Accès refusé : réservé aux rôles admin et rh.' using errcode = '42501';
  end if;
  for r in select * from public.audit_log a where a.chain_pos is not null order by a.chain_pos loop
    if r.chain_pos <> v_expected then
      chain_pos := r.chain_pos; id := r.id; problem := 'position manquante (attendue ' || v_expected || ')'; return next;
      v_expected := r.chain_pos;
    end if;
    if r.prev_hash is distinct from v_prev then
      chain_pos := r.chain_pos; id := r.id; problem := 'empreinte précédente différente'; return next;
    end if;
    if r.row_hash is distinct from public.audit_row_hash(r.prev_hash, r) then
      chain_pos := r.chain_pos; id := r.id; problem := 'contenu modifié'; return next;
    end if;
    v_prev := r.row_hash; v_expected := v_expected + 1;
  end loop;
  if exists (select 1 from public.audit_log a where a.chain_pos is null) then
    chain_pos := null; id := null; problem := 'lignes hors chaîne'; return next;
  end if;
end $$;

revoke all on function public.audit_verify() from public, anon;
grant execute on function public.audit_verify() to authenticated;
