-- Organigramme : plus de libellé « Poste non renseigné » ; un salarié sans poste a un poste vide (l'interface n'affiche rien).
-- Retour : rejouer 20261104100000_organigramme_structure.sql (create or replace org_chart).
CREATE OR REPLACE FUNCTION public.org_chart(p_on date DEFAULT CURRENT_DATE)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
      'poste', coalesce(d.name, ''), 'poste_id', e.designation_id, 'departement', dep.name, 'unite', e.department_id,
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
$function$

;
