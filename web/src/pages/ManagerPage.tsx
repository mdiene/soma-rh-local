import { useQuery } from '@tanstack/react-query'
import type { ApiClient } from '../lib/api'
import { date } from '../lib/format'
import { dataApi, unwrap } from '../lib/api'
import { Badge, Empty, ErrorNote, PageHeader, Spinner } from '../components/ui'
import { REQUEST_TYPES, type EmployeeRequest } from '../lib/requests'
import { DelegationPanel, LeaveApprovals } from '../components/LeaveApprovals'
import { TeamCalendar } from '../components/TeamCalendar'

const db = dataApi as unknown as ApiClient
type Assignment = {
  id: string
  employee_id: string
  valid_from: string
  valid_to: string | null
  employee: { employee_number: string; first_name: string; last_name: string } | { employee_number: string; first_name: string; last_name: string }[] | null
}

const today = new Date().toISOString().slice(0, 10)

/** Vue manager en lecture seule : équipe active et demandes de ses collaborateurs. */
export default function ManagerPage() {
  const assignments = useQuery({
    queryKey: ['manager_assignments'],
    queryFn: async () => {
      const rows = unwrap(await db.from('employee_manager_assignments')
        .select('id, employee_id, valid_from, valid_to, employee:employees!employee_manager_assignments_employee_id_fkey(employee_number, first_name, last_name)')
        .lte('valid_from', today)
        .order('valid_from', { ascending: false })) as Assignment[]
      return rows.filter((row) => !row.valid_to || row.valid_to >= today)
    },
  })
  const employeeIds = (assignments.data ?? []).map((assignment) => assignment.employee_id)
  const requests = useQuery({
    queryKey: ['manager_requests', employeeIds],
    enabled: employeeIds.length > 0,
    queryFn: async () => unwrap(await db.from('employee_requests')
      .select('id, employee_id, request_type, status, message, decision_note, created_at, target_date, amount, decided_at')
      .in('employee_id', employeeIds)
      .order('created_at', { ascending: false })
      .limit(100)) as EmployeeRequest[],
  })

  const activeEmployees = (assignments.data ?? []).map((assignment) => ({
    ...assignment,
    employee: Array.isArray(assignment.employee) ? assignment.employee[0] ?? null : assignment.employee,
  }))

  return (
    <>
      <PageHeader title="Mon équipe" description="Suivi des salariés qui vous sont délégués ; validation de leurs congés (avant la RH)." />
      <LeaveApprovals />
      <DelegationPanel />
      <ErrorNote error={assignments.error || requests.error} />
      {assignments.isLoading ? <Spinner /> : activeEmployees.length === 0 ? (
        <Empty title="Aucune équipe active">Le service RH ne vous a pas encore affecté de salarié sur la période courante.</Empty>
      ) : (
        <>
        <TeamCalendar members={activeEmployees.map((a) => ({ id: a.employee_id, name: `${a.employee?.first_name ?? ''} ${a.employee?.last_name ?? ''}`.trim() }))} />
        <section className="panel mb-6">
          <div className="border-b border-line px-4 py-3"><h2 className="text-base">Salariés affectés</h2></div>
          <ul className="divide-y divide-line/70">
            {activeEmployees.map((assignment) => (
              <li key={assignment.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                <span className="font-medium">{assignment.employee?.first_name} {assignment.employee?.last_name}</span>
                <span className="text-ink-muted">{assignment.employee?.employee_number}</span>
                <span className="ml-auto text-xs text-ink-muted">
                  Depuis le {date(assignment.valid_from)}{assignment.valid_to ? ` · jusqu’au ${date(assignment.valid_to)}` : ''}
                </span>
              </li>
            ))}
          </ul>
        </section>
        </>
      )}

      <section className="panel">
        <div className="border-b border-line px-4 py-3"><h2 className="text-base">Demandes de l’équipe</h2></div>
        {requests.isLoading ? <Spinner /> : (requests.data ?? []).length === 0 ? (
          <p className="px-4 py-6 text-sm text-ink-muted">Aucune demande pour votre équipe.</p>
        ) : (
          <ul className="divide-y divide-line/70">
            {requests.data!.map((request) => {
              const employee = activeEmployees.find((item) => item.employee_id === request.employee_id)?.employee
              return (
                <li key={request.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                  <div className="min-w-52">
                    <p className="font-medium">{REQUEST_TYPES[request.request_type] ?? request.request_type}</p>
                    <p className="text-xs text-ink-muted">{employee?.employee_number} · {employee?.first_name} {employee?.last_name} · {date(request.created_at.slice(0, 10))}</p>
                  </div>
                  <p className="flex-1 text-ink-soft">{request.message || 'Sans commentaire'}</p>
                  <Badge value={request.status} />
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </>
  )
}
