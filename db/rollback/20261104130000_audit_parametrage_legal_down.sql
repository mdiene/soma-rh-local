do $$
declare t text;
begin
  foreach t in array array[
    'tax_slabs', 'tax_slab_brackets', 'trimf_brackets', 'ir_family_reductions',
    'salary_components', 'salary_structures', 'salary_structure_components',
    'leave_types', 'companies', 'payroll_periods', 'work_posts', 'shift_types', 'document_requirements'
  ] loop
    execute format('drop trigger if exists %I on public.%I', t || '_audit', t);
  end loop;
end $$;
