import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ApiClient } from '../lib/api'
import clsx from 'clsx'
import { CalendarClock, ChevronLeft, ChevronRight, Wand2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { dataApi, unwrap } from '../lib/api'
import { useAuth } from '../lib/auth'
import { useEmployees } from '../lib/queries'
import { currentPeriod, monthBounds, monthLabel } from '../lib/format'
import { Button, ErrorNote, Modal, PageHeader, SelectField, Spinner, TextField } from '../components/ui'

/**
 * Planning des postes : grille mensuelle (salarié × jour) pour les rotations,
 * notamment les gardiens en présence 24 h/24. Un clic sur une case fait défiler
 * les types de poste ; « Générer une rotation » applique un cycle (ex. J,J,N,N,R,R).
 * Écriture réservée au rôle RH ; la paie et chaque salarié (pour lui-même) consultent.
 */
const db = dataApi as unknown as ApiClient
type ShiftType = { code: string; label: string; hours: number; is_night: boolean; is_rest: boolean; is_active: boolean; sort_order: number }
type Assign = { employee_id: string; work_date: string; shift_code: string }

const TONE: Record<string, string> = {
  J: 'bg-phosphate-light text-ink', N: 'bg-river text-white', M: 'bg-phosphate-light text-ink',
  A: 'bg-phosphate-light text-ink', NT: 'bg-river text-white', R: 'bg-paper text-ink-muted',
}
const shiftMonth = (p: string, n: number) => {
  const d = new Date(`${p}T12:00:00Z`)
  d.setUTCMonth(d.getUTCMonth() + n)
  return d.toISOString().slice(0, 7) + '-01'
}

export default function PlanningPage() {
  const { can } = useAuth()
  const qc = useQueryClient()
  const canEdit = can('rh')
  const [period, setPeriod] = useState(currentPeriod())
  const [open, setOpen] = useState(false)
  const [sel, setSel] = useState<string[]>([])
  const [pattern, setPattern] = useState('J,J,N,N,R,R')
  const [offset, setOffset] = useState('0')
  const employees = useEmployees()
  const { start, end } = monthBounds(period.slice(0, 7))
  const days = useMemo(() => {
    const n = Number(end.slice(8, 10))
    return Array.from({ length: n }, (_, i) => `${period.slice(0, 7)}-${String(i + 1).padStart(2, '0')}`)
  }, [period, end])

  const types = useQuery({
    queryKey: ['shift_types'],
    queryFn: async () => unwrap(await db.from('shift_types').select('*').eq('is_active', true).order('sort_order')) as ShiftType[],
  })
  const plan = useQuery({
    queryKey: ['shift_assignments', period],
    queryFn: async () => unwrap(await db.from('shift_assignments').select('employee_id, work_date, shift_code').gte('work_date', start).lte('work_date', end)) as Assign[],
  })
  const map = useMemo(() => new Map((plan.data ?? []).map((a) => [`${a.employee_id}|${a.work_date}`, a.shift_code])), [plan.data])
  const staff = (employees.data ?? []).filter((e) => e.status === 'Active')
  const codes = (types.data ?? []).map((t) => t.code)

  const refresh = () => qc.invalidateQueries({ queryKey: ['shift_assignments'] })
  const setCell = useMutation({
    mutationFn: async (v: { employee_id: string; work_date: string; code: string | null }) => {
      if (v.code === null) return unwrap(await db.from('shift_assignments').delete().eq('employee_id', v.employee_id).eq('work_date', v.work_date))
      return unwrap(await db.from('shift_assignments').upsert({ employee_id: v.employee_id, work_date: v.work_date, shift_code: v.code }, { onConflict: 'employee_id,work_date' }))
    },
    onSuccess: refresh,
  })
  const generate = useMutation({
    mutationFn: async () => unwrap(await dataApi.rpc('generate_rotation' as never, {
      p_employee_ids: sel, p_from: start, p_to: end,
      p_pattern: pattern.split(',').map((x) => x.trim().toUpperCase()).filter(Boolean), p_offset: Number(offset) || 0,
    } as never)),
    onSuccess: () => { setOpen(false); refresh() },
  })

  const onCell = (employee_id: string, work_date: string) => {
    if (!canEdit || !codes.length) return
    const cur = map.get(`${employee_id}|${work_date}`)
    const i = cur ? codes.indexOf(cur) : -1
    setCell.mutate({ employee_id, work_date, code: i + 1 >= codes.length ? null : codes[i + 1] })
  }
  // effectif présent par jour (hors repos) : repère les jours ou le poste n'est pas couvert
  const covered = (d: string) => staff.filter((e) => {
    const c = map.get(`${e.id}|${d}`)
    return c && !(types.data ?? []).find((t) => t.code === c)?.is_rest
  }).length

  return (
    <>
      <PageHeader
        title="Planning des postes"
        description="Rotations et affectations par poste (gardiens 24 h/24). Cliquez une case pour changer le poste du jour."
        actions={canEdit && <Button variant="primary" icon={<Wand2 className="h-4 w-4" />} onClick={() => setOpen(true)}>Générer une rotation</Button>}
      />
      <div className="no-print mb-3 flex flex-wrap items-center gap-3">
        <Button variant="ghost" icon={<ChevronLeft className="h-4 w-4" />} aria-label="Mois précédent" onClick={() => setPeriod(shiftMonth(period, -1))} />
        <span className="min-w-40 text-center font-medium">{monthLabel(period)}</span>
        <Button variant="ghost" icon={<ChevronRight className="h-4 w-4" />} aria-label="Mois suivant" onClick={() => setPeriod(shiftMonth(period, 1))} />
        <span className="ml-auto flex flex-wrap gap-2 text-xs">
          {(types.data ?? []).map((t) => <span key={t.code} className={clsx('rounded px-2 py-0.5', TONE[t.code] ?? 'bg-paper')}>{t.code} · {t.label}</span>)}
        </span>
      </div>
      <ErrorNote error={plan.error || types.error || setCell.error} />
      {plan.isLoading || employees.isLoading ? <Spinner /> : (
        <div className="panel overflow-auto">
          <table className="w-full border-separate border-spacing-0 text-xs tabular-nums">
            <thead>
              <tr>
                <th className="sticky left-0 top-0 z-10 min-w-48 border-b border-line bg-paper px-3 py-2 text-left">Salarié</th>
                {days.map((d) => <th key={d} className="sticky top-0 border-b border-line bg-paper px-0 py-2 text-center font-medium">{Number(d.slice(8))}</th>)}
              </tr>
            </thead>
            <tbody>
              {staff.map((e) => (
                <tr key={e.id}>
                  <td className="sticky left-0 whitespace-nowrap border-b border-line/70 bg-white px-3 py-1">{e.employee_number} · {e.last_name} {e.first_name}</td>
                  {days.map((d) => {
                    const c = map.get(`${e.id}|${d}`)
                    return (
                      <td key={d} className="border-b border-line/70 p-0 text-center">
                        <button type="button" disabled={!canEdit} onClick={() => onCell(e.id, d)}
                          className={clsx('h-7 w-7 font-medium', c ? TONE[c] ?? 'bg-paper' : 'text-ink-muted/40', canEdit && 'hover:ring-1 hover:ring-river')}
                          aria-label={`${e.last_name} ${d} : ${c ?? 'non planifié'}`}>{c ?? '·'}</button>
                      </td>
                    )
                  })}
                </tr>
              ))}
              <tr>
                <td className="sticky left-0 bg-paper px-3 py-1.5 font-medium">En poste ce jour</td>
                {days.map((d) => <td key={d} className="bg-paper text-center font-medium">{covered(d) || '·'}</td>)}
              </tr>
            </tbody>
          </table>
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="Générer une rotation"
        footer={<><Button variant="ghost" onClick={() => setOpen(false)}>Annuler</Button>
          <Button variant="primary" icon={<CalendarClock className="h-4 w-4" />} loading={generate.isPending} disabled={!sel.length || !pattern.trim()} onClick={() => generate.mutate()}>Appliquer à {sel.length} salarié(s)</Button></>}>
        <p className="mb-3 text-sm text-ink-soft">Le cycle est appliqué sur tout le mois de {monthLabel(period)} et remplace le planning existant des salariés choisis.</p>
        <TextField label="Cycle (codes séparés par des virgules)" value={pattern} onChange={(e) => setPattern(e.target.value)}
          hint="Exemples : J,J,N,N,R,R (2 jours, 2 nuits, 2 repos) · M,A,NT,R (3×8)" />
        <TextField className="mt-3" label="Décalage de départ" type="number" min={0} value={offset} onChange={(e) => setOffset(e.target.value)}
          hint="Position dans le cycle le 1er du mois (0 = début). Décalez les équipes pour couvrir 24 h/24." />
        <SelectField className="mt-3" label="Salariés (Ctrl/Cmd pour en choisir plusieurs)" multiple size={8} value={sel}
          onChange={(e) => setSel(Array.from(e.target.selectedOptions).map((o) => o.value))}>
          {staff.map((e) => <option key={e.id} value={e.id}>{e.employee_number} · {e.last_name} {e.first_name}</option>)}
        </SelectField>
        <div className="mt-3"><ErrorNote error={generate.error} /></div>
      </Modal>
    </>
  )
}
