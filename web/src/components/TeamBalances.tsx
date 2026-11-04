import { useQuery } from '@tanstack/react-query'
import { dataApi, unwrap, type ApiClient } from '../lib/api'
import type { TeamMember } from './TeamCalendar'

/** Soldes de congés de l'équipe (année en cours) : dotation, jours pris et reste, par type de congé. Les soldes bas ou négatifs sont signalés. */

const db = dataApi as unknown as ApiClient
type Row = { employee_id: string; leave_type: string; leave_type_name: string; allocated: number; taken: number; balance: number }
const n = (v: number) => Number(v).toLocaleString('fr-FR', { maximumFractionDigits: 1 })

export function TeamBalances({ members }: { members: TeamMember[] }) {
  const ids = members.map((m) => m.id)
  const rows = useQuery({
    queryKey: ['team_balances', ids],
    enabled: ids.length > 0,
    queryFn: async () => unwrap(await db.from('v_leave_balances')
      .select('employee_id, leave_type, leave_type_name, allocated, taken, balance').in('employee_id', ids)) as Row[],
  })
  const types = [...new Map((rows.data ?? []).map((r) => [r.leave_type, r.leave_type_name])).entries()].sort((a, b) => a[1].localeCompare(b[1], 'fr'))
  const get = (id: string, t: string) => (rows.data ?? []).find((r) => r.employee_id === id && r.leave_type === t)
  const tone = (r: Row | undefined) => (!r ? '' : r.balance < 0 ? 'text-red-700 font-semibold' : r.allocated > 0 && r.balance <= 2 ? 'text-amber-700 font-semibold' : '')

  return (
    <section className="panel mb-6" aria-label="Soldes de congés de l’équipe">
      <div className="border-b border-line px-4 py-3">
        <h2 className="text-base">Soldes de congés de l’équipe</h2>
        <p className="text-xs text-ink-muted">Reste = dotation de l’année − congés approuvés. Orange : 2 jours ou moins ; rouge : solde négatif.</p>
      </div>
      {rows.isLoading ? <p className="p-4 text-sm text-ink-muted">Chargement…</p>
        : rows.error ? <p role="alert" className="p-4 text-sm text-red-700">{(rows.error as Error).message}</p>
        : types.length === 0 ? <p className="p-4 text-sm text-ink-muted">Aucune dotation de congés enregistrée pour cette équipe.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-ink-muted">
                  <th className="px-4 py-2 font-semibold" scope="col">Salarié</th>
                  {types.map(([code, name]) => <th key={code} className="px-3 py-2 text-right font-semibold" scope="col">{name}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-line/70">
                {members.map((m) => (
                  <tr key={m.id}>
                    <th scope="row" className="px-4 py-2 text-left font-medium">{m.name}</th>
                    {types.map(([code]) => {
                      const r = get(m.id, code)
                      return (
                        <td key={code} className={`px-3 py-2 text-right tabular-nums ${tone(r)}`} title={r ? `Dotation ${n(r.allocated)} j · pris ${n(r.taken)} j` : undefined}>
                          {r ? <>{n(r.balance)} j<span className="block text-[11px] font-normal text-ink-muted">sur {n(r.allocated)}</span></> : '—'}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
    </section>
  )
}
