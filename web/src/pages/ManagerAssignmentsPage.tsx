import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ApiClient } from '../lib/api'
import { UserPlus, X } from 'lucide-react'
import { useState } from 'react'
import { Button, ErrorNote, PageHeader, SelectField, Spinner, TextField } from '../components/ui'
import { date } from '../lib/format'
import { dataApi, unwrap } from '../lib/api'

const db = dataApi as unknown as ApiClient
type Employee = { id: string; employee_number: string; first_name: string; last_name: string; status: string; user_id: string | null }
type Assignment = {
  id: string
  manager_employee_id: string
  employee_id: string
  valid_from: string
  valid_to: string | null
  manager: Employee | Employee[] | null
  employee: Employee | Employee[] | null
}
const today = new Date().toISOString().slice(0, 10)
const yesterday = new Date(Date.now() - 864e5).toISOString().slice(0, 10)
// état d'une affectation : à venir, actif, ou désaffecté (clôturé / échu)
const stateOf = (a: { valid_from: string; valid_to: string | null }) => (a.valid_from > today ? 'upcoming' : !a.valid_to || a.valid_to >= today ? 'active' : 'ended')
const STATE = {
  upcoming: { label: 'À venir', cls: 'bg-amber-100 text-amber-800' },
  active: { label: 'Actif', cls: 'bg-emerald-100 text-emerald-800' },
  ended: { label: 'Désaffecté', cls: 'bg-slate-200 text-slate-700' },
} as const
const name = (employee: Employee | Employee[] | null) => {
  const e = Array.isArray(employee) ? employee[0] : employee
  return e ? `${e.first_name} ${e.last_name} (${e.employee_number})` : '—'
}

/** Administration RH des managers, équipes et périodes de délégation. */
export default function ManagerAssignmentsPage() {
  const qc = useQueryClient()
  const [managerId, setManagerId] = useState('')
  const [employeeId, setEmployeeId] = useState('')
  const [validFrom, setValidFrom] = useState(today)
  const [validTo, setValidTo] = useState('')

  const employees = useQuery({
    queryKey: ['manager_assignment_employees'],
    queryFn: async () => unwrap(await db.from('employees')
      .select('id, employee_number, first_name, last_name, status, user_id')
      .eq('status', 'Active').order('employee_number')) as Employee[],
  })
  const assignments = useQuery({
    queryKey: ['manager_assignments_admin'],
    queryFn: async () => unwrap(await db.from('employee_manager_assignments')
      .select('id, manager_employee_id, employee_id, valid_from, valid_to, manager:employees!employee_manager_assignments_manager_employee_id_fkey(id, employee_number, first_name, last_name, status, user_id), employee:employees!employee_manager_assignments_employee_id_fkey(id, employee_number, first_name, last_name, status, user_id)')
      .order('valid_from', { ascending: false }).limit(300)) as Assignment[],
  })
  const assign = useMutation({
    mutationFn: async () => unwrap(await dataApi.rpc('assign_manager_employee' as never, {
      p_manager_employee_id: managerId,
      p_employee_id: employeeId,
      p_valid_from: validFrom,
      p_valid_to: validTo || null,
    } as never)),
    onSuccess: () => {
      setEmployeeId('')
      qc.invalidateQueries({ queryKey: ['manager_assignments_admin'] })
      qc.invalidateQueries({ queryKey: ['org_chart'] })
      qc.invalidateQueries({ queryKey: ['manager_assignment_employees'] })
    },
  })
  const close = useMutation({
    mutationFn: async ({ id, end }: { id: string; end: string }) => unwrap(await dataApi.rpc('close_manager_assignment' as never, { p_assignment_id: id, p_valid_to: end } as never)),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['manager_assignments_admin'] }); void qc.invalidateQueries({ queryKey: ['org_chart'] }) },
  })
  const activeEmployees = employees.data ?? []
  const managers = activeEmployees // un manager n'a pas besoin d'un compte utilisateur
  const canSubmit = !!managerId && !!employeeId && !!validFrom && managerId !== employeeId && (!validTo || validTo >= validFrom)

  return (
    <>
      <PageHeader title="Équipes et managers" description="Le service RH affecte ici les salariés à un manager. Chaque affectation est datée et auditée." />
      <section className="panel mb-6">
        <div className="flex items-center gap-2 border-b border-line px-4 py-3"><UserPlus className="h-4 w-4 text-river" /><h2 className="text-base">Nouvelle affectation</h2></div>
        <div className="grid gap-4 p-4 md:grid-cols-2 lg:grid-cols-4">
          <SelectField label="Manager" value={managerId} onChange={(e) => setManagerId(e.target.value)}>
            <option value="">Sélectionner un manager</option>
            {managers.map((employee) => <option key={employee.id} value={employee.id}>{name(employee)}</option>)}
          </SelectField>
          <SelectField label="Salarié à affecter" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
            <option value="">Sélectionner un salarié</option>
            {activeEmployees.filter((employee) => employee.id !== managerId).map((employee) => <option key={employee.id} value={employee.id}>{name(employee)}</option>)}
          </SelectField>
          <TextField label="Début" type="date" value={validFrom} onChange={(e) => setValidFrom(e.target.value)} />
          <TextField label="Fin (facultative)" type="date" value={validTo} min={validFrom} onChange={(e) => setValidTo(e.target.value)} />
        </div>
        <div className="flex justify-end px-4 pb-4">
          <Button variant="primary" loading={assign.isPending} disabled={!canSubmit} onClick={() => assign.mutate()}>Affecter à l’équipe</Button>
        </div>
        <div className="px-4 pb-4"><ErrorNote error={assign.error} /></div>
      </section>

      <section className="panel">
        <div className="border-b border-line px-4 py-3"><h2 className="text-base">Affectations enregistrées</h2></div>
        {assignments.isLoading ? <Spinner /> : assignments.error ? <div className="p-4"><ErrorNote error={assignments.error} /></div> : (
          <ul className="divide-y divide-line/70">
            {(assignments.data ?? []).map((assignment) => {
              const state = stateOf(assignment)
              return <li key={assignment.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                <div className="min-w-52"><p className="font-medium">{name(assignment.employee)}</p><p className="text-xs text-ink-muted">Manager : {name(assignment.manager)}</p></div>
                <span className="text-xs text-ink-soft">{date(assignment.valid_from)} → {assignment.valid_to ? date(assignment.valid_to) : 'indéfinie'}</span>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATE[state].cls}`}>{STATE[state].label}</span>
                {state !== 'ended' && <Button size="sm" variant="ghost" icon={<X className="h-3.5 w-3.5" />} onClick={() => close.mutate({ id: assignment.id, end: yesterday })}>Clôturer (désaffecter)</Button>}
              </li>
            })}
            {!assignments.data?.length && <li className="px-4 py-6 text-sm text-ink-muted">Aucune affectation enregistrée.</li>}
          </ul>
        )}
        <div className="p-4"><ErrorNote error={close.error} /></div>
      </section>
    </>
  )
}
