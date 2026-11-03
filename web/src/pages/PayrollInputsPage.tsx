import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Copy, Save, Search } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import clsx from 'clsx'
import { dataApi, unwrap } from '../lib/api'
import { useAuth } from '../lib/auth'
import { useComponents, useEmployees } from '../lib/queries'
import { currentPeriod, monthLabel } from '../lib/format'
import { Button, ErrorNote, PageHeader, Spinner, TextField } from '../components/ui'

const INPUT_COLS = [
  { key: 'absence_hours', label: 'H. absence' },
  { key: 'sick_leave_hours', label: 'H. maladie' },
  { key: 'sick_leave_rate', label: 'Taux maladie', step: 0.05 },
  { key: 'meal_count', label: 'Paniers' },
  { key: 'overtime_15', label: 'HS 15 %' },
  { key: 'overtime_40', label: 'HS 40 %' },
  { key: 'overtime_60', label: 'HS 60 %' },
  { key: 'overtime_100', label: 'HS 100 %' },
  { key: 'leave_allowance', label: 'Allocation congé' },
  { key: 'previous_rounding', label: 'Appoint M-1' },
] as const
type InputKey = (typeof INPUT_COLS)[number]['key']
type RowState = { inputs: Record<InputKey, number>; adds: Record<string, number> }
const DEFAULT_INPUTS = Object.fromEntries(INPUT_COLS.map((c) => [c.key, c.key === 'sick_leave_rate' ? 1 : 0])) as Record<InputKey, number>

function prevPeriod(p: string) {
  const [y, m] = p.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 2, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`
}

async function loadPeriod(period: string) {
  const [inputs, adds] = await Promise.all([
    dataApi.from('payroll_inputs').select('*').eq('period', period),
    dataApi.from('additional_salaries').select('*').eq('period', period),
  ])
  return { inputs: unwrap(inputs), adds: unwrap(adds) }
}

export default function PayrollInputsPage() {
  const [period, setPeriod] = useState(currentPeriod())
  const { can } = useAuth()
  const qc = useQueryClient()
  const employees = useEmployees()
  const components = useComponents()
  const variable = useMemo(() => (components.data ?? []).filter((c) => c.input_mode === 'variable' && c.is_active), [components.data])

  const data = useQuery({ queryKey: ['payroll_inputs', period], queryFn: () => loadPeriod(period) })
  const [rows, setRows] = useState<Record<string, RowState>>({})
  const [dirty, setDirty] = useState<Set<string>>(new Set())

  // Heures déjà saisies dans la grille des présences : elles alimentent directement ces colonnes.
  const attendance = useQuery({
    queryKey: ['attendance_totals', period],
    queryFn: async () => {
      const end = new Date(Date.UTC(Number(period.slice(0, 4)), Number(period.slice(5, 7)), 0)).toISOString().slice(0, 10)
      const list = unwrap(await dataApi.from('attendance')
        .select('employee_id,status,absence_hours,sick_hours,overtime_15,overtime_40,overtime_60,overtime_100')
        .gte('attendance_date', period).lte('attendance_date', end).limit(5000))
      const byEmp: Record<string, Partial<Record<InputKey, number>>> = {}
      for (const a of list) {
        const t = (byEmp[a.employee_id] ??= {})
        t.absence_hours = (t.absence_hours ?? 0) + (a.status === 'Congé' ? 0 : Number(a.absence_hours))
        t.sick_leave_hours = (t.sick_leave_hours ?? 0) + Number(a.sick_hours)
        t.overtime_15 = (t.overtime_15 ?? 0) + Number(a.overtime_15)
        t.overtime_40 = (t.overtime_40 ?? 0) + Number(a.overtime_40)
        t.overtime_60 = (t.overtime_60 ?? 0) + Number(a.overtime_60)
        t.overtime_100 = (t.overtime_100 ?? 0) + Number(a.overtime_100)
      }
      return byEmp
    },
  })
  const fromAtt = (id: string, key: InputKey) => attendance.data?.[id]?.[key]
  const valueOf = (id: string, key: InputKey) => rows[id]?.inputs[key] ?? 0
  // écart avec les présences : la correction manuelle est conservée au calcul (attendance_override)
  const differsFromAtt = (id: string, key: InputKey) => { const a = fromAtt(id, key); return a !== undefined && Math.abs(a - valueOf(id, key)) > 1e-9 }

  const active = useMemo(() => (employees.data ?? []).filter((e) => e.status === 'Active'), [employees.data])
  const [search, setSearch] = useState('')
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '')
    if (!q) return active
    return active.filter((e) =>
      `${e.employee_number} ${e.first_name} ${e.last_name} ${e.designation?.name ?? ''}`
        .toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').includes(q))
  }, [active, search])

  // Présences d'abord ; une ligne corrigée à la main (attendance_override) garde ses valeurs enregistrées.
  function hydrate(src: Awaited<ReturnType<typeof loadPeriod>>, markDirty: boolean, sameMonth = true) {
    const next: Record<string, RowState> = {}
    for (const e of active) {
      const i = src.inputs.find((x) => x.employee_id === e.id)
      const inputs = { ...DEFAULT_INPUTS }
      if (i) for (const c of INPUT_COLS) inputs[c.key] = Number(i[c.key])
      const att = attendance.data?.[e.id]
      if (att && !(sameMonth && i?.attendance_override)) for (const c of INPUT_COLS) if (att[c.key] !== undefined) inputs[c.key] = att[c.key]!
      const adds: Record<string, number> = {}
      for (const a of src.adds.filter((x) => x.employee_id === e.id)) adds[a.component_code] = Number(a.amount)
      next[e.id] = { inputs, adds }
    }
    setRows(next)
    setDirty(markDirty ? new Set(active.map((e) => e.id)) : new Set())
  }
  useEffect(() => { if (data.data && active.length) hydrate(data.data, false) }, [data.data, active, attendance.data]) // eslint-disable-line react-hooks/exhaustive-deps

  const copyPrev = useMutation({
    mutationFn: () => loadPeriod(prevPeriod(period)),
    onSuccess: (src) => hydrate(src, true, false),
  })

  const save = useMutation({
    mutationFn: async () => {
      const ids = [...dirty]
      const inputRows = ids.map((id) => ({
        employee_id: id, period, ...rows[id].inputs,
        attendance_override: INPUT_COLS.some((c) => differsFromAtt(id, c.key)),
      }))
      if (inputRows.length) unwrap(await dataApi.from('payroll_inputs').upsert(inputRows, { onConflict: 'employee_id,period' }).select('id'))
      const upserts = ids.flatMap((id) => Object.entries(rows[id].adds).filter(([, v]) => v > 0).map(([code, amount]) => ({ employee_id: id, period, component_code: code, amount })))
      if (upserts.length) unwrap(await dataApi.from('additional_salaries').upsert(upserts, { onConflict: 'employee_id,period,component_code' }).select('id'))
      for (const id of ids) {
        const zeros = Object.entries(rows[id].adds).filter(([, v]) => !v).map(([c]) => c)
        if (zeros.length) unwrap(await dataApi.from('additional_salaries').delete().eq('employee_id', id).eq('period', period).in('component_code', zeros).select('id'))
      }
      return ids.length
    },
    onSuccess: () => { setDirty(new Set()); qc.invalidateQueries({ queryKey: ['payroll_inputs', period] }) },
  })

  function setVal(id: string, kind: 'inputs' | 'adds', key: string, v: string) {
    const n = v === '' ? 0 : Number(v)
    setRows((r) => ({ ...r, [id]: { ...r[id], [kind]: { ...r[id][kind], [key]: n } } }))
    setDirty((d) => new Set(d).add(id))
  }

  const readOnly = !can('paie', 'rh')
  const loading = data.isLoading || employees.isLoading || components.isLoading || attendance.isLoading

  return (
    <>
      <PageHeader
        title="Variables du mois"
        description="Heures, primes et retenues du mois, saisies avant le calcul de la paie. Absences, maladie et heures supplémentaires sont reprises automatiquement de la grille des présences (cellules bleutées) ; toutes les cases restent modifiables (cellules jaunes = corrigées à la main). Les montants des primes et retenues sont toujours positifs."
        actions={<>
          <TextField label="Mois de paie" type="month" value={period.slice(0, 7)} onChange={(e) => setPeriod(`${e.target.value}-01`)} className="w-44" />
          {!readOnly && <Button icon={<Copy className="h-4 w-4" />} loading={copyPrev.isPending} onClick={() => copyPrev.mutate()}>Reprendre {monthLabel(prevPeriod(period))}</Button>}
          {!readOnly && <Button variant="primary" icon={<Save className="h-4 w-4" />} loading={save.isPending} disabled={dirty.size === 0} onClick={() => save.mutate()}>Enregistrer{dirty.size ? ` (${dirty.size})` : ''}</Button>}
        </>}
      />
      <ErrorNote error={data.error || save.error || copyPrev.error} />
      {save.isSuccess && dirty.size === 0 && <p className="mb-3 rounded border border-river/30 bg-river-light px-3 py-2 text-sm text-river-dark">Variables de {monthLabel(period)} enregistrées. Relancez le calcul du traitement pour les prendre en compte.</p>}
      {loading ? <Spinner /> : (
        <>
        <div className="no-print mb-3 flex flex-wrap items-center gap-3">
          <label className="relative w-full max-w-sm">
            <span className="sr-only">Rechercher un salarié</span>
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-ink-muted" aria-hidden />
            <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Nom, prénom, matricule ou emploi…" className="field pl-8" />
          </label>
          <span className="text-xs text-ink-muted">
            {visible.length} salarié(s) affiché(s) sur {active.length}
            {dirty.size > 0 && ` · ${dirty.size} ligne(s) modifiée(s) non enregistrée(s)`}
          </span>
        </div>
        {/* Défilement interne : l'en-tête et la colonne Salarié restent visibles. */}
        <div className="panel max-h-[calc(100vh-15rem)] min-h-[16rem] overflow-auto">
          <table className="w-full border-separate border-spacing-0 text-sm">
            <thead>
              <tr className="text-left text-xs font-semibold text-ink-soft">
                <th className="sticky left-0 top-0 z-30 border-b border-line bg-paper px-2 py-2">Salarié</th>
                {INPUT_COLS.map((c) => <th key={c.key} className="sticky top-0 z-20 whitespace-nowrap border-b border-line bg-paper px-1.5 py-2 text-right">{c.label}</th>)}
                {variable.map((c) => (
                  <th key={c.code} className={clsx('sticky top-0 z-20 whitespace-nowrap border-b border-line bg-paper px-1.5 py-2 text-right', c.component_type === 'net_deduction' && 'text-signal')}>{c.name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 && (
                <tr><td colSpan={1 + INPUT_COLS.length + variable.length} className="px-3 py-6 text-sm text-ink-muted">Aucun salarié ne correspond à « {search} ».</td></tr>
              )}
              {visible.map((e) => {
                const r = rows[e.id]
                if (!r) return null
                const isDirty = dirty.has(e.id)
                return (
                  <tr key={e.id} className={clsx('[&>td]:border-b [&>td]:border-line/70', isDirty && 'bg-phosphate-light/50')}>
                    <td className={clsx('sticky left-0 z-10 whitespace-nowrap px-2 py-1', isDirty ? 'bg-phosphate-light' : 'bg-white')}>
                      <span className="text-ink-muted">{e.employee_number}</span> {e.first_name} {e.last_name}
                    </td>
                    {INPUT_COLS.map((c) => {
                      const auto = fromAtt(e.id, c.key) !== undefined
                      const edited = differsFromAtt(e.id, c.key)
                      return (
                        <td key={c.key} className="px-1 py-1">
                          <input type="number" disabled={readOnly} aria-label={`${c.label} — ${e.last_name}`} step={'step' in c ? c.step : 1}
                            title={edited ? `Corrigé à la main (présences : ${fromAtt(e.id, c.key)})` : auto ? 'Repris de la grille des présences, modifiable' : undefined}
                            className={clsx('field w-[5.5rem] px-1.5 py-1 text-right', auto && !edited && 'border-river/30 bg-river-light text-river-dark', edited && 'border-phosphate bg-phosphate-light')}
                            value={valueOf(e.id, c.key) || ''} placeholder="0"
                            onChange={(ev) => setVal(e.id, 'inputs', c.key, ev.target.value)} />
                        </td>
                      )
                    })}
                    {variable.map((c) => (
                      <td key={c.code} className="px-1 py-1">
                        <input type="number" disabled={readOnly} aria-label={`${c.name} — ${e.last_name}`} min={0}
                          className="field w-[6.5rem] px-1.5 py-1 text-right" value={r.adds[c.code] || ''} placeholder="0"
                          onChange={(ev) => setVal(e.id, 'adds', c.code, ev.target.value)} />
                      </td>
                    ))}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        </>
      )}
    </>
  )
}
