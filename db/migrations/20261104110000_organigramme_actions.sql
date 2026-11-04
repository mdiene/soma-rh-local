-- =============================================================================
-- Organigramme : actions directes (rattachement à une direction avec notification), motif entièrement facultatif,
-- managers sans compte dans « Équipes et managers », clôture d'affectation effective dès aujourd'hui.
-- Retour : db/rollback/20261104110000_organigramme_actions_down.sql
-- =============================================================================

-- ------------------------------------------------------------ manager direct : motif facultatif + notification du salarié
create or replace function public.org_set_manager(p_employee uuid, p_manager uuid, p_from date, p_reason text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_id uuid; v_user uuid; v_has boolean; v_emp_user uuid; v_mgr_name text;
begin
  perform public.org_require_hr(p_reason);
  if p_from is null then raise exception 'La date d''effet est obligatoire'; end if;
  select user_id into v_emp_user from public.employees where id = p_employee;
  if not found then raise exception 'Salarié introuvable'; end if;
  select exists (select 1 from public.employee_manager_assignments
                  where employee_id = p_employee and valid_from <= p_from and (valid_to is null or valid_to >= p_from)) into v_has;
  if p_manager is null and not v_has then raise exception 'Ce salarié n''a pas de manager direct à détacher'; end if;
  -- correction le jour même : un rattachement qui commence à la date d'effet est remplacé (sinon « détacher » échouerait)
  delete from public.employee_manager_assignments where employee_id = p_employee and valid_from = p_from;
  if exists (select 1 from public.employee_manager_assignments where employee_id = p_employee and valid_from > p_from) then
    raise exception 'Un rattachement commence déjà à partir de cette date : choisissez une date postérieure';
  end if;
  update public.employee_manager_assignments set valid_to = p_from - 1
   where employee_id = p_employee and valid_from < p_from and (valid_to is null or valid_to >= p_from);
  if p_manager is not null then
    insert into public.employee_manager_assignments(manager_employee_id, employee_id, valid_from, valid_to, delegated_by)
    values (p_manager, p_employee, p_from, null, (select auth.uid())) returning id into v_id;
    select user_id, first_name || ' ' || last_name into v_user, v_mgr_name from public.employees where id = p_manager;
    if v_user is not null then insert into public.user_roles(user_id, role) values (v_user, 'manager') on conflict (user_id, role) do nothing; end if;
  end if;
  perform public.org_log('employee_manager_assignments', coalesce(v_id, p_employee), case when p_manager is null then 'detachement_manager' else 'changement_manager' end,
          nullif(trim(coalesce(p_reason, '')), ''), jsonb_build_object('employe', p_employee, 'manager', p_manager, 'effet', p_from));
  if v_emp_user is not null then
    perform public.notify_user(v_emp_user, 'Changement de manager',
      case when p_manager is null then 'Vous n''avez plus de manager direct à partir du ' || to_char(p_from, 'DD/MM/YYYY') || '.'
           else 'Votre manager direct est ' || v_mgr_name || ' à partir du ' || to_char(p_from, 'DD/MM/YYYY') || '.' end,
      'org-mgr:' || p_employee || ':' || p_from || ':' || coalesce(p_manager::text, 'none'));
  end if;
  return v_id;
end;
$$;

-- ------------------------------------------------------------ rattacher à une direction (et, si demandé, à son responsable)
create or replace function public.org_attach_to_unit(p_employee uuid, p_unit uuid, p_link_head boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  e public.employees; u public.departments;
  v_prev_unit text; v_prev_mgr uuid; v_prev_mgr_name text; v_new_mgr uuid; v_new_mgr_name text; v_msg text;
begin
  perform public.org_require_hr(null);
  select * into e from public.employees where id = p_employee;
  if not found then raise exception 'Salarié introuvable'; end if;
  select * into u from public.departments where id = p_unit;
  if not found then raise exception 'Unité introuvable'; end if;
  select name into v_prev_unit from public.departments where id = e.department_id;
  select a.manager_employee_id, m.first_name || ' ' || m.last_name into v_prev_mgr, v_prev_mgr_name
    from public.employee_manager_assignments a join public.employees m on m.id = a.manager_employee_id
   where a.employee_id = p_employee and current_date between a.valid_from and coalesce(a.valid_to, date 'infinity') limit 1;

  update public.employees set department_id = p_unit where id = p_employee;

  -- le salarié suit son manager direct : on le rattache aussi au responsable de la direction si on le demande
  if p_link_head and u.head_employee_id is not null and u.head_employee_id <> p_employee and u.head_employee_id is distinct from v_prev_mgr then
    perform public.org_set_manager(p_employee, u.head_employee_id, current_date, 'Rattachement à ' || u.name);
    v_new_mgr := u.head_employee_id;
    select first_name || ' ' || last_name into v_new_mgr_name from public.employees where id = v_new_mgr;
  end if;

  v_msg := e.first_name || ' ' || e.last_name || ' est rattaché(e) à « ' || u.name || ' »'
        || case when v_prev_unit is not null and v_prev_unit <> u.name then ' (auparavant : ' || v_prev_unit || ')' else '' end
        || case when v_new_mgr is not null then ' ; son manager direct passe de ' || coalesce(v_prev_mgr_name, 'aucun') || ' à ' || v_new_mgr_name
                when v_prev_mgr is not null then ' ; son manager direct reste ' || v_prev_mgr_name else '' end || '.';
  if e.user_id is not null then
    perform public.notify_user(e.user_id, 'Changement de rattachement', v_msg, 'org-unit:' || p_employee || ':' || p_unit || ':' || current_date);
  end if;
  perform public.org_log('employees', p_employee, 'rattachement_unite', null,
          jsonb_build_object('unite', p_unit, 'unite_precedente', v_prev_unit, 'manager_precedent', v_prev_mgr, 'nouveau_manager', v_new_mgr));
  return jsonb_build_object('message', v_msg, 'unite_precedente', v_prev_unit, 'manager_precedent', v_prev_mgr_name,
                            'nouveau_manager', v_new_mgr_name, 'notifie', e.user_id is not null);
end;
$$;

-- ------------------------------------------------------------ « Équipes et managers » : managers sans compte, clôture effective
create or replace function public.assign_manager_employee(p_manager_employee_id uuid, p_employee_id uuid, p_valid_from date, p_valid_to date default null)
returns public.employee_manager_assignments
language plpgsql
security definer
set search_path = ''
as $$
declare v_assignment public.employee_manager_assignments; v_manager_user_id uuid;
begin
  if not public.has_role(array['rh']) then raise exception 'Réservé au service RH'; end if;
  if p_manager_employee_id = p_employee_id then raise exception 'Un salarié ne peut pas être son propre manager'; end if;
  if p_valid_to is not null and p_valid_to < p_valid_from then raise exception 'La date de fin doit être postérieure à la date de début'; end if;
  select user_id into v_manager_user_id from public.employees where id = p_manager_employee_id and status = 'Active';
  if not found then raise exception 'Le manager doit être un salarié actif'; end if;
  -- un manager n'a pas besoin d'un compte : le rôle applicatif n'est accordé que s'il en a un
  if v_manager_user_id is not null then
    insert into public.user_roles(user_id, role) values (v_manager_user_id, 'manager') on conflict (user_id, role) do nothing;
  end if;
  insert into public.employee_manager_assignments(manager_employee_id, employee_id, valid_from, valid_to, delegated_by)
  values (p_manager_employee_id, p_employee_id, p_valid_from, p_valid_to, (select auth.uid()))
  returning * into v_assignment;
  return v_assignment;
exception
  when exclusion_violation then raise exception 'Une délégation existe déjà sur cette période';
end;
$$;

-- clôturer = désaffecter dès aujourd'hui : la fin est la veille ; une affectation qui n'avait pas encore pris effet est supprimée
create or replace function public.close_manager_assignment(p_assignment_id uuid, p_valid_to date)
returns public.employee_manager_assignments
language plpgsql
security definer
set search_path = ''
as $$
declare v public.employee_manager_assignments;
begin
  if not public.has_role(array['rh']) then raise exception 'Réservé au service RH'; end if;
  select * into v from public.employee_manager_assignments where id = p_assignment_id;
  if not found then raise exception 'Affectation introuvable'; end if;
  if p_valid_to < v.valid_from then
    delete from public.employee_manager_assignments where id = p_assignment_id;
    v.valid_to := p_valid_to;
    return v;
  end if;
  update public.employee_manager_assignments set valid_to = p_valid_to where id = p_assignment_id returning * into v;
  return v;
end;
$$;

revoke all on function public.org_attach_to_unit(uuid, uuid, boolean) from public, anon;
revoke all on function public.org_set_manager(uuid, uuid, date, text) from public, anon;
revoke all on function public.assign_manager_employee(uuid, uuid, date, date) from public, anon;
revoke all on function public.close_manager_assignment(uuid, date) from public, anon;
grant execute on function public.org_attach_to_unit(uuid, uuid, boolean) to authenticated;
grant execute on function public.org_set_manager(uuid, uuid, date, text) to authenticated;
grant execute on function public.assign_manager_employee(uuid, uuid, date, date) to authenticated;
grant execute on function public.close_manager_assignment(uuid, date) to authenticated;
