import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createColumnHelper } from '@tanstack/react-table'
import { Check, Plus, X } from 'lucide-react'
import { useState } from 'react'
import clsx from 'clsx'
import { dataApi, unwrap, type Views } from '../lib/api'
import { LeaveDetailModal, type LeaveApp } from '../components/LeaveDetailModal'
import { useAuth } from '../lib/auth'
import { useEmployees, useLeaveTypes } from '../lib/queries'
import { date, num } from '../lib/format'
import { DataTable } from '../components/DataTable'
import { Badge, Button, ErrorNote, Modal, PageHeader, SelectField, Spinner, TextField } from '../components/ui'

type App = LeaveApp
const col = createColumnHelper<App>()
const bcol = createColumnHelper<Views<'v_leave_balances'>>()

export default function LeavesPage() {
  const [tab, setTab] = useState<'demandes' | 'soldes'>('demandes')
  const [open, setOpen] = useState<null | 'request' | 'alloc'>(null)
  const { can, session } = useAuth()
  const qc = useQueryClient()
  const isHr = can('rh')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const apps = useQuery({
    queryKey: ['leave_applications'],
    queryFn: async () => unwrap(await dataApi.from('leave_applications')
      .select('*, employee:employees(employee_number, first_name, last_name, designation:designations(name)), type:leave_types(name)')
      .order('from_date', { ascending: false })) as App[],
  })
  const balances = useQuery({
    queryKey: ['leave_balances'],
    enabled: tab === 'soldes',
    queryFn: async () => unwrap(await dataApi.from('v_leave_balances').select('*').order('employee_number')),
  })

  const decide = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: 'Approuvée' | 'Rejetée' }) =>
      unwrap(await dataApi.from('leave_applications').update({ status, approver_id: session!.user.id, approved_at: new Date().toISOString() }).eq('id', id).select()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['leave_applications'] }); qc.invalidateQueries({ queryKey: ['leave_balances'] }) },
  })

  const columns = [
    col.accessor((a) => a.employee ? `${a.employee.first_name} ${a.employee.last_name}` : '', { id: 'emp', header: 'Salarié', cell: (c) => <span className="font-medium">{c.getValue()}</span> }),
    col.accessor((a) => a.type?.name ?? a.leave_type, { id: 'type', header: 'Type' }),
    col.accessor('from_date', { header: 'Du', cell: (c) => date(c.getValue()) }),
    col.accessor('to_date', { header: 'Au', cell: (c) => date(c.getValue()) }),
    col.accessor('total_days', { header: 'Jours', meta: { align: 'right' }, cell: (c) => num(c.getValue(), 1) }),
    col.accessor('reason', { header: 'Motif', cell: (c) => <span className="text-ink-soft">{c.getValue()}</span> }),
    col.accessor('status', { header: 'État', cell: (c) => <Badge value={c.getValue()} /> }),
    col.display({
      id: 'actions', header: '',
      cell: ({ row }) => isHr && row.original.status === 'Ouverte' && (
        <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
          <Button size="sm" icon={<Check className="h-3.5 w-3.5" />} onClick={() => decide.mutate({ id: row.original.id, status: 'Approuvée' })}>Approuver</Button>
          <Button size="sm" variant="ghost" icon={<X className="h-3.5 w-3.5" />} onClick={() => decide.mutate({ id: row.original.id, status: 'Rejetée' })}>Rejeter</Button>
        </div>
      ),
    }),
  ]
  const bcolumns = [
    bcol.accessor('employee_number', { header: 'Matricule' }),
    bcol.accessor((b) => `${b.first_name} ${b.last_name}`, { id: 'name', header: 'Salarié' }),
    bcol.accessor('leave_type_name', { header: 'Type' }),
    bcol.accessor('allocated', { header: 'Acquis', meta: { align: 'right' }, cell: (c) => num(c.getValue(), 1) }),
    bcol.accessor('taken', { header: 'Pris', meta: { align: 'right' }, cell: (c) => num(c.getValue(), 1) }),
    bcol.accessor('balance', { header: 'Solde', meta: { align: 'right' }, cell: (c) => <strong>{num(c.getValue(), 1)}</strong> }),
  ]

  return (
    <>
      <PageHeader
        title="Congés"
        description="Demandes, validations et soldes de congés. Les absences non payées et la maladie alimentent les variables de paie via les présences."
        actions={<>
          {isHr && <Button onClick={() => setOpen('alloc')}>Attribuer des jours</Button>}
          <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setOpen('request')}>Nouvelle demande</Button>
        </>}
      />
      <div className="no-print mb-4 flex gap-1 border-b border-line" role="tablist">
        {(['demandes', 'soldes'] as const).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
            className={clsx('-mb-px border-b-2 px-3 py-2 text-sm', tab === t ? 'border-river font-medium text-ink' : 'border-transparent text-ink-soft hover:text-ink')}>
            {t === 'demandes' ? 'Demandes' : 'Soldes'}
          </button>
        ))}
      </div>
      <ErrorNote error={apps.error || decide.error || balances.error} />
      {tab === 'demandes' ? (apps.isLoading ? <Spinner /> : <DataTable data={apps.data ?? []} columns={columns} exportName="conges" onRowClick={(a) => setSelectedId(a.id)} />)
        : (balances.isLoading ? <Spinner /> : <DataTable data={balances.data ?? []} columns={bcolumns} exportName="soldes-conges" />)}
      <LeaveDetailModal app={(apps.data ?? []).find((a) => a.id === selectedId) ?? null} onClose={() => setSelectedId(null)} />
      <RequestModal open={open === 'request'} onClose={() => setOpen(null)} />
      <AllocationModal open={open === 'alloc'} onClose={() => setOpen(null)} />
    </>
  )
}

function RequestModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { can } = useAuth()
  const qc = useQueryClient()
  const employees = useEmployees()
  const types = useLeaveTypes()
  const me = useQuery({ queryKey: ['my_employee_id'], queryFn: async () => unwrap(await dataApi.rpc('my_employee_id')) })
  const [f, setF] = useState({ employee_id: '', leave_type: 'CONGE_ANNUEL', from_date: '', to_date: '', reason: '' })
  const save = useMutation({
    mutationFn: async () => unwrap(await dataApi.from('leave_applications').insert({ ...f, employee_id: f.employee_id || (me.data as string) }).select()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['leave_applications'] }); onClose() },
  })
  return (
    <Modal open={open} onClose={onClose} title="Nouvelle demande de congé"
      footer={<><Button variant="ghost" onClick={onClose}>Annuler</Button><Button variant="primary" loading={save.isPending} onClick={() => save.mutate()} disabled={!f.from_date || !f.to_date}>Envoyer la demande</Button></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        {can('rh') && (
          <SelectField label="Salarié" className="sm:col-span-2" value={f.employee_id} onChange={(e) => setF({ ...f, employee_id: e.target.value })}>
            <option value="">Choisir…</option>
            {(employees.data ?? []).filter((e) => e.status === 'Active').map((e) => <option key={e.id} value={e.id}>{e.employee_number} — {e.first_name} {e.last_name}</option>)}
          </SelectField>
        )}
        <SelectField label="Type de congé" className="sm:col-span-2" value={f.leave_type} onChange={(e) => setF({ ...f, leave_type: e.target.value })}>
          {(types.data ?? []).map((t) => <option key={t.code} value={t.code}>{t.name}</option>)}
        </SelectField>
        <TextField label="Du" type="date" value={f.from_date} onChange={(e) => setF({ ...f, from_date: e.target.value })} />
        <TextField label="Au (inclus)" type="date" value={f.to_date} onChange={(e) => setF({ ...f, to_date: e.target.value })} />
        <TextField label="Motif" className="sm:col-span-2" value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} />
      </div>
      <div className="mt-3"><ErrorNote error={save.error} /></div>
    </Modal>
  )
}

function AllocationModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient()
  const employees = useEmployees()
  const types = useLeaveTypes()
  const year = new Date().getFullYear()
  const [f, setF] = useState({ employee_id: 'ALL', leave_type: 'CONGE_ANNUEL', from_date: `${year}-01-01`, to_date: `${year}-12-31`, days: 24 })
  const save = useMutation({
    mutationFn: async () => {
      const targets = f.employee_id === 'ALL' ? (employees.data ?? []).filter((e) => e.status === 'Active').map((e) => e.id) : [f.employee_id]
      return unwrap(await dataApi.from('leave_allocations').insert(targets.map((id) => ({ employee_id: id, leave_type: f.leave_type, from_date: f.from_date, to_date: f.to_date, days: f.days }))).select())
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['leave_balances'] }); onClose() },
  })
  return (
    <Modal open={open} onClose={onClose} title="Attribuer des jours de congé"
      footer={<><Button variant="ghost" onClick={onClose}>Annuler</Button><Button variant="primary" loading={save.isPending} onClick={() => save.mutate()}>Attribuer</Button></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <SelectField label="Salarié" className="sm:col-span-2" value={f.employee_id} onChange={(e) => setF({ ...f, employee_id: e.target.value })}>
          <option value="ALL">Tous les salariés actifs</option>
          {(employees.data ?? []).map((e) => <option key={e.id} value={e.id}>{e.employee_number} — {e.first_name} {e.last_name}</option>)}
        </SelectField>
        <SelectField label="Type" value={f.leave_type} onChange={(e) => setF({ ...f, leave_type: e.target.value })}>
          {(types.data ?? []).map((t) => <option key={t.code} value={t.code}>{t.name}</option>)}
        </SelectField>
        <TextField label="Nombre de jours" type="number" step="0.5" value={f.days} onChange={(e) => setF({ ...f, days: Number(e.target.value) })} hint="24 jours ouvrables par an (2 jours par mois)" />
        <TextField label="Valable du" type="date" value={f.from_date} onChange={(e) => setF({ ...f, from_date: e.target.value })} />
        <TextField label="Au" type="date" value={f.to_date} onChange={(e) => setF({ ...f, to_date: e.target.value })} />
      </div>
      <div className="mt-3"><ErrorNote error={save.error} /></div>
    </Modal>
  )
}
