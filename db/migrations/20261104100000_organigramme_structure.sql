-- =============================================================================
-- Organigramme : structure de l'entreprise (directions, secteurs, sections), postes, rattachements
-- * on RÉUTILISE departments comme « unités » (parent, nom unique par société) : + kind, responsable, note ;
-- * un salarié est rattaché à une unité par employees.department_id (aucun compte requis) ;
-- * postes = designations (création depuis l'organigramme) ;
-- * le motif devient FACULTATIF partout, sauf pour remplacer ou retirer un manager direct existant ;
-- * org_chart() renvoie aussi unités, postes, unité de chaque salarié et ce dont il est responsable.
-- Retour : db/rollback/20261104100000_organigramme_structure_down.sql
-- =============================================================================

alter table public.departments
  add column if not exists kind text not null default 'direction' check (kind in ('direction', 'secteur', 'section', 'service')),
  add column if not exists head_employee_id uuid references public.employees(id) on delete set null,
  add column if not exists note text;
create index if not exists departments_head_idx on public.departments(head_employee_id);

-- pas de cycle dans la structure
create or replace function public.org_unit_no_cycle()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.parent_id is null then return new; end if;
  if new.parent_id = new.id then raise exception 'Une unité ne peut pas dépendre d''elle-même'; end if;
  if exists (with recursive up(id, depth) as (
               select new.parent_id, 1
               union all
               select d.parent_id, up.depth + 1 from up join public.departments d on d.id = up.id where d.parent_id is not null and up.depth < 30)
             select 1 from up where id = new.id) then
    raise exception 'Cycle refusé : cette unité deviendrait sa propre sous-unité';
  end if;
  return new;
end;
$$;
drop trigger if exists departments_no_cycle on public.departments;
create trigger departments_no_cycle before insert or update of parent_id on public.departments
  for each row execute function public.org_unit_no_cycle();

-- le motif n'est plus exigé par la vérification de rôle (chaque fonction décide)
create or replace function public.org_require_hr(p_reason text)
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if not public.has_role(array['rh']) then raise exception 'Réservé au service RH (ou à un administrateur)'; end if;
end;
$$;

-- ------------------------------------------------------------ lecture : org_chart enrichi
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
      'poste', coalesce(d.name, 'Poste non renseigné'), 'poste_id', e.designation_id, 'departement', dep.name, 'unite', e.department_id,
      'email', case when v_hr then e.email_work end,
      'statut', case
          when exists (select 1 from public.leave_applications l where l.employee_id = e.id and l.status = 'Approuvée' and p_on between l.from_date and l.to_date) then 'en_conge'
          when exists (select 1 from public.org_relations r where r.employee_id = e.id and r.relation_type = 'interim' and p_on between r.start_date and coalesce(r.end_date, date 'infinity')) then 'interim'
          else 'actif' end,
      'sortie', e.relieving_date,
      'responsable_de', coalesce((select jsonb_agg(u.name order by u.name) from public.departments u where u.head_employee_id = e.id), '[]'::jsonb)
        || coalesce((select jsonb_agg(t2.name order by t2.name) from public.teams t2 where t2.lead_employee_id = e.id and p_on between t2.start_date and coalesce(t2.end_date, date 'infinity')), '[]'::jsonb),
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

  return jsonb_build_object('date', p_on, 'noeuds', v_nodes, 'liens', v_edges, 'equipes', v_teams, 'anomalies', v_anom,
    'unites', (select coalesce(jsonb_agg(jsonb_build_object('id', u.id, 'nom', u.name, 'type', u.kind, 'parent', u.parent_id, 'responsable', u.head_employee_id,
                 'membres', (select count(*) from public.employees e2 where e2.department_id = u.id and e2.id in (select id from pg_temp.org_nodes))) order by u.name), '[]'::jsonb)
                 from public.departments u),
    'postes', (select coalesce(jsonb_agg(jsonb_build_object('id', ds.id, 'nom', ds.name) order by ds.name), '[]'::jsonb)
                 from public.designations ds where ds.is_active is not false));
end;
$$;

-- ------------------------------------------------------------ manager direct : motif exigé seulement pour un remplacement ou un retrait
create or replace function public.org_set_manager(p_employee uuid, p_manager uuid, p_from date, p_reason text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_id uuid; v_user uuid; v_has boolean;
begin
  perform public.org_require_hr(p_reason);
  if p_from is null then raise exception 'La date d''effet est obligatoire'; end if;
  if not exists (select 1 from public.employees where id = p_employee) then raise exception 'Salarié introuvable'; end if;
  select exists (select 1 from public.employee_manager_assignments
                  where employee_id = p_employee and valid_from < p_from and (valid_to is null or valid_to >= p_from)) into v_has;
  if p_manager is null and not v_has then raise exception 'Ce salarié n''a pas de manager direct à détacher'; end if;
  if v_has and length(trim(coalesce(p_reason, ''))) < 5 then
    raise exception 'Un motif d''au moins 5 caractères est obligatoire pour remplacer ou retirer un manager direct';
  end if;
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
  perform public.org_log('employee_manager_assignments', coalesce(v_id, p_employee), case when p_manager is null then 'detachement_manager' else 'changement_manager' end,
          nullif(trim(coalesce(p_reason, '')), ''), jsonb_build_object('employe', p_employee, 'manager', p_manager, 'effet', p_from));
  return v_id;
end;
$$;

-- ------------------------------------------------------------ unités (directions, secteurs, sections)
create or replace function public.org_save_unit(p_id uuid, p_name text, p_kind text, p_parent uuid, p_head uuid, p_note text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_id uuid; v_company uuid;
begin
  perform public.org_require_hr(null);
  if coalesce(trim(p_name), '') = '' then raise exception 'Le nom est obligatoire'; end if;
  if p_kind not in ('direction', 'secteur', 'section', 'service') then raise exception 'Type d''unité invalide'; end if;
  select coalesce((select company_id from public.departments where id = p_parent), (select company_id from public.departments where id = p_id),
                  (select id from public.companies order by created_at limit 1)) into v_company;
  begin
    if p_id is null then
      insert into public.departments(company_id, name, kind, parent_id, head_employee_id, note)
      values (v_company, trim(p_name), p_kind, p_parent, p_head, nullif(trim(coalesce(p_note, '')), '')) returning id into v_id;
    else
      update public.departments set name = trim(p_name), kind = p_kind, parent_id = p_parent, head_employee_id = p_head, note = nullif(trim(coalesce(p_note, '')), '')
       where id = p_id returning id into v_id;
      if v_id is null then raise exception 'Unité introuvable'; end if;
    end if;
  exception when unique_violation then
    raise exception 'Une unité porte déjà le nom « % »', trim(p_name);
  end;
  perform public.org_log('departments', v_id, case when p_id is null then 'creation_unite' else 'modification_unite' end, nullif(trim(coalesce(p_note, '')), ''),
          jsonb_build_object('nom', trim(p_name), 'type', p_kind, 'parent', p_parent, 'responsable', p_head));
  return v_id;
end;
$$;

create or replace function public.org_delete_unit(p_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare v_n integer; v_name text;
begin
  perform public.org_require_hr(null);
  select name into v_name from public.departments where id = p_id;
  if v_name is null then raise exception 'Unité introuvable'; end if;
  if exists (select 1 from public.departments where parent_id = p_id) then
    raise exception 'Cette unité contient des sous-unités : déplacez-les ou supprimez-les d''abord';
  end if;
  update public.employees set department_id = null where department_id = p_id;
  get diagnostics v_n = row_count;
  delete from public.departments where id = p_id;
  perform public.org_log('departments', p_id, 'suppression_unite', null, jsonb_build_object('nom', v_name, 'salaries_detaches', v_n));
  return v_n;
end;
$$;

create or replace function public.org_set_employee_unit(p_employee uuid, p_unit uuid, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.org_require_hr(null);
  if p_unit is not null and not exists (select 1 from public.departments where id = p_unit) then raise exception 'Unité introuvable'; end if;
  update public.employees set department_id = p_unit where id = p_employee;
  if not found then raise exception 'Salarié introuvable'; end if;
  perform public.org_log('employees', p_employee, case when p_unit is null then 'detachement_unite' else 'rattachement_unite' end,
          nullif(trim(coalesce(p_note, '')), ''), jsonb_build_object('unite', p_unit));
end;
$$;

create or replace function public.org_set_unit_head(p_unit uuid, p_employee uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.org_require_hr(null);
  update public.departments set head_employee_id = p_employee where id = p_unit;
  if not found then raise exception 'Unité introuvable'; end if;
  perform public.org_log('departments', p_unit, 'responsable_unite', null, jsonb_build_object('responsable', p_employee));
end;
$$;

-- ------------------------------------------------------------ postes
create or replace function public.org_save_post(p_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_id uuid;
begin
  perform public.org_require_hr(null);
  if coalesce(trim(p_name), '') = '' then raise exception 'Le nom du poste est obligatoire'; end if;
  select id into v_id from public.designations where lower(name) = lower(trim(p_name));
  if v_id is null then
    insert into public.designations(name) values (trim(p_name)) returning id into v_id;
    perform public.org_log('designations', v_id, 'creation_poste', null, jsonb_build_object('nom', trim(p_name)));
  end if;
  return v_id;
end;
$$;

create or replace function public.org_set_employee_post(p_employee uuid, p_post uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.org_require_hr(null);
  if p_post is not null and not exists (select 1 from public.designations where id = p_post) then raise exception 'Poste introuvable'; end if;
  update public.employees set designation_id = p_post where id = p_employee;
  if not found then raise exception 'Salarié introuvable'; end if;
  perform public.org_log('employees', p_employee, 'changement_poste', null, jsonb_build_object('poste', p_post));
end;
$$;

-- ------------------------------------------------------------ équipes : retrait d'un membre
create or replace function public.org_remove_team_member(p_team uuid, p_employee uuid, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.org_require_hr(null);
  delete from public.team_members where team_id = p_team and employee_id = p_employee and start_date > current_date;
  update public.team_members set end_date = current_date
   where team_id = p_team and employee_id = p_employee and (end_date is null or end_date > current_date) and start_date <= current_date;
  perform public.org_log('team_members', p_team, 'retrait_membre', nullif(trim(coalesce(p_note, '')), ''), jsonb_build_object('employe', p_employee));
end;
$$;

-- journalisation : un motif vide est enregistré comme absent (null)
create or replace function public.org_log(p_table text, p_record uuid, p_action text, p_reason text, p_data jsonb)
returns void
language sql
security definer
set search_path = ''
as $$ insert into public.audit_log (table_name, record_id, action, reason, new_data) values (p_table, p_record, p_action, nullif(trim(coalesce(p_reason, '')), ''), p_data) $$;

revoke all on function public.org_unit_no_cycle() from public, anon, authenticated;
revoke all on function public.org_set_manager(uuid, uuid, date, text) from public, anon;
revoke all on function public.org_save_unit(uuid, text, text, uuid, uuid, text) from public, anon;
revoke all on function public.org_delete_unit(uuid) from public, anon;
revoke all on function public.org_set_employee_unit(uuid, uuid, text) from public, anon;
revoke all on function public.org_set_unit_head(uuid, uuid) from public, anon;
revoke all on function public.org_save_post(text) from public, anon;
revoke all on function public.org_set_employee_post(uuid, uuid) from public, anon;
revoke all on function public.org_remove_team_member(uuid, uuid, text) from public, anon;
grant execute on function public.org_set_manager(uuid, uuid, date, text) to authenticated;
grant execute on function public.org_save_unit(uuid, text, text, uuid, uuid, text) to authenticated;
grant execute on function public.org_delete_unit(uuid) to authenticated;
grant execute on function public.org_set_employee_unit(uuid, uuid, text) to authenticated;
grant execute on function public.org_set_unit_head(uuid, uuid) to authenticated;
grant execute on function public.org_save_post(text) to authenticated;
grant execute on function public.org_set_employee_post(uuid, uuid) to authenticated;
grant execute on function public.org_remove_team_member(uuid, uuid, text) to authenticated;
