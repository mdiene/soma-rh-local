import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import clsx from 'clsx'
import { dataApi, unwrap, type ApiClient } from '../lib/api'
import { useComponents, useEmployees } from '../lib/queries'
import { currentPeriod, date, fcfa, monthLabel } from '../lib/format'
import { Button, Empty, ErrorNote, PageHeader, SelectField, Section, Spinner, TextField } from '../components/ui'

/** Prêts, régularisations après clôture et éléments récurrents : tout converge vers le salaire additionnel (L2). */

// tables et vues récentes : absentes des types générés
const db = dataApi as unknown as ApiClient
type Tab = 'prets' | 'regul' | 'recur'
const TABS: { key: Tab; label: string }[] = [
  { key: 'prets', label: 'Prêts' },
  { key: 'regul', label: 'Régularisations' },
  { key: 'recur', label: 'Éléments récurrents' },
]
const toFirstDay = (month: string) => (month ? `${month}-01` : '')
const thisMonth = () => currentPeriod().slice(0, 7)

export default function PayrollAdjustmentsPage() {
  const [tab, setTab] = useState<Tab>('prets')
  const employees = useEmployees()
  const active = (employees.data ?? []).filter((e) => e.status === 'Active')
  const names = new Map((employees.data ?? []).map((e) => [e.id, `${e.employee_number} ${e.last_name} ${e.first_name}`]))
  return (
    <>
      <PageHeader title="Prêts et régularisations"
        description="Les retenues de prêt, les régularisations d'un mois validé et les primes récurrentes sont déposées automatiquement dans le calcul de la paie du mois ouvert." />
      <div className="mb-4 flex gap-1 border-b border-line" role="tablist">
        {TABS.map((t) => (
          <button key={t.key} role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)}
            className={clsx('px-3 py-2 text-sm', tab === t.key ? 'border-b-2 border-river font-medium text-river' : 'text-ink-soft hover:text-ink')}>
            {t.label}
          </button>
        ))}
      </div>
      {employees.isLoading ? <Spinner /> : tab === 'prets' ? <Loans active={active} names={names} />
        : tab === 'regul' ? <Corrections active={active} names={names} /> : <Recurring active={active} names={names} />}
    </>
  )
}

type Props = { active: { id: string; employee_number: string; last_name: string; first_name: string }[]; names: Map<string, string> }
const label = (e: Props['active'][number]) => `${e.employee_number} ${e.last_name} ${e.first_name}`

function EmployeeSelect({ active, value, onChange }: Pick<Props, 'active'> & { value: string; onChange: (v: string) => void }) {
  return (
    <SelectField label="Salarié" value={value} onChange={(ev) => onChange(ev.target.value)} required>
      <option value="">— choisir —</option>
      {active.map((e) => <option key={e.id} value={e.id}>{label(e)}</option>)}
    </SelectField>
  )
}

function Loans({ active, names }: Props) {
  const qc = useQueryClient()
  const [f, setF] = useState({ employee: '', label: '', principal: '', count: '6', first: thisMonth() })
  const loans = useQuery({
    queryKey: ['loan_balances'],
    queryFn: async () => unwrap(await db.from('loan_balances').select('*').order('status')) as unknown as
      { loan_id: string; employee_id: string; label: string; principal: number; status: string; retenu: number; restant: number; prochaine_echeance: string | null }[],
  })
  const create = useMutation({
    mutationFn: async () => unwrap(await db.rpc('create_loan', {
      p_employee_id: f.employee, p_label: f.label, p_principal: Number(f.principal),
      p_installments: Number(f.count), p_first_period: toFirstDay(f.first),
    })),
    onSuccess: () => { setF({ ...f, label: '', principal: '' }); qc.invalidateQueries({ queryKey: ['loan_balances'] }) },
  })
  const cancel = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => unwrap(await db.rpc('cancel_loan', { p_loan_id: id, p_reason: reason })),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['loan_balances'] }),
  })
  const submit = (ev: FormEvent) => { ev.preventDefault(); create.mutate() }
  return (
    <div className="space-y-5">
      <Section title="Accorder un prêt ou une avance">
        <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <EmployeeSelect active={active} value={f.employee} onChange={(employee) => setF({ ...f, employee })} />
          <TextField label="Libellé" value={f.label} onChange={(ev) => setF({ ...f, label: ev.target.value })} required />
          <TextField label="Montant (F)" type="number" min={1} step={1} value={f.principal} onChange={(ev) => setF({ ...f, principal: ev.target.value })} required />
          <TextField label="Échéances" type="number" min={1} max={60} value={f.count} onChange={(ev) => setF({ ...f, count: ev.target.value })} required />
          <TextField label="Première retenue" type="month" value={f.first} onChange={(ev) => setF({ ...f, first: ev.target.value })} required />
          <div className="sm:col-span-2 lg:col-span-5"><Button type="submit" variant="primary" loading={create.isPending}>Accorder le prêt</Button></div>
        </form>
        <div className="mt-3"><ErrorNote error={create.error ?? cancel.error} /></div>
      </Section>
      <Section title="Prêts">
        {loans.isLoading ? <Spinner /> : !loans.data?.length ? <Empty title="Aucun prêt">Les prêts accordés apparaissent ici avec leur solde.</Empty> : (
          <table className="w-full text-sm tabular-nums">
            <thead><tr className="border-b border-line text-left text-xs text-ink-muted"><th className="py-1">Salarié</th><th>Libellé</th><th className="text-right">Capital</th><th className="text-right">Retenu</th><th className="text-right">Reste</th><th>Prochaine</th><th>Statut</th><th /></tr></thead>
            <tbody>
              {loans.data.map((l) => (
                <tr key={l.loan_id} className="border-b border-line/60">
                  <td className="py-1.5">{names.get(l.employee_id)}</td><td>{l.label}</td>
                  <td className="text-right">{fcfa(l.principal)}</td><td className="text-right">{fcfa(l.retenu)}</td><td className="text-right">{fcfa(l.restant)}</td>
                  <td>{l.prochaine_echeance ? monthLabel(l.prochaine_echeance) : '—'}</td><td>{l.status}</td>
                  <td className="text-right">{l.status === 'Actif' && (
                    <Button size="sm" variant="ghost" onClick={() => { const reason = window.prompt('Motif de l\'annulation du prêt (obligatoire)'); if (reason) cancel.mutate({ id: l.loan_id, reason }) }}>Annuler</Button>
                  )}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>
    </div>
  )
}

function Corrections({ active, names }: Props) {
  const qc = useQueryClient()
  const [f, setF] = useState({ employee: '', source: '', kind: 'gain', amount: '', reason: '' })
  const list = useQuery({
    queryKey: ['payroll_corrections'],
    queryFn: async () => unwrap(await db.from('payroll_corrections').select('*').order('created_at', { ascending: false })) as unknown as
      { id: string; employee_id: string; source_period: string; kind: string; amount: number; reason: string; status: string; applied_period: string | null }[],
  })
  const create = useMutation({
    mutationFn: async () => unwrap(await db.rpc('create_payroll_correction', {
      p_employee_id: f.employee, p_source_period: toFirstDay(f.source), p_kind: f.kind, p_amount: Number(f.amount), p_reason: f.reason,
    })),
    onSuccess: () => { setF({ ...f, amount: '', reason: '' }); qc.invalidateQueries({ queryKey: ['payroll_corrections'] }) },
  })
  const cancel = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => unwrap(await db.rpc('cancel_payroll_correction', { p_correction_id: id, p_reason: reason })),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['payroll_corrections'] }),
  })
  return (
    <div className="space-y-5">
      <Section title="Régulariser un mois déjà validé">
        <p className="mb-3 text-xs text-ink-muted">Le mois d'origine n'est jamais modifié : la régularisation est ajoutée à la prochaine paie calculée (gain imposable ou retenue sur le net).</p>
        <form onSubmit={(ev) => { ev.preventDefault(); create.mutate() }} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <EmployeeSelect active={active} value={f.employee} onChange={(employee) => setF({ ...f, employee })} />
          <TextField label="Mois d'origine" type="month" value={f.source} onChange={(ev) => setF({ ...f, source: ev.target.value })} required />
          <SelectField label="Nature" value={f.kind} onChange={(ev) => setF({ ...f, kind: ev.target.value })}>
            <option value="gain">Complément à payer</option><option value="retenue">Trop-perçu à retenir</option>
          </SelectField>
          <TextField label="Montant (F)" type="number" min={1} value={f.amount} onChange={(ev) => setF({ ...f, amount: ev.target.value })} required />
          <TextField label="Motif (obligatoire)" value={f.reason} onChange={(ev) => setF({ ...f, reason: ev.target.value })} required />
          <div className="sm:col-span-2 lg:col-span-5"><Button type="submit" variant="primary" loading={create.isPending}>Enregistrer la régularisation</Button></div>
        </form>
        <div className="mt-3"><ErrorNote error={create.error ?? cancel.error} /></div>
      </Section>
      <Section title="Régularisations">
        {list.isLoading ? <Spinner /> : !list.data?.length ? <Empty title="Aucune régularisation" /> : (
          <table className="w-full text-sm tabular-nums">
            <thead><tr className="border-b border-line text-left text-xs text-ink-muted"><th className="py-1">Salarié</th><th>Mois</th><th>Nature</th><th className="text-right">Montant</th><th>Motif</th><th>Statut</th><th /></tr></thead>
            <tbody>
              {list.data.map((c) => (
                <tr key={c.id} className="border-b border-line/60 align-top">
                  <td className="py-1.5">{names.get(c.employee_id)}</td><td>{monthLabel(c.source_period)}</td>
                  <td>{c.kind === 'gain' ? 'Complément' : 'Retenue'}</td><td className="text-right">{fcfa(c.amount)}</td><td>{c.reason}</td>
                  <td>{c.status}{c.applied_period ? ` (${monthLabel(c.applied_period)})` : ''}</td>
                  <td className="text-right">{c.status === 'En attente' && (
                    <Button size="sm" variant="ghost" onClick={() => { const reason = window.prompt('Motif de l\'annulation (obligatoire)'); if (reason) cancel.mutate({ id: c.id, reason }) }}>Annuler</Button>
                  )}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>
    </div>
  )
}

function Recurring({ active, names }: Props) {
  const qc = useQueryClient()
  const components = useComponents()
  const choices = (components.data ?? []).filter((c) => c.input_mode === 'variable' && c.is_active && c.component_type !== 'statutory_deduction')
  const [f, setF] = useState({ employee: '', code: '', amount: '', from: thisMonth(), to: '' })
  const list = useQuery({
    queryKey: ['recurring_pay_items'],
    queryFn: async () => unwrap(await db.from('recurring_pay_items').select('*').order('created_at', { ascending: false })) as unknown as
      { id: string; employee_id: string; component_code: string; amount: number; from_period: string; to_period: string | null; active: boolean }[],
  })
  const create = useMutation({
    mutationFn: async () => unwrap(await db.from('recurring_pay_items').insert({
      employee_id: f.employee, component_code: f.code, amount: Number(f.amount), from_period: toFirstDay(f.from), to_period: f.to ? toFirstDay(f.to) : null,
    })),
    onSuccess: () => { setF({ ...f, amount: '' }); qc.invalidateQueries({ queryKey: ['recurring_pay_items'] }) },
  })
  const stop = useMutation({
    mutationFn: async (id: string) => unwrap(await db.from('recurring_pay_items').update({ active: false }).eq('id', id)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['recurring_pay_items'] }),
  })
  const nameOf = (code: string) => components.data?.find((c) => c.code === code)?.name ?? code
  return (
    <div className="space-y-5">
      <Section title="Ajouter une prime ou une retenue mensuelle">
        <form onSubmit={(ev) => { ev.preventDefault(); create.mutate() }} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <EmployeeSelect active={active} value={f.employee} onChange={(employee) => setF({ ...f, employee })} />
          <SelectField label="Rubrique" value={f.code} onChange={(ev) => setF({ ...f, code: ev.target.value })} required>
            <option value="">— choisir —</option>
            {choices.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
          </SelectField>
          <TextField label="Montant (F)" type="number" min={1} value={f.amount} onChange={(ev) => setF({ ...f, amount: ev.target.value })} required />
          <TextField label="À partir de" type="month" value={f.from} onChange={(ev) => setF({ ...f, from: ev.target.value })} required />
          <TextField label="Jusqu'à (facultatif)" type="month" value={f.to} onChange={(ev) => setF({ ...f, to: ev.target.value })} />
          <div className="sm:col-span-2 lg:col-span-5"><Button type="submit" variant="primary" loading={create.isPending}>Ajouter</Button></div>
        </form>
        <p className="mt-2 text-xs text-ink-muted">Une saisie manuelle du mois, pour la même rubrique, remplace l'élément récurrent ce mois-là.</p>
        <div className="mt-3"><ErrorNote error={create.error ?? stop.error} /></div>
      </Section>
      <Section title="Éléments récurrents">
        {list.isLoading ? <Spinner /> : !list.data?.length ? <Empty title="Aucun élément récurrent" /> : (
          <table className="w-full text-sm tabular-nums">
            <thead><tr className="border-b border-line text-left text-xs text-ink-muted"><th className="py-1">Salarié</th><th>Rubrique</th><th className="text-right">Montant</th><th>Depuis</th><th>Jusqu'à</th><th>État</th><th /></tr></thead>
            <tbody>
              {list.data.map((r) => (
                <tr key={r.id} className="border-b border-line/60">
                  <td className="py-1.5">{names.get(r.employee_id)}</td><td>{nameOf(r.component_code)}</td><td className="text-right">{fcfa(r.amount)}</td>
                  <td>{date(r.from_period)}</td><td>{r.to_period ? date(r.to_period) : '—'}</td><td>{r.active ? 'Actif' : 'Arrêté'}</td>
                  <td className="text-right">{r.active && <Button size="sm" variant="ghost" onClick={() => stop.mutate(r.id)}>Arrêter</Button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>
    </div>
  )
}
