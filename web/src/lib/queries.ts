import { useQuery } from '@tanstack/react-query'
import { dataApi, unwrap } from './api'

/** Requêtes de référence partagées entre les écrans. */

export function useCompany() {
  return useQuery({
    queryKey: ['company'],
    queryFn: async () => unwrap(await dataApi.from('companies').select('*').order('created_at').limit(1).single()),
  })
}

export function useEmployees() {
  return useQuery({
    queryKey: ['employees'],
    queryFn: async () =>
      unwrap(await dataApi
        .from('employees')
        .select('*, designation:designations(name), grade:employee_grades(code, staff_status, base_salary, hourly_rate)')
        .order('employee_number')),
  })
}

export function useDesignations() {
  return useQuery({
    queryKey: ['designations'],
    queryFn: async () => unwrap(await dataApi.from('designations').select('*').order('name')),
  })
}

export function useAgreements() {
  return useQuery({
    queryKey: ['agreements'],
    queryFn: async () => unwrap(await dataApi.from('collective_agreements').select('*').order('name')),
  })
}

export function useGrades(agreement?: string | null) {
  return useQuery({
    queryKey: ['grades', agreement],
    enabled: !!agreement,
    queryFn: async () =>
      unwrap(await dataApi.from('employee_grades').select('*').eq('agreement_code', agreement!).order('base_salary')),
  })
}

export function useComponents() {
  return useQuery({
    queryKey: ['salary_components'],
    queryFn: async () => unwrap(await dataApi.from('salary_components').select('*').order('rubric_number')),
  })
}

export function useLeaveTypes() {
  return useQuery({
    queryKey: ['leave_types'],
    queryFn: async () => unwrap(await dataApi.from('leave_types').select('*').order('name')),
  })
}

/** Types de contrat (référentiel administrable, lot 7). */
export function useContractTypes() {
  return useQuery({
    queryKey: ['contract_types'],
    queryFn: async () => unwrap(await dataApi.from('contract_types').select('*').order('sort_order')),
  })
}

/** Modes de paiement (référentiel administrable, lot 7). */
export function usePaymentModes() {
  return useQuery({
    queryKey: ['payment_modes'],
    queryFn: async () => unwrap(await dataApi.from('payment_modes').select('*').order('sort_order')),
  })
}

/** Valeurs proposées à la saisie : actives, plus la valeur actuelle si elle a été désactivée. */
export function selectable<T extends { is_active: boolean }>(rows: T[] | undefined, isCurrent: (r: T) => boolean): T[] {
  return (rows ?? []).filter((r) => r.is_active || isCurrent(r))
}

export function usePayrollEntries() {
  return useQuery({
    queryKey: ['payroll_entries'],
    queryFn: async () => unwrap(await dataApi.from('payroll_entries').select('*').order('period_start', { ascending: false })),
  })
}

export function employeeName(e: { first_name: string; last_name: string } | null | undefined): string {
  return e ? `${e.first_name} ${e.last_name}` : ''
}
