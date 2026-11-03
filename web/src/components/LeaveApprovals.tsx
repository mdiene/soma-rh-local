import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, X } from 'lucide-react'
import { useState } from 'react'
import { dataApi, unwrap, type ApiClient } from '../lib/api'
import { useEmployees } from '../lib/queries'
import { date, num } from '../lib/format'
import { Button, Empty, ErrorNote, Section, SelectField, Spinner, TextField } from './ui'

/** Congés que l'utilisateur peut décider maintenant (manager, délégué ou RH) et délégation de ses validations. */

const db = dataApi as unknown as ApiClient
type Pending = {
  leave_id: string; employee_number: string; employee_name: string; leave_type: string; from_date: string; to_date: string
  total_days: number | null; reason: string | null; step: number; level: 'manager' | 'rh'; due_at: string | null; overdue: boolean
}

export function LeaveApprovals() {
  const qc = useQueryClient()
  const list = useQuery({
    queryKey: ['my_leave_approvals'],
    queryFn: async () => unwrap(await db.rpc('my_leave_approvals')) as unknown as Pending[],
  })
  const decide = useMutation({
    mutationFn: async (v: { p: Pending; decision: 'Approuvée' | 'Rejetée'; note?: string }) =>
      unwrap(await db.rpc('decide_leave', { p_leave_id: v.p.leave_id, p_decision: v.decision, p_note: v.note ?? null, p_step: v.p.step })),
    onSuccess: () => {
      for (const k of ['my_leave_approvals', 'leave_applications', 'leave_balances']) qc.invalidateQueries({ queryKey: [k] })
    },
  })
  if (list.isLoading) return <Spinner />
  const rows = list.data ?? []
  if (rows.length === 0 && !list.error) return null
  const reject = (p: Pending) => {
    const note = window.prompt('Motif du rejet (obligatoire)')
    if (note?.trim()) decide.mutate({ p, decision: 'Rejetée', note })
  }
  return (
    <Section title={`Congés à valider (${rows.length})`} className="mb-5">
      <ErrorNote error={list.error ?? decide.error} />
      <ul className="divide-y divide-line">
        {rows.map((p) => (
          <li key={p.leave_id} className="flex flex-wrap items-center justify-between gap-3 py-2.5 text-sm">
            <div>
              <p className="font-medium">{p.employee_number} {p.employee_name}</p>
              <p className="text-xs text-ink-soft">
                {p.leave_type} · du {date(p.from_date)} au {date(p.to_date)}{p.total_days ? ` · ${num(p.total_days, 1)} j` : ''}
                {' '}· niveau {p.level === 'manager' ? 'manager' : 'RH'}
                {p.overdue && <span className="ml-2 font-medium text-signal">délai dépassé</span>}
              </p>
              {p.reason && <p className="text-xs text-ink-muted">{p.reason}</p>}
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="primary" icon={<Check className="h-4 w-4" />} loading={decide.isPending} onClick={() => decide.mutate({ p, decision: 'Approuvée' })}>Approuver</Button>
              <Button size="sm" variant="ghost" icon={<X className="h-4 w-4" />} onClick={() => reject(p)}>Rejeter</Button>
            </div>
          </li>
        ))}
      </ul>
    </Section>
  )
}

type Delegation = { id: string; delegator_user: string; delegate_user: string; valid_from: string; valid_to: string; reason: string | null; active: boolean }

/** Pour un manager : confier ses validations de congé à une autre personne pendant une période. */
export function DelegationPanel() {
  const qc = useQueryClient()
  const employees = useEmployees()
  const people = (employees.data ?? []).filter((e) => e.user_id && e.status === 'Active')
  const today = new Date().toISOString().slice(0, 10)
  const [f, setF] = useState({ user: '', from: today, to: today, reason: '' })
  const list = useQuery({
    queryKey: ['approval_delegations'],
    queryFn: async () => unwrap(await db.from('approval_delegations').select('*').eq('active', true).order('valid_from', { ascending: false })) as unknown as Delegation[],
  })
  const create = useMutation({
    mutationFn: async () => unwrap(await db.rpc('delegate_approvals', { p_delegate_user: f.user, p_from: f.from, p_to: f.to, p_reason: f.reason || null })),
    onSuccess: () => { setF({ ...f, reason: '' }); qc.invalidateQueries({ queryKey: ['approval_delegations'] }) },
  })
  const revoke = useMutation({
    mutationFn: async (id: string) => unwrap(await db.rpc('revoke_delegation', { p_delegation_id: id })),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['approval_delegations'] }),
  })
  const nameOf = (u: string) => { const e = people.find((x) => x.user_id === u); return e ? `${e.first_name} ${e.last_name}` : 'Utilisateur' }
  return (
    <Section title="Déléguer mes validations de congé" className="mb-5">
      <p className="mb-3 text-xs text-ink-muted">Pendant la période choisie, la personne désignée voit et valide les congés de votre équipe à votre place. Chaque décision indique qu’elle a été prise par délégation.</p>
      <form onSubmit={(ev) => { ev.preventDefault(); create.mutate() }} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <SelectField label="Délégué" value={f.user} onChange={(ev) => setF({ ...f, user: ev.target.value })} required>
          <option value="">— choisir —</option>
          {people.map((e) => <option key={e.id} value={e.user_id!}>{e.first_name} {e.last_name}</option>)}
        </SelectField>
        <TextField label="Du" type="date" value={f.from} onChange={(ev) => setF({ ...f, from: ev.target.value })} required />
        <TextField label="Au" type="date" value={f.to} onChange={(ev) => setF({ ...f, to: ev.target.value })} required />
        <TextField label="Motif (facultatif)" value={f.reason} onChange={(ev) => setF({ ...f, reason: ev.target.value })} className="lg:col-span-2" />
        <div className="sm:col-span-2 lg:col-span-5"><Button type="submit" variant="primary" loading={create.isPending}>Déléguer</Button></div>
      </form>
      <div className="mt-3"><ErrorNote error={create.error ?? revoke.error ?? list.error} /></div>
      {(list.data ?? []).length === 0 ? <Empty title="Aucune délégation active" /> : (
        <ul className="mt-3 divide-y divide-line text-sm">
          {list.data!.map((d) => (
            <li key={d.id} className="flex items-center justify-between py-2">
              <span>{nameOf(d.delegate_user)} · du {date(d.valid_from)} au {date(d.valid_to)}{d.reason ? ` · ${d.reason}` : ''}</span>
              <Button size="sm" variant="ghost" onClick={() => revoke.mutate(d.id)}>Retirer</Button>
            </li>
          ))}
        </ul>
      )}
    </Section>
  )
}
