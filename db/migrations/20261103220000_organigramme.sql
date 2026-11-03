-- =============================================================================
-- Module Organigramme (Équipes et managers)
-- * hiérarchie directe : on RÉUTILISE employee_manager_assignments (datée, un seul manager valide à une date)
--   + refus des cycles (trigger) ;
-- * liens hors hiérarchie : org_relations (dotted / interim / functional), datés, avec quote-part ;
-- * équipes transverses : teams / team_members ;
-- * lecture : org_chart(date) — sans aucune donnée de paie ; e-mail réservé à rh/admin ;
-- * écritures : RPC réservées à rh/admin, motif obligatoire, journalisées dans audit_log.
-- Réversible : voir db/rollback/20261103220000_organigramme_down.sql
-- =============================================================================

-- ------------------------------------------------------------ refus des cycles
create or replace function public.org_prevent_cycle()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.manager_employee_id = new.employee_id then
    raise exception 'Un salarié ne peut pas être son propre manager';
  end if;
  -- un seul manager direct valide à une date donnée (règle 2 du module ; l'ancien contrôle ne visait que le même couple)
  if exists (select 1 from public.employee_manager_assignments a
              where a.id is distinct from new.id and a.employee_id = new.employee_id
                and a.valid_from <= coalesce(new.valid_to, date 'infinity')
                and coalesce(a.valid_to, date 'infinity') >= new.valid_from) then
    raise exception 'Ce salarié a déjà un manager direct sur cette période : utilisez « changer de manager » (date d''effet) plutôt que d''ajouter un second rattachement';
  end if;
  if exists (
    with recursive up(id, depth) as (
      select new.manager_employee_id, 1
      union all
      select a.manager_employee_id, up.depth + 1
        from up join public.employee_manager_assignments a on a.employee_id = up.id
       where a.id is distinct from new.id and up.depth < 60
         and a.valid_from <= coalesce(new.valid_to, date 'infinity')
         and coalesce(a.valid_to, date 'infinity') >= new.valid_from)
    select 1 from up where id = new.employee_id) then
    raise exception 'Cycle hiérarchique refusé : ce rattachement ferait du manager un subordonné de ce salarié (directement ou indirectement)';
  end if;
  return new;
end;
$$;
drop trigger if exists employee_manager_assignments_no_cycle on public.employee_manager_assignments;
create trigger employee_manager_assignments_no_cycle before insert or update on public.employee_manager_assignments
  for each row execute function public.org_prevent_cycle();

-- ------------------------------------------------------------ tables
create table if not exists public.org_relations (
  id                  uuid primary key default gen_random_uuid(),
  employee_id         uuid not null references public.employees(id) on delete cascade,
  related_employee_id uuid not null references public.employees(id) on delete cascade,
  relation_type       text not null check (relation_type in ('dotted', 'interim', 'functional')),
  start_date          date not null,
  end_date            date,
  allocation_pct      numeric check (allocation_pct is null or (allocation_pct >= 0 and allocation_pct <= 100)),
  note                text,
  created_by          uuid references auth.users(id) on delete set null default auth.uid(),
  created_at          timestamptz not null default now(),
  check (employee_id <> related_employee_id),
  check (end_date is null or end_date >= start_date)
);
comment on table public.org_relations is 'Liens hors hiérarchie. interim : employee_id assure l''intérim de related_employee_id ; dotted / functional : employee_id rapporte aussi à related_employee_id.';
create index if not exists org_relations_employee_idx on public.org_relations(employee_id);
create index if not exists org_relations_related_idx on public.org_relations(related_employee_id);
create index if not exists org_relations_created_by_idx on public.org_relations(created_by);

create table if not exists public.teams (
  id               uuid primary key default gen_random_uuid(),
  name             text not null check (length(trim(name)) > 0),
  kind             text not null check (kind in ('department', 'cross_functional', 'project', 'committee')),
  lead_employee_id uuid references public.employees(id) on delete set null,
  start_date       date not null default current_date,
  end_date         date,
  created_by       uuid references auth.users(id) on delete set null default auth.uid(),
  created_at       timestamptz not null default now(),
  check (end_date is null or end_date >= start_date)
);
create index if not exists teams_lead_idx on public.teams(lead_employee_id);
create index if not exists teams_created_by_idx on public.teams(created_by);

create table if not exists public.team_members (
  team_id        uuid not null references public.teams(id) on delete cascade,
  employee_id    uuid not null references public.employees(id) on delete cascade,
  role_in_team   text not null default 'membre',
  allocation_pct numeric not null default 0 check (allocation_pct >= 0 and allocation_pct <= 100),
  start_date     date not null default current_date,
  end_date       date,
  primary key (team_id, employee_id, start_date),
  check (end_date is null or end_date >= start_date)
);
create index if not exists team_members_employee_idx on public.team_members(employee_id);

-- un même lien (salarié, lié, type) ne se chevauche pas dans le temps
create or replace function public.org_relations_no_overlap()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (select 1 from public.org_relations r
              where r.id is distinct from new.id and r.employee_id = new.employee_id
                and r.related_employee_id = new.related_employee_id and r.relation_type = new.relation_type
                and r.start_date <= coalesce(new.end_date, date 'infinity')
                and coalesce(r.end_date, date 'infinity') >= new.start_date) then
    raise exception 'Un lien du même type existe déjà entre ces deux salariés sur cette période : terminez-le ou modifiez ses dates';
  end if;
  return new;
end;
$$;
drop trigger if exists org_relations_no_overlap_biu on public.org_relations;
create trigger org_relations_no_overlap_biu before insert or update on public.org_relations
  for each row execute function public.org_relations_no_overlap();

-- ------------------------------------------------------------ RLS : lecture rh/paie/admin ; les autres passent par org_chart()
alter table public.org_relations enable row level security;
alter table public.teams enable row level security;
alter table public.team_members enable row level security;
drop policy if exists org_relations_read on public.org_relations;
create policy org_relations_read on public.org_relations for select to authenticated using ((select public.has_role(array['rh', 'paie'])));
drop policy if exists teams_read on public.teams;
create policy teams_read on public.teams for select to authenticated using ((select public.has_role(array['rh', 'paie'])));
drop policy if exists team_members_read on public.team_members;
create policy team_members_read on public.team_members for select to authenticated using ((select public.has_role(array['rh', 'paie'])));
revoke insert, update, delete on public.org_relations, public.teams, public.team_members from anon, authenticated;

drop trigger if exists org_relations_audit on public.org_relations;
create trigger org_relations_audit after insert or update or delete on public.org_relations for each row execute function public.business_audit();
drop trigger if exists teams_audit on public.teams;
create trigger teams_audit after insert or update or delete on public.teams for each row execute function public.business_audit();

-- ------------------------------------------------------------ lecture : l'organigramme à une date
-- (volatile : alimente une table temporaire des salariés présents à la date)
create or replace function public.org_chart(p_on date default current_date)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hr boolean := public.has_role(array['rh']);
  v_nodes jsonb; v_edges jsonb; v_teams jsonb; v_anom jsonb := '[]'::jsonb;
begin
  if (select auth.uid()) is null or not (public.has_role(array['rh', 'paie', 'manager', 'salarie']) or (select public.my_employee_id()) is not null) then
    raise exception 'Droits insuffisants pour consulter l''organigramme';
  end if;

  create temp table if not exists pg_temp.org_nodes (id uuid primary key) on commit drop;
  truncate pg_temp.org_nodes;
  insert into pg_temp.org_nodes
    select e.id from public.employees e
     where e.status in ('Active', 'Left', 'Suspended') and e.date_of_joining <= p_on
       and (e.relieving_date is null or e.relieving_date >= p_on);

  select coalesce(jsonb_agg(jsonb_build_object(
      'id', e.id, 'matricule', e.employee_number, 'prenom', e.first_name, 'nom', e.last_name,
      'poste', coalesce(d.name, 'Poste non renseigné'), 'departement', dep.name,
      'email', case when v_hr then e.email_work end,
      'statut', case
          when exists (select 1 from public.leave_applications l where l.employee_id = e.id and l.status = 'Approuvée' and p_on between l.from_date and l.to_date) then 'en_conge'
          when exists (select 1 from public.org_relations r where r.employee_id = e.id and r.relation_type = 'interim' and p_on between r.start_date and coalesce(r.end_date, date 'infinity')) then 'interim'
          else 'actif' end,
      'sortie', e.relieving_date,
      'subordonnes', (select count(*) from public.employee_manager_assignments a
                       where a.manager_employee_id = e.id and p_on between a.valid_from and coalesce(a.valid_to, date 'infinity')
                         and a.employee_id in (select id from pg_temp.org_nodes)),
      'equipes', (select count(*) from public.team_members m join public.teams t on t.id = m.team_id
                   where m.employee_id = e.id and p_on between m.start_date and coalesce(m.end_date, date 'infinity')
                     and p_on between t.start_date and coalesce(t.end_date, date 'infinity'))
    ) order by e.last_name, e.first_name), '[]'::jsonb)
    into v_nodes
    from public.employees e
    left join public.designations d on d.id = e.designation_id
    left join public.departments dep on dep.id = e.department_id
   where e.id in (select id from pg_temp.org_nodes);

  select coalesce(jsonb_agg(x), '[]'::jsonb) into v_edges from (
    select jsonb_build_object('id', a.id, 'type', 'direct', 'source', a.manager_employee_id, 'target', a.employee_id,
                              'debut', a.valid_from, 'fin', a.valid_to) as x
      from public.employee_manager_assignments a
     where p_on between a.valid_from and coalesce(a.valid_to, date 'infinity')
       and a.employee_id in (select id from pg_temp.org_nodes) and a.manager_employee_id in (select id from pg_temp.org_nodes)
    union all
    select jsonb_build_object('id', r.id, 'type', r.relation_type, 'source', r.related_employee_id, 'target', r.employee_id,
                              'debut', r.start_date, 'fin', r.end_date, 'quote_part', r.allocation_pct, 'note', r.note)
      from public.org_relations r
     where p_on between r.start_date and coalesce(r.end_date, date 'infinity')
       and r.employee_id in (select id from pg_temp.org_nodes) and r.related_employee_id in (select id from pg_temp.org_nodes)
  ) t;

  select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'nom', t.name, 'type', t.kind, 'responsable', t.lead_employee_id,
      'debut', t.start_date, 'fin', t.end_date,
      'membres', (select coalesce(jsonb_agg(jsonb_build_object('employe', m.employee_id, 'role', m.role_in_team, 'quote_part', m.allocation_pct)), '[]'::jsonb)
                    from public.team_members m where m.team_id = t.id and p_on between m.start_date and coalesce(m.end_date, date 'infinity')
                      and m.employee_id in (select id from pg_temp.org_nodes))
    ) order by t.name), '[]'::jsonb)
    into v_teams from public.teams t where p_on between t.start_date and coalesce(t.end_date, date 'infinity');

  -- anomalies
  v_anom := v_anom || coalesce((
    select jsonb_agg(jsonb_build_object('code', 'manager_sorti', 'employe', a.employee_id,
             'message', 'Le manager a quitté la société le ' || to_char(m.relieving_date, 'DD/MM/YYYY') || ' : réaffecter ce salarié'))
      from public.employee_manager_assignments a join public.employees m on m.id = a.manager_employee_id
     where m.relieving_date is not null and m.relieving_date < p_on
       and p_on between a.valid_from and coalesce(a.valid_to, date 'infinity')
       and a.employee_id in (select id from pg_temp.org_nodes)), '[]'::jsonb);
  v_anom := v_anom || coalesce((
    select jsonb_agg(jsonb_build_object('code', 'interim_expire', 'employe', r.employee_id,
             'message', 'Intérim terminé le ' || to_char(r.end_date, 'DD/MM/YYYY') || ' : confirmer ou clôturer'))
      from public.org_relations r
     where r.relation_type = 'interim' and r.end_date < p_on and r.end_date >= p_on - 90
       and r.employee_id in (select id from pg_temp.org_nodes)), '[]'::jsonb);
  v_anom := v_anom || coalesce((
    select jsonb_agg(jsonb_build_object('code', 'allocation_depassee', 'employe', s.employee_id,
             'message', 'Quotes-parts cumulées de ' || s.total || ' % (maximum 100 %)'))
      from (select employee_id, sum(pct) as total from (
              select r.employee_id, r.allocation_pct as pct from public.org_relations r
               where r.allocation_pct is not null and p_on between r.start_date and coalesce(r.end_date, date 'infinity')
              union all
              select m.employee_id, m.allocation_pct from public.team_members m
               where p_on between m.start_date and coalesce(m.end_date, date 'infinity')) q
             group by employee_id having sum(pct) > 100) s
     where s.employee_id in (select id from pg_temp.org_nodes)), '[]'::jsonb);
  -- salarié sans manager et sans subordonné : non rattaché à la hiérarchie (les têtes de branche ne sont pas des anomalies)
  v_anom := v_anom || coalesce((
    select jsonb_agg(jsonb_build_object('code', 'sans_manager', 'employe', n.id, 'message', 'Aucun manager direct à cette date'))
      from pg_temp.org_nodes n
     where not exists (select 1 from public.employee_manager_assignments a
                        where a.employee_id = n.id and p_on between a.valid_from and coalesce(a.valid_to, date 'infinity'))
       and not exists (select 1 from public.employee_manager_assignments a2
                        where a2.manager_employee_id = n.id and p_on between a2.valid_from and coalesce(a2.valid_to, date 'infinity'))), '[]'::jsonb);

  return jsonb_build_object('date', p_on, 'noeuds', v_nodes, 'liens', v_edges, 'equipes', v_teams, 'anomalies', v_anom);
end;
$$;

-- ------------------------------------------------------------ écritures (rh/admin, motif obligatoire, journalisées)
create or replace function public.org_log(p_table text, p_record uuid, p_action text, p_reason text, p_data jsonb)
returns void
language sql
security definer
set search_path = ''
as $$ insert into public.audit_log (table_name, record_id, action, reason, new_data) values (p_table, p_record, p_action, p_reason, p_data) $$;

create or replace function public.org_require_hr(p_reason text)
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if not public.has_role(array['rh']) then raise exception 'Réservé au service RH (ou à un administrateur)'; end if;
  if length(trim(coalesce(p_reason, ''))) < 5 then raise exception 'Un motif d''au moins 5 caractères est obligatoire'; end if;
end;
$$;

-- changement de manager direct : clôt le lien courant la veille, ouvre le nouveau (p_manager null = fin de rattachement)
create or replace function public.org_set_manager(p_employee uuid, p_manager uuid, p_from date, p_reason text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_id uuid; v_user uuid;
begin
  perform public.org_require_hr(p_reason);
  if p_from is null then raise exception 'La date d''effet est obligatoire'; end if;
  if not exists (select 1 from public.employees where id = p_employee) then raise exception 'Salarié introuvable'; end if;
  if exists (select 1 from public.employee_manager_assignments where employee_id = p_employee and valid_from >= p_from) then
    raise exception 'Un rattachement commence déjà à partir de cette date : choisissez une date postérieure';
  end if;
  update public.employee_manager_assignments set valid_to = p_from - 1
   where employee_id = p_employee and valid_from < p_from and (valid_to is null or valid_to >= p_from);
  if p_manager is not null then
    insert into public.employee_manager_assignments(manager_employee_id, employee_id, valid_from, valid_to, delegated_by)
    values (p_manager, p_employee, p_from, null, (select auth.uid())) returning id into v_id;
    select user_id into v_user from public.employees where id = p_manager;
    if v_user is not null then insert into public.user_roles(user_id, role) values (v_user, 'manager') on conflict (user_id, role) do nothing; end if;
  end if;
  perform public.org_log('employee_manager_assignments', coalesce(v_id, p_employee), 'changement_manager', trim(p_reason),
          jsonb_build_object('employe', p_employee, 'manager', p_manager, 'effet', p_from));
  return v_id;
end;
$$;

create or replace function public.org_save_relation(p_id uuid, p_employee uuid, p_related uuid, p_type text,
  p_start date, p_end date, p_pct numeric, p_note text, p_reason text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_id uuid;
begin
  perform public.org_require_hr(p_reason);
  if p_id is null then
    insert into public.org_relations(employee_id, related_employee_id, relation_type, start_date, end_date, allocation_pct, note)
    values (p_employee, p_related, p_type, p_start, p_end, p_pct, nullif(trim(coalesce(p_note, '')), '')) returning id into v_id;
  else
    update public.org_relations set employee_id = p_employee, related_employee_id = p_related, relation_type = p_type,
           start_date = p_start, end_date = p_end, allocation_pct = p_pct, note = nullif(trim(coalesce(p_note, '')), '')
     where id = p_id returning id into v_id;
    if v_id is null then raise exception 'Lien introuvable'; end if;
  end if;
  perform public.org_log('org_relations', v_id, case when p_id is null then 'creation_lien' else 'modification_lien' end, trim(p_reason),
          jsonb_build_object('type', p_type, 'debut', p_start, 'fin', p_end, 'quote_part', p_pct));
  return v_id;
end;
$$;

create or replace function public.org_end_relation(p_id uuid, p_end date, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.org_require_hr(p_reason);
  update public.org_relations set end_date = p_end where id = p_id and start_date <= p_end and (end_date is null or end_date > p_end);
  if not found then raise exception 'Lien introuvable, déjà terminé à cette date, ou date de fin antérieure au début'; end if;
  perform public.org_log('org_relations', p_id, 'fin_lien', trim(p_reason), jsonb_build_object('fin', p_end));
end;
$$;

create or replace function public.org_save_team(p_id uuid, p_name text, p_kind text, p_lead uuid, p_start date, p_end date, p_reason text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_id uuid;
begin
  perform public.org_require_hr(p_reason);
  if p_id is null then
    insert into public.teams(name, kind, lead_employee_id, start_date, end_date) values (trim(p_name), p_kind, p_lead, coalesce(p_start, current_date), p_end) returning id into v_id;
  else
    update public.teams set name = trim(p_name), kind = p_kind, lead_employee_id = p_lead, start_date = coalesce(p_start, start_date), end_date = p_end where id = p_id returning id into v_id;
    if v_id is null then raise exception 'Équipe introuvable'; end if;
  end if;
  perform public.org_log('teams', v_id, case when p_id is null then 'creation_equipe' else 'modification_equipe' end, trim(p_reason), jsonb_build_object('nom', trim(p_name), 'type', p_kind));
  return v_id;
end;
$$;

create or replace function public.org_set_team_member(p_team uuid, p_employee uuid, p_role text, p_pct numeric, p_start date, p_end date, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.org_require_hr(p_reason);
  insert into public.team_members(team_id, employee_id, role_in_team, allocation_pct, start_date, end_date)
  values (p_team, p_employee, coalesce(nullif(trim(p_role), ''), 'membre'), coalesce(p_pct, 0), coalesce(p_start, current_date), p_end)
  on conflict (team_id, employee_id, start_date) do update set role_in_team = excluded.role_in_team, allocation_pct = excluded.allocation_pct, end_date = excluded.end_date;
  perform public.org_log('team_members', p_team, 'membre_equipe', trim(p_reason), jsonb_build_object('employe', p_employee, 'quote_part', p_pct));
end;
$$;

-- journalisation d'un export (format, nombre de lignes) : tout utilisateur autorisé à voir l'organigramme
create or replace function public.org_log_export(p_format text, p_rows integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then raise exception 'Connexion requise'; end if;
  insert into public.audit_log (table_name, action, new_data) values ('organigramme', 'export_organigramme', jsonb_build_object('format', p_format, 'lignes', p_rows));
end;
$$;

revoke all on function public.org_log(text, uuid, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.org_require_hr(text) from public, anon;
revoke all on function public.org_chart(date) from public, anon;
revoke all on function public.org_set_manager(uuid, uuid, date, text) from public, anon;
revoke all on function public.org_save_relation(uuid, uuid, uuid, text, date, date, numeric, text, text) from public, anon;
revoke all on function public.org_end_relation(uuid, date, text) from public, anon;
revoke all on function public.org_save_team(uuid, text, text, uuid, date, date, text) from public, anon;
revoke all on function public.org_set_team_member(uuid, uuid, text, numeric, date, date, text) from public, anon;
revoke all on function public.org_log_export(text, integer) from public, anon;
grant execute on function public.org_chart(date) to authenticated;
grant execute on function public.org_set_manager(uuid, uuid, date, text) to authenticated;
grant execute on function public.org_save_relation(uuid, uuid, uuid, text, date, date, numeric, text, text) to authenticated;
grant execute on function public.org_end_relation(uuid, date, text) to authenticated;
grant execute on function public.org_save_team(uuid, text, text, uuid, date, date, text) to authenticated;
grant execute on function public.org_set_team_member(uuid, uuid, text, numeric, date, date, text) to authenticated;
grant execute on function public.org_log_export(text, integer) to authenticated;
grant execute on function public.org_require_hr(text) to authenticated;
