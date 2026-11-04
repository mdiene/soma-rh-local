-- =============================================================================
-- Audit des tables de paramétrage légal et de référence (constat QA D-001, invariant I10).
-- Avant : barèmes IR et TRIMF, familles, rubriques, structures, types de congé, société,
-- périodes de paie, postes et types de poste se modifiaient sans trace dans audit_log.
-- On branche le déclencheur générique business_audit() déjà utilisé par payroll_settings.
-- Retour : db/rollback/20261104130000_audit_parametrage_legal_down.sql
-- =============================================================================
do $$
declare t text;
begin
  foreach t in array array[
    'tax_slabs', 'tax_slab_brackets', 'trimf_brackets', 'ir_family_reductions',
    'salary_components', 'salary_structures', 'salary_structure_components',
    'leave_types', 'companies', 'payroll_periods', 'work_posts', 'shift_types', 'document_requirements'
  ] loop
    execute format('drop trigger if exists %I on public.%I', t || '_audit', t);
    execute format('create trigger %I after insert or update or delete on public.%I
                    for each row execute function public.business_audit()', t || '_audit', t);
  end loop;
end $$;

notify pgrst, 'reload schema';
