-- Décision du 30/10/2026 : le rôle « rh » peut préparer et calculer la paie lui-même
-- (variables, présences → paie, calcul des bulletins, suppression d'un traitement non validé).
-- Restent réservés à « paie » : taux, barèmes, rubriques, structures salariales, suivi des paiements.
-- Restent réservés à « admin » : validation, clôture, réouverture, annulation, suppression d'un traitement validé.

do $$
declare
  t text; pol record; q text; w text; ddl text;
  fn text; def text; newdef text;
begin
  -- 1) Politiques RLS : tables de calcul de la paie
  for pol in
    select tablename, policyname, cmd, qual, with_check
    from pg_policies
    where schemaname = 'public'
      and tablename in ('payroll_entries','payroll_inputs','additional_salaries','salary_slips','salary_slip_details')
      and cmd in ('INSERT','UPDATE','DELETE')
  loop
    q := replace(pol.qual, 'ARRAY[''paie''::text]', 'ARRAY[''paie''::text, ''rh''::text]');
    w := replace(pol.with_check, 'ARRAY[''paie''::text]', 'ARRAY[''paie''::text, ''rh''::text]');
    ddl := format('alter policy %I on public.%I', pol.policyname, pol.tablename);
    if pol.qual is not null then ddl := ddl || ' using (' || q || ')'; end if;
    if pol.with_check is not null then ddl := ddl || ' with check (' || w || ')'; end if;
    execute ddl;
  end loop;

  -- 2) Fonctions de calcul
  foreach fn in array array['calculate_salary_slip','run_payroll_entry','sync_attendance_to_payroll_inputs','delete_payroll_entry'] loop
    select pg_get_functiondef(p.oid) into def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = fn;
    if position('has_role(array[''paie''])' in def) = 0 then
      raise exception 'Contrôle de rôle introuvable dans %', fn;
    end if;
    newdef := replace(def, 'has_role(array[''paie''])', 'has_role(array[''paie'',''rh''])');
    execute newdef;
  end loop;
end $$;
