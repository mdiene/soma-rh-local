import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import clsx from 'clsx'
import { ArrowRightLeft, CheckCircle2, ChevronLeft, ChevronRight, Save, Search, UserCheck, UserX } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { dataApi, unwrap, type Tables } from '../lib/api'
import { useAuth } from '../lib/auth'
import { useEmployees } from '../lib/queries'
import { date as fmtDate, monthBounds, monthLabel, num } from '../lib/format'
import { Button, ErrorNote, Modal, PageHeader, Section, Spinner, TextField } from '../components/ui'

/**
 * Présences — saisie journalière en grille : un salarié actif par ligne,
 * données du jour préchargées, enregistrement groupé (upsert sur salarié + date,
 * donc sans doublon), lignes modifiées signalées, report du cumul dans la paie.
 */

type Att = Tables<'attendance'>
type Rate = '15' | '40' | '60' | '100'
type Draft = { present: boolean; worked: string; absence: string; sick: string; hs: string; rate: Rate; notes: string }
type Filter = 'tous' | 'saisis' | 'non-saisis' | 'modifies' | 'absents'

const DAY_HOURS = 8
const EMPTY: Draft = { present: false, worked: '', absence: '', sick: '', hs: '', rate: '15', notes: '' }
const RATES: Rate[] = ['15', '40', '60', '100']
const today = () => new Date().toISOString().slice(0, 10)
const shiftDay = (d: string, n: number) => {
  const x = new Date(`${d}T12:00:00Z`)
  x.setUTCDate(x.getUTCDate() + n)
  return x.toISOString().slice(0, 10)
}
const weekday = (d: string) => new Intl.DateTimeFormat('fr-FR', { weekday: 'long', timeZone: 'UTC' }).format(new Date(`${d}T12:00:00Z`))

/** Valeur saisie → nombre (virgule acceptée) ; '' vaut 0 ; NaN si invalide. */
function parse(v: string): number {
  if (v.trim() === '') return 0
  const n = Number(v.replace(',', '.'))
  return Number.isFinite(n) ? n : NaN
}

function fromRecord(a: Att | undefined): Draft {
  if (!a) return EMPTY
  const ot = { '15': Number(a.overtime_15), '40': Number(a.overtime_40), '60': Number(a.overtime_60), '100': Number(a.overtime_100) }
  const hs = ot['15'] + ot['40'] + ot['60'] + ot['100']
  const rate = (RATES.reduce((best, r) => (ot[r] > ot[best] ? r : best), '15' as Rate))
  const present = a.status === 'Présent' || a.status === 'Demi-journée'
  const worked = a.working_hours ?? (present ? Math.max(0, DAY_HOURS - Number(a.absence_hours)) : 0)
  return {
    present, worked: String(worked), absence: String(Number(a.absence_hours)), sick: String(Number(a.sick_hours ?? 0)),
    hs: hs ? String(hs) : '', rate, notes: a.notes ?? '',
  }
}

function errorsOf(d: Draft): Partial<Record<keyof Draft, string>> {
  const e: Partial<Record<keyof Draft, string>> = {}
  for (const k of ['worked', 'absence', 'sick', 'hs'] as const) {
    const n = parse(d[k])
    if (Number.isNaN(n)) e[k] = 'Nombre attendu'
    else if (n < 0 || n > 24) e[k] = 'Entre 0 et 24 h'
  }
  const total = parse(d.worked) + parse(d.absence) + parse(d.sick)
  if (!e.worked && !e.absence && !e.sick && total > 24) e.worked = 'Travail + absence + maladie > 24 h'
  return e
}

const same = (a: Draft, b: Draft) => JSON.stringify(a) === JSON.stringify(b)
const LABELS = { worked: 'Heures travaillées', absence: 'Heures d\'absence', sick: 'Heures de maladie', hs: 'Heures supplémentaires' } as const

export default function AttendancePage() {
  const { can } = useAuth()
  const editable = can('rh')
  const qc = useQueryClient()
  const employees = useEmployees()
  const [day, setDay] = useState(today())
  const [pendingDay, setPendingDay] = useState<string | null>(null)
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})
  const [query, setQuery] = useState('')
  const [dept, setDept] = useState('')
  const [filter, setFilter] = useState<Filter>('tous')
  const [confirmAbsent, setConfirmAbsent] = useState(false)
  const [saved, setSaved] = useState<number | null>(null)

  const departments = useQuery({
    queryKey: ['departments'],
    queryFn: async () => unwrap(await dataApi.from('departments').select('id, name').order('name')),
  })
  const records = useQuery({
    queryKey: ['attendance-day', day],
    queryFn: async () => unwrap(await dataApi.from('attendance').select('*').eq('attendance_date', day)),
  })
  const byEmp = useMemo(() => new Map((records.data ?? []).map((a) => [a.employee_id, a])), [records.data])

  // salariés présents dans l'effectif à cette date
  const staff = useMemo(() => (employees.data ?? []).filter((e) =>
    e.status === 'Active' && (!e.date_of_joining || e.date_of_joining <= day) && (!e.relieving_date || e.relieving_date >= day)), [employees.data, day])

  // les brouillons repartent des données enregistrées à chaque changement de jour ou rechargement
  useEffect(() => { setDrafts({}) }, [day, records.data])

  const base = (id: string) => fromRecord(byEmp.get(id))
  const draftOf = (id: string) => drafts[id] ?? base(id)
  const modifiedIds = Object.keys(drafts).filter((id) => !same(drafts[id], base(id)))
  const dirty = modifiedIds.length > 0
  const invalid = modifiedIds.filter((id) => Object.keys(errorsOf(drafts[id])).length > 0)

  // alerte avant de quitter la page avec des saisies non enregistrées
  useEffect(() => {
    if (!dirty) return
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', h)
    return () => window.removeEventListener('beforeunload', h)
  }, [dirty])

  function edit(id: string, patch: Partial<Draft>) {
    setSaved(null)
    setDrafts((ds) => ({ ...ds, [id]: { ...(ds[id] ?? base(id)), ...patch } }))
  }
  function togglePresent(id: string, present: boolean) {
    const d = draftOf(id)
    edit(id, present
      ? { present, worked: String(DAY_HOURS), absence: '0' }
      : { present, worked: '0', absence: parse(d.sick) > 0 ? '0' : String(DAY_HOURS) })
  }

  const rows = staff.filter((e) => {
    const q = query.trim().toLowerCase()
    if (q && !`${e.employee_number} ${e.first_name} ${e.last_name}`.toLowerCase().includes(q)) return false
    if (dept && e.department_id !== dept) return false
    const rec = byEmp.get(e.id)
    if (filter === 'saisis' && !rec) return false
    if (filter === 'non-saisis' && rec) return false
    if (filter === 'modifies' && !modifiedIds.includes(e.id)) return false
    if (filter === 'absents' && draftOf(e.id).present) return false
    return true
  })
  const onLeave = (id: string) => byEmp.get(id)?.status === 'Congé'

  function markAll(present: boolean) {
    setSaved(null)
    setDrafts((ds) => {
      const next = { ...ds }
      for (const e of rows) {
        if (onLeave(e.id)) continue // les congés posés ne sont pas écrasés
        const d = next[e.id] ?? base(e.id)
        next[e.id] = present
          ? { ...d, present: true, worked: String(DAY_HOURS), absence: '0', sick: '0' }
          : { ...d, present: false, worked: '0', absence: String(DAY_HOURS), sick: '0' }
      }
      return next
    })
  }

  const save = useMutation({
    mutationFn: async () => {
      const payload = modifiedIds.map((id) => {
        const d = drafts[id]
        const rec = byEmp.get(id)
        const worked = parse(d.worked), absence = parse(d.absence), sick = parse(d.sick), hs = parse(d.hs)
        const status = d.present
          ? (absence > 0 ? 'Demi-journée' : 'Présent')
          : rec?.status === 'Congé' ? 'Congé' : sick > 0 && absence === 0 ? 'Maladie' : 'Absent'
        // heures sup. : répartition d'origine conservée si l'utilisateur ne les a pas modifiées
        const b = base(id)
        const keepOt = rec && b.hs === d.hs && b.rate === d.rate
        const ot = (r: Rate) => (keepOt ? Number(rec[`overtime_${r}` as const]) : d.rate === r ? hs : 0)
        return {
          employee_id: id, attendance_date: day, status, working_hours: worked, absence_hours: absence, sick_hours: sick,
          overtime_15: ot('15'), overtime_40: ot('40'), overtime_60: ot('60'), overtime_100: ot('100'),
          notes: d.notes.trim() || null,
        }
      })
      return unwrap(await dataApi.from('attendance').upsert(payload, { onConflict: 'employee_id,attendance_date' }).select('*'))
    },
    onSuccess: (data) => {
      // les lignes enregistrées deviennent la référence tout de suite (puis rechargement de contrôle)
      qc.setQueryData<Att[]>(['attendance-day', day], (old) => {
        const m = new Map((old ?? []).map((a) => [a.employee_id, a]))
        for (const a of data) m.set(a.employee_id, a)
        return [...m.values()]
      })
      setDrafts({})
      setSaved(data.length)
      qc.invalidateQueries({ queryKey: ['attendance-day', day] })
      qc.invalidateQueries({ queryKey: ['attendance-month'] })
    },
  })

  function goTo(d: string) {
    if (dirty) setPendingDay(d)
    else setDay(d)
  }

  const counts = useMemo(() => {
    let present = 0, absent = 0, entered = 0
    for (const e of staff) {
      const d = draftOf(e.id)
      if (byEmp.has(e.id) || drafts[e.id]) entered++
      if (d.present) present++
      else if (byEmp.has(e.id) || drafts[e.id]) absent++
    }
    return { present, absent, entered }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [staff, drafts, byEmp])

  return (
    <>
      <PageHeader
        title="Présences"
        description="Saisie du jour, un salarié par ligne. Les heures d'absence, de maladie et les heures supplémentaires alimentent les variables de paie du mois."
        actions={<>
          <div className="flex items-end gap-1">
            <Button variant="ghost" aria-label="Jour précédent" icon={<ChevronLeft className="h-4 w-4" />} onClick={() => goTo(shiftDay(day, -1))} />
            <TextField label="Date" type="date" value={day} onChange={(e) => e.target.value && goTo(e.target.value)} className="w-44" />
            <Button variant="ghost" aria-label="Jour suivant" icon={<ChevronRight className="h-4 w-4" />} onClick={() => goTo(shiftDay(day, 1))} />
          </div>
          {editable && (
            <Button variant="primary" className="self-end" icon={<Save className="h-4 w-4" />} loading={save.isPending}
              disabled={!dirty || invalid.length > 0} onClick={() => save.mutate()}>
              Enregistrer{dirty ? ` (${modifiedIds.length})` : ''}
            </Button>
          )}
        </>}
      />

      <ErrorNote error={employees.error || records.error || save.error} />

      <div className="panel overflow-hidden">
        <div className="no-print flex flex-wrap items-center gap-2 border-b border-line px-3 py-2">
          <p className="mr-2 text-sm">
            <span className="font-semibold capitalize">{weekday(day)}</span> {fmtDate(day)} ·{' '}
            <span className="num">{counts.present}</span> présent(s), <span className="num">{counts.absent}</span> absent(s),{' '}
            <span className="num">{staff.length - counts.entered}</span> non saisi(s)
          </p>
          <label className="relative min-w-[12rem] max-w-xs flex-1">
            <span className="sr-only">Rechercher un salarié</span>
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-ink-muted" aria-hidden />
            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Nom ou matricule…" className="field pl-8" />
          </label>
          <select aria-label="Département" value={dept} onChange={(e) => setDept(e.target.value)} className="field w-auto">
            <option value="">Tous les départements</option>
            {(departments.data ?? []).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          <select aria-label="Statut de saisie" value={filter} onChange={(e) => setFilter(e.target.value as Filter)} className="field w-auto">
            <option value="tous">Toutes les lignes</option>
            <option value="saisis">Déjà saisies</option>
            <option value="non-saisis">Non saisies</option>
            <option value="modifies">Modifiées non enregistrées</option>
            <option value="absents">Absents</option>
          </select>
          {editable && (
            <div className="ml-auto flex gap-2">
              <Button size="sm" icon={<UserCheck className="h-3.5 w-3.5" />} onClick={() => markAll(true)}>Tout présent</Button>
              <Button size="sm" icon={<UserX className="h-3.5 w-3.5" />} onClick={() => setConfirmAbsent(true)}>Tout absent</Button>
            </div>
          )}
        </div>

        {(dirty || saved !== null) && (
          <div className={clsx('flex items-center gap-2 border-b px-3 py-2 text-sm',
            saved !== null && !dirty ? 'border-river/30 bg-river-light text-river-dark' : 'border-phosphate/50 bg-phosphate-light text-ink')} role="status">
            {saved !== null && !dirty ? (
              <><CheckCircle2 className="h-4 w-4" aria-hidden /> {saved} ligne(s) enregistrée(s) pour le {fmtDate(day)}.</>
            ) : (
              <>{modifiedIds.length} modification(s) non enregistrée(s){invalid.length > 0 && <strong className="text-signal"> — {invalid.length} ligne(s) à corriger avant d'enregistrer</strong>}.</>
            )}
          </div>
        )}

        {employees.isLoading || records.isLoading ? <div className="px-4"><Spinner /></div> : (
          <div className="max-h-[calc(100vh-19rem)] min-h-[16rem] overflow-auto">
            <table className="w-full min-w-[60rem] border-separate border-spacing-0 text-sm">
              <thead>
                <tr className="text-left text-xs font-semibold text-ink-soft">
                  {['Salarié', 'Matricule', 'Présent', 'Heures travaillées', 'Absence (h)', 'Maladie (h)', 'Heures sup. (h)', 'Taux HS', 'Commentaire', 'État'].map((h, i) => (
                    <th key={h} scope="col" className={clsx('sticky top-0 z-10 border-b border-line bg-paper px-2 py-2', i >= 3 && i <= 6 && 'text-right', i === 2 && 'text-center')}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((e) => {
                  const d = draftOf(e.id)
                  const err = errorsOf(d)
                  const modified = modifiedIds.includes(e.id)
                  const rec = byEmp.get(e.id)
                  const leave = onLeave(e.id) && !modified
                  const cell = 'border-b border-line/70 px-2 py-1'
                  const numInput = (k: 'worked' | 'absence' | 'sick' | 'hs') => (
                    <input inputMode="decimal" aria-label={`${LABELS[k]} — ${e.last_name}`} disabled={!editable} value={d[k]} placeholder="0"
                      onChange={(ev) => edit(e.id, { [k]: ev.target.value })}
                      aria-invalid={!!err[k]} title={err[k]}
                      className={clsx('field w-20 py-1 text-right', err[k] && 'border-signal ring-2 ring-signal/20')} />
                  )
                  return (
                    <tr key={e.id} className={clsx(modified ? 'bg-phosphate-light/60' : 'bg-white', 'hover:bg-[#F1F7F6]')}>
                      <td className={cell}>
                        <span className="whitespace-nowrap font-medium">{e.last_name} {e.first_name}</span>
                        <span className="block text-xs text-ink-muted">{e.designation?.name ?? ''}</span>
                      </td>
                      <td className={clsx(cell, 'num')}>{e.employee_number}</td>
                      <td className={clsx(cell, 'text-center')}>
                        <input type="checkbox" className="h-4 w-4 accent-[#0F6E6A]" disabled={!editable} checked={d.present}
                          aria-label={`Présent — ${e.last_name}`} onChange={(ev) => togglePresent(e.id, ev.target.checked)} />
                      </td>
                      <td className={clsx(cell, 'text-right')}>{numInput('worked')}</td>
                      <td className={clsx(cell, 'text-right')}>{numInput('absence')}</td>
                      <td className={clsx(cell, 'text-right')}>{numInput('sick')}</td>
                      <td className={clsx(cell, 'text-right')}>{numInput('hs')}</td>
                      <td className={cell}>
                        <select aria-label={`Taux HS — ${e.last_name}`} disabled={!editable} value={d.rate}
                          onChange={(ev) => edit(e.id, { rate: ev.target.value as Rate })} className="field w-20 py-1">
                          {RATES.map((r) => <option key={r} value={r}>{r} %</option>)}
                        </select>
                      </td>
                      <td className={cell}>
                        <input aria-label={`Commentaire — ${e.last_name}`} disabled={!editable} value={d.notes} maxLength={200}
                          onChange={(ev) => edit(e.id, { notes: ev.target.value })} className="field min-w-[10rem] py-1" />
                      </td>
                      <td className={clsx(cell, 'whitespace-nowrap text-xs')}>
                        {Object.keys(err).length > 0 ? <span className="font-semibold text-signal">{Object.values(err)[0]}</span>
                          : modified ? <span className="font-semibold text-ink">Modifié</span>
                          : leave ? <span className="text-river-dark">En congé</span>
                          : rec ? <span className="text-river">Enregistré</span>
                          : <span className="text-ink-muted">Non saisi</span>}
                      </td>
                    </tr>
                  )
                })}
                {rows.length === 0 && (
                  <tr><td colSpan={10} className="px-3 py-6 text-center text-ink-muted">Aucun salarié ne correspond aux filtres.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <MonthSummary period={`${day.slice(0, 7)}-01`} />

      <Modal open={confirmAbsent} onClose={() => setConfirmAbsent(false)} title="Marquer tout le monde absent ?"
        footer={<>
          <Button variant="ghost" onClick={() => setConfirmAbsent(false)}>Annuler</Button>
          <Button variant="primary" onClick={() => { markAll(false); setConfirmAbsent(false) }}>Marquer {rows.length} salarié(s) absent(s)</Button>
        </>}>
        <p className="text-sm text-ink-soft">
          Les {rows.length} ligne(s) affichée(s) passeront à {DAY_HOURS} h d'absence pour le {fmtDate(day)}. Les salariés en congé ne sont pas modifiés.
          Rien n'est enregistré tant que vous n'avez pas cliqué sur « Enregistrer ».
        </p>
      </Modal>

      <Modal open={pendingDay !== null} onClose={() => setPendingDay(null)} title="Modifications non enregistrées"
        footer={<>
          <Button variant="ghost" onClick={() => setPendingDay(null)}>Rester sur le {fmtDate(day)}</Button>
          <Button variant="primary" onClick={() => { setDay(pendingDay!); setPendingDay(null) }}>Abandonner et changer de jour</Button>
        </>}>
        <p className="text-sm text-ink-soft">{modifiedIds.length} ligne(s) modifiée(s) pour le {fmtDate(day)} ne sont pas enregistrées. Elles seront perdues si vous changez de jour.</p>
      </Modal>
    </>
  )
}

/** Cumul du mois par salarié et report dans les variables de paie. */
function MonthSummary({ period }: { period: string }) {
  const { can } = useAuth()
  const qc = useQueryClient()
  const { start, end } = monthBounds(period)
  const q = useQuery({
    queryKey: ['attendance-month', period],
    queryFn: async () => unwrap(await dataApi.from('attendance')
      .select('employee_id, status, absence_hours, sick_hours, overtime_15, overtime_40, overtime_60, overtime_100, employee:employees(employee_number, first_name, last_name)')
      .gte('attendance_date', start).lte('attendance_date', end)),
  })
  const sync = useMutation({
    mutationFn: async () => unwrap(await dataApi.rpc('sync_attendance_to_payroll_inputs', { p_period: period })),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['payroll_inputs'] }),
  })
  const summary = useMemo(() => {
    const m = new Map<string, { mat: string; name: string; days: number; absence: number; sick: number; hs: number }>()
    for (const a of q.data ?? []) {
      const s = m.get(a.employee_id) ?? { mat: a.employee?.employee_number ?? '', name: a.employee ? `${a.employee.last_name} ${a.employee.first_name}` : '', days: 0, absence: 0, sick: 0, hs: 0 }
      s.days += 1
      if (a.status !== 'Congé') s.absence += Number(a.absence_hours)
      s.sick += Number(a.sick_hours)
      s.hs += Number(a.overtime_15) + Number(a.overtime_40) + Number(a.overtime_60) + Number(a.overtime_100)
      m.set(a.employee_id, s)
    }
    return [...m.values()].sort((a, b) => a.mat.localeCompare(b.mat))
  }, [q.data])

  return (
    <Section className="mt-6" title={`Cumul de ${monthLabel(period)}`}
      actions={can('paie', 'rh') && (
        <Button size="sm" icon={<ArrowRightLeft className="h-3.5 w-3.5" />} loading={sync.isPending} onClick={() => sync.mutate()}>
          Reporter dans les variables de paie
        </Button>
      )}>
      <ErrorNote error={q.error || sync.error} />
      {sync.isSuccess && <p className="mb-3 rounded border border-river/30 bg-river-light px-3 py-2 text-sm text-river-dark">{sync.data as number} salarié(s) mis à jour dans les variables de {monthLabel(period)}.</p>}
      {summary.length === 0 ? <p className="text-sm text-ink-soft">Aucune présence saisie ce mois-ci.</p> : (
        <details>
          <summary className="cursor-pointer text-sm font-medium text-river hover:underline">{summary.length} salarié(s) avec des saisies — afficher le détail</summary>
          <table className="mt-3 w-full text-sm">
            <thead><tr className="table-head">
              <th className="px-2 py-1.5">Matricule</th><th className="px-2 py-1.5">Salarié</th><th className="px-2 py-1.5 text-right">Jours saisis</th>
              <th className="px-2 py-1.5 text-right">Absence (h)</th><th className="px-2 py-1.5 text-right">Maladie (h)</th><th className="px-2 py-1.5 text-right">Heures sup. (h)</th>
            </tr></thead>
            <tbody>{summary.map((s) => (
              <tr key={s.mat} className="border-b border-line/70">
                <td className="px-2 py-1.5 num">{s.mat}</td><td className="px-2 py-1.5">{s.name}</td><td className="px-2 py-1.5 text-right">{s.days}</td>
                <td className="px-2 py-1.5 text-right">{num(s.absence)}</td><td className="px-2 py-1.5 text-right">{num(s.sick)}</td><td className="px-2 py-1.5 text-right">{num(s.hs)}</td>
              </tr>
            ))}</tbody>
          </table>
        </details>
      )}
    </Section>
  )
}
