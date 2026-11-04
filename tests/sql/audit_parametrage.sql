-- T-I10 (paramétrage légal) : toute modification de barème, rubrique ou type de congé laisse une trace.
-- Transaction annulée : aucune donnée n'est conservée.
begin;
do $$
declare n0 int; n1 int; b record; manquantes text;
begin
  select * into b from public.tax_slab_brackets order by from_amount limit 1;
  select count(*) into n0 from public.audit_log where table_name = 'tax_slab_brackets';
  update public.tax_slab_brackets set rate = rate + 0.01 where id = b.id;
  select count(*) into n1 from public.audit_log where table_name = 'tax_slab_brackets';
  if n1 <> n0 + 1 then raise exception 'FAIL : modification de barème non auditée (% -> %)', n0, n1; end if;

  select string_agg(c.relname, ', ') into manquantes
  from pg_class c where c.relnamespace = 'public'::regnamespace and c.relname in
    ('tax_slabs','tax_slab_brackets','trimf_brackets','ir_family_reductions','salary_components','salary_structures',
     'salary_structure_components','leave_types','companies','payroll_periods','work_posts','shift_types','document_requirements')
    and not exists (select 1 from pg_trigger t where t.tgrelid = c.oid and t.tgfoid = 'public.business_audit'::regproc);
  if manquantes is not null then raise exception 'FAIL : pas d''audit sur %', manquantes; end if;
  raise notice 'OK audit_parametrage';
end $$;
rollback;
