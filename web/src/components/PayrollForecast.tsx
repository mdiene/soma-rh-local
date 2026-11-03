import { useQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { dataApi, unwrap } from '../lib/api'
import { fcfa, monthLabel } from '../lib/format'
import { ErrorNote, Section, SelectField, Spinner, TextField } from './ui'

type Base = { employee_id: string; cost: number; employment_type: string; contract_end: string | null; relieving_date: string | null }

const addMonths = (iso: string, n: number) => {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCMonth(d.getUTCMonth() + n)
  return d.toISOString().slice(0, 7) + '-01'
}

/**
 * Prévision de la masse salariale (coût employeur) : part du dernier mois validé et applique
 * les échéances de contrats, une augmentation générale et des recrutements. Estimation :
 * les éléments variables (heures supplémentaires, primes ponctuelles, indemnités de fin de contrat) ne sont pas projetés.
 */
export function PayrollForecast() {
  const [horizon, setHorizon] = useState('12')
  const [renew, setRenew] = useState('non')
  const [raisePct, setRaisePct] = useState('0')
  const [raiseIn, setRaiseIn] = useState('3')
  const [hires, setHires] = useState('0')
  const [hireIn, setHireIn] = useState('2')

  const q = useQuery({
    queryKey: ['forecast-base'],
    queryFn: async () => {
      const last = unwrap(await dataApi.from('salary_slips').select('period_start').eq('status', 'Validé').order('period_start', { ascending: false }).limit(1))
      const period = last[0]?.period_start as string | undefined
      if (!period) return { period: null as string | null, rows: [] as Base[] }
      const slips = unwrap(await dataApi.from('salary_slips').select('employee_id, payroll_cost, employment_type').eq('status', 'Validé').eq('period_start', period))
      const emps = unwrap(await dataApi.from('employees').select('id, contract_end, relieving_date, status').in('id', slips.map((s) => s.employee_id)))
      const byId = new Map(emps.map((e) => [e.id, e]))
      return {
        period,
        rows: slips.map((s) => ({
          employee_id: s.employee_id, cost: Number(s.payroll_cost), employment_type: s.employment_type ?? '',
          contract_end: byId.get(s.employee_id)?.contract_end ?? null, relieving_date: byId.get(s.employee_id)?.relieving_date ?? null,
        })) as Base[],
      }
    },
  })

  const data = useMemo(() => {
    if (!q.data?.period) return []
    const n = Number(horizon)
    const avg = q.data.rows.length ? q.data.rows.reduce((s, r) => s + r.cost, 0) / q.data.rows.length : 0
    const raise = (Number(raisePct.replace(',', '.')) || 0) / 100
    const out: { month: string; label: string; headcount: number; cout: number; sansChangement: number; hc0: number }[] = []
    for (let i = 1; i <= n; i++) {
      const m = addMonths(q.data.period, i)
      let hc0 = 0, cost0 = 0, hc = 0, cost = 0
      for (const r of q.data.rows) {
        const left = r.relieving_date && r.relieving_date < m
        if (left) continue
        hc0 += 1; cost0 += r.cost
        const ended = r.employment_type !== 'CDI' && r.contract_end && r.contract_end < m
        if (ended && renew === 'non') continue
        hc += 1
        cost += r.cost * (i >= Number(raiseIn) ? 1 + raise : 1)
      }
      const nh = i >= Number(hireIn) ? Number(hires) || 0 : 0
      hc += nh
      cost += nh * avg * (i >= Number(raiseIn) ? 1 + raise : 1)
      out.push({ month: m, label: monthLabel(m).slice(0, 3) + '. ' + m.slice(2, 4), headcount: hc, cout: Math.round(cost), sansChangement: Math.round(cost0), hc0 })
    }
    return out
  }, [q.data, horizon, renew, raisePct, raiseIn, hires, hireIn])

  const total = data.reduce((s, d) => s + d.cout, 0)
  const total0 = data.reduce((s, d) => s + d.sansChangement, 0)

  return (
    <Section title="Prévision de la masse salariale">
      <ErrorNote error={q.error} />
      {q.isLoading ? <Spinner /> : !q.data?.period ? <p className="text-sm text-ink-muted">Aucun bulletin validé : la prévision part du dernier mois validé.</p> : (
        <>
          <p className="mb-3 text-xs text-ink-muted">Point de départ : coût employeur de {monthLabel(q.data.period)} ({q.data.rows.length} bulletins validés). Estimation hors éléments variables (heures supplémentaires, primes ponctuelles, indemnités de fin de contrat).</p>
          <div className="mb-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <SelectField label="Horizon" value={horizon} onChange={(e) => setHorizon(e.target.value)}>
              <option value="6">6 mois</option><option value="12">12 mois</option><option value="24">24 mois</option>
            </SelectField>
            <SelectField label="CDD à échéance" value={renew} onChange={(e) => setRenew(e.target.value)}>
              <option value="non">Non renouvelés</option><option value="oui">Renouvelés</option>
            </SelectField>
            <TextField label="Augmentation générale (%)" inputMode="decimal" value={raisePct} onChange={(e) => setRaisePct(e.target.value)} />
            <TextField label="…à partir du mois n°" type="number" min={1} value={raiseIn} onChange={(e) => setRaiseIn(e.target.value)} />
            <TextField label="Recrutements (nombre)" type="number" min={0} value={hires} onChange={(e) => setHires(e.target.value)} />
            <TextField label="…à partir du mois n°" type="number" min={1} value={hireIn} onChange={(e) => setHireIn(e.target.value)} />
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="label" fontSize={11} /><YAxis fontSize={11} tickFormatter={(v) => `${Math.round(v / 1000000)} M`} /><Tooltip formatter={(v) => `${fcfa(Number(v))} F`} /><Legend />
                <Line type="monotone" dataKey="sansChangement" name="Sans changement" stroke="#8A97A1" dot={false} />
                <Line type="monotone" dataKey="cout" name="Scénario" stroke="#1F6F8B" strokeWidth={2} dot={false} /></LineChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-3 max-h-72 overflow-auto">
            <table className="w-full text-sm tabular-nums">
              <thead><tr className="table-head"><th className="px-2 py-1.5">Mois</th><th className="px-2 py-1.5 text-right">Effectif (scénario)</th><th className="px-2 py-1.5 text-right">Coût scénario</th><th className="px-2 py-1.5 text-right">Sans changement</th><th className="px-2 py-1.5 text-right">Écart</th></tr></thead>
              <tbody>{data.map((d) => (
                <tr key={d.month} className="border-b border-line/70"><td className="px-2 py-1">{monthLabel(d.month)}</td><td className="px-2 py-1 text-right">{d.headcount} <span className="text-ink-muted">({d.hc0})</span></td>
                  <td className="px-2 py-1 text-right">{fcfa(d.cout)}</td><td className="px-2 py-1 text-right">{fcfa(d.sansChangement)}</td>
                  <td className={`px-2 py-1 text-right ${d.cout - d.sansChangement < 0 ? 'text-river' : ''}`}>{d.cout - d.sansChangement >= 0 ? '+' : ''}{fcfa(d.cout - d.sansChangement)}</td></tr>
              ))}</tbody>
              <tfoot><tr className="font-semibold"><td className="px-2 py-2" colSpan={2}>Total sur {horizon} mois</td><td className="px-2 py-2 text-right">{fcfa(total)}</td><td className="px-2 py-2 text-right">{fcfa(total0)}</td><td className="px-2 py-2 text-right">{total - total0 >= 0 ? '+' : ''}{fcfa(total - total0)}</td></tr></tfoot>
            </table>
          </div>
          <p className="mt-2 text-xs text-ink-muted">Entre parenthèses : effectif si aucun changement (les CDD restent jusqu’à leur échéance, puis sont supposés renouvelés).</p>
        </>
      )}
    </Section>
  )
}
