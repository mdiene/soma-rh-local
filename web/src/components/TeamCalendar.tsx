import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, ChevronLeft, ChevronRight } from 'lucide-react'
import { useMemo, useState } from 'react'
import { dataApi, unwrap, type ApiClient } from '../lib/api'

/** Calendrier d'équipe du manager : qui est absent quand, congés à valider (en attente) et jours où la couverture est faible. */

const db = dataApi as unknown as ApiClient
export type TeamMember = { id: string; name: string }
type Leave = { id: string; employee_id: string; from_date: string; to_date: string; status: string; half_day: boolean; leave_type: string }

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const MONTH = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' })
const DAY = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })

export function TeamCalendar({ members }: { members: TeamMember[] }) {
  const [cursor, setCursor] = useState(() => { const d = new Date(); d.setDate(1); return d })
  const days = useMemo(() => {
    const n = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate()
    return Array.from({ length: n }, (_, i) => new Date(cursor.getFullYear(), cursor.getMonth(), i + 1))
  }, [cursor])
  const first = iso(days[0]); const last = iso(days[days.length - 1]); const today = iso(new Date())
  const ids = members.map((m) => m.id)

  const leaves = useQuery({
    queryKey: ['team_calendar', ids, first],
    enabled: ids.length > 0,
    queryFn: async () => unwrap(await db.from('leave_applications')
      .select('id, employee_id, from_date, to_date, status, half_day, leave_type')
      .in('employee_id', ids).in('status', ['Ouverte', 'Approuvée']).lte('from_date', last).gte('to_date', first)) as Leave[],
  })

  const cell = (id: string, day: string) => (leaves.data ?? []).find((l) => l.employee_id === id && l.from_date <= day && l.to_date >= day)
  const weekend = (d: Date) => d.getDay() === 0 || d.getDay() === 6
  const absent = (day: Date) => weekend(day) ? 0 : members.filter((m) => cell(m.id, iso(day))).length
  const low = (day: Date) => members.length >= 2 && absent(day) * 2 >= members.length
  const lowDays = days.filter(low)
  const pending = (leaves.data ?? []).filter((l) => l.status === 'Ouverte').length
  const move = (n: number) => setCursor((c) => new Date(c.getFullYear(), c.getMonth() + n, 1))

  return (
    <section className="panel mb-6" aria-label="Calendrier d’équipe">
      <div className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3">
        <h2 className="text-base">Calendrier d’équipe</h2>
        <div className="ml-auto flex items-center gap-1">
          <button type="button" className="rounded-lg border border-line p-1.5 hover:bg-paper" onClick={() => move(-1)} aria-label="Mois précédent"><ChevronLeft className="h-4 w-4" /></button>
          <span className="min-w-36 text-center text-sm font-medium capitalize">{MONTH.format(cursor)}</span>
          <button type="button" className="rounded-lg border border-line p-1.5 hover:bg-paper" onClick={() => move(1)} aria-label="Mois suivant"><ChevronRight className="h-4 w-4" /></button>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 pt-3 text-xs text-ink-muted">
        <span className="inline-flex items-center gap-1.5"><i className="inline-block h-3 w-3 rounded-sm bg-sky-600" aria-hidden />Congé approuvé</span>
        <span className="inline-flex items-center gap-1.5"><i className="inline-block h-3 w-3 rounded-sm bg-amber-300" aria-hidden />En attente de validation ({pending})</span>
        <span className="inline-flex items-center gap-1.5"><i className="inline-block h-3 w-3 rounded-sm bg-red-100 ring-1 ring-red-300" aria-hidden />Couverture faible (la moitié de l’équipe absente ou plus)</span>
      </div>
      {lowDays.length > 0 && (
        <p role="status" className="mx-4 mt-3 flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          Couverture faible : {lowDays.slice(0, 4).map((d) => DAY.format(d)).join(', ')}{lowDays.length > 4 ? ` et ${lowDays.length - 4} autre(s) jour(s)` : ''}. Vérifiez avant de valider de nouveaux congés.
        </p>
      )}
      <div className="overflow-x-auto p-4">
        {leaves.isLoading ? <p className="text-sm text-ink-muted">Chargement…</p> : (
          <table className="w-full border-separate border-spacing-0 text-xs">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 min-w-40 bg-white px-2 py-1 text-left font-semibold">Salarié</th>
                {days.map((d) => (
                  <th key={iso(d)} className={`w-7 min-w-7 px-0 py-1 text-center font-medium ${iso(d) === today ? 'text-sky-700' : 'text-ink-muted'}`} scope="col" title={DAY.format(d)}>
                    <span className="block">{d.getDate()}</span><span className="block text-[10px] uppercase">{d.toLocaleDateString('fr-FR', { weekday: 'narrow' })}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.id}>
                  <th scope="row" className="sticky left-0 z-10 truncate bg-white px-2 py-1 text-left font-medium">{m.name}</th>
                  {days.map((d) => {
                    const l = cell(m.id, iso(d))
                    const wk = weekend(d)
                    const tone = l ? (l.status === 'Approuvée' ? 'bg-sky-600' : 'bg-amber-300') : wk ? 'bg-slate-100' : 'bg-transparent'
                    return (
                      <td key={iso(d)} className="h-7 border border-line/40 p-0" title={l ? `${m.name} : ${l.status === 'Approuvée' ? 'congé approuvé' : 'en attente'} (${l.from_date} → ${l.to_date})` : undefined}>
                        <div className={`mx-auto h-full w-full ${tone} ${l?.half_day ? 'opacity-60' : ''}`} aria-label={l ? (l.status === 'Approuvée' ? 'Absent' : 'En attente') : undefined} />
                      </td>
                    )
                  })}
                </tr>
              ))}
              <tr>
                <th scope="row" className="sticky left-0 z-10 bg-white px-2 py-1 text-left font-semibold">Présents</th>
                {days.map((d) => (
                  <td key={iso(d)} className={`border border-line/40 text-center font-semibold ${weekend(d) ? 'bg-slate-100 text-ink-muted' : low(d) ? 'bg-red-100 text-red-800' : ''}`}>
                    {weekend(d) ? '·' : members.length - absent(d)}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        )}
        {leaves.error && <p role="alert" className="mt-2 text-sm text-red-700">{(leaves.error as Error).message}</p>}
      </div>
    </section>
  )
}
