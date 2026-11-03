import { useQuery } from '@tanstack/react-query'
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { dataApi, unwrap } from '../lib/api'
import { fcfa, monthLabel } from '../lib/format'
import { PayrollForecast } from '../components/PayrollForecast'
import { ErrorNote, Figure, PageHeader, Section, Spinner } from '../components/ui'

type Analytics = {
  headcount: number; by_contract: Record<string, number>; by_gender: Record<string, number>; by_staff_status: Record<string, number>
  by_designation: { label: string; n: number }[]
  ages: { lt30: number; a30_39: number; a40_49: number; ge50: number; unknown: number; average: number | null }
  seniority: { lt1: number; y1_2: number; y3_4: number; y5_9: number; ge10: number; average: number | null }
  movements: { period: string; entries: number; exits: number }[]
  turnover_pct: number; contracts_ending_90d: number
  attendance: { period: string; recorded: number; absent_days: number; sick_days: number; leave_days: number; overtime_hours: number }[]
  payroll_last_month: { period: string | null; rows: { staff_status: string | null; employment_type: string; slips: number; gross: number; net: number; cost: number }[] }
}

const GENDER: Record<string, string> = { M: 'Hommes', F: 'Femmes', '?': 'Non renseigné' }
const short = (p: string) => `${p.slice(5)}/${p.slice(2, 4)}`

function Bars({ items, total }: { items: [string, number][]; total: number }) {
  return (
    <ul className="space-y-1.5 text-sm">
      {items.map(([k, n]) => (
        <li key={k}>
          <div className="flex justify-between"><span>{k}</span><span className="tabular-nums text-ink-soft">{n} · {total ? Math.round((100 * n) / total) : 0} %</span></div>
          <div className="h-1.5 rounded bg-paper"><div className="h-1.5 rounded bg-river" style={{ width: `${total ? (100 * n) / total : 0}%` }} /></div>
        </li>
      ))}
    </ul>
  )
}

/** Pilotage RH : effectifs, structure, mouvements, absentéisme et coût du dernier mois validé. */
export default function PilotagePage() {
  const q = useQuery({
    queryKey: ['hr_analytics'],
    queryFn: async () => unwrap(await dataApi.rpc('hr_analytics' as never, { p_months: 12 } as never)) as unknown as Analytics,
  })
  if (q.isLoading) return <Spinner />
  const d = q.data
  if (!d) return <ErrorNote error={q.error} />

  const att = d.attendance.map((a) => ({
    period: short(a.period),
    'Absences (%)': a.recorded ? Math.round((1000 * (a.absent_days + a.sick_days)) / a.recorded) / 10 : null,
    'Heures sup.': Number(a.overtime_hours),
  }))
  const mov = d.movements.map((m) => ({ period: short(m.period), Entrées: m.entries, Sorties: m.exits }))
  const pay = d.payroll_last_month
  const sum = (k: 'gross' | 'net' | 'cost') => pay.rows.reduce((s, r) => s + Number(r[k]), 0)
  const hasAtt = d.attendance.some((a) => a.recorded > 0)

  return (
    <>
      <PageHeader title="Pilotage RH" description="Effectifs, structure, mouvements et absentéisme sur 12 mois, coût du dernier mois validé." />
      <div className="panel mb-6 grid grid-cols-2 gap-x-6 gap-y-4 p-4 sm:grid-cols-4">
        <Figure label="Effectif actif" value={d.headcount} />
        <Figure label="Âge moyen" value={d.ages.average ? `${d.ages.average} ans` : '—'} />
        <Figure label="Ancienneté moyenne" value={d.seniority.average != null ? `${d.seniority.average} an(s)` : '—'} />
        <Figure label="Rotation sur 12 mois" value={`${d.turnover_pct} %`} />
      </div>

      <div className="mb-6 grid gap-6 lg:grid-cols-3">
        <Section title="Contrats"><Bars total={d.headcount} items={Object.entries(d.by_contract)} /></Section>
        <Section title="Catégories"><Bars total={d.headcount} items={Object.entries(d.by_staff_status)} /></Section>
        <Section title="Répartition par sexe"><Bars total={d.headcount} items={Object.entries(d.by_gender).map(([k, n]) => [GENDER[k] ?? k, n])} /></Section>
        <Section title="Tranches d’âge"><Bars total={d.headcount} items={[['Moins de 30 ans', d.ages.lt30], ['30 à 39 ans', d.ages.a30_39], ['40 à 49 ans', d.ages.a40_49], ['50 ans et plus', d.ages.ge50], ['Non renseigné', d.ages.unknown]].filter(([, n]) => Number(n) > 0) as [string, number][]} /></Section>
        <Section title="Ancienneté"><Bars total={d.headcount} items={[['Moins d’un an', d.seniority.lt1], ['1 à 2 ans', d.seniority.y1_2], ['3 à 4 ans', d.seniority.y3_4], ['5 à 9 ans', d.seniority.y5_9], ['10 ans et plus', d.seniority.ge10]].filter(([, n]) => Number(n) > 0) as [string, number][]} /></Section>
        <Section title="Emplois (effectif)"><Bars total={d.headcount} items={d.by_designation.slice(0, 8).map((x) => [x.label, x.n])} /></Section>
      </div>

      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <Section title="Entrées et sorties par mois">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={mov}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="period" fontSize={11} /><YAxis allowDecimals={false} fontSize={11} /><Tooltip /><Legend />
                <Bar dataKey="Entrées" fill="#1F6F8B" /><Bar dataKey="Sorties" fill="#C2410C" /></BarChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-2 text-xs text-ink-muted">{d.contracts_ending_90d} contrat(s) arrivent à échéance sous 90 jours.</p>
        </Section>
        <Section title="Absentéisme et heures supplémentaires">
          {hasAtt ? (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={att}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="period" fontSize={11} /><YAxis fontSize={11} /><Tooltip /><Legend />
                  <Line type="monotone" dataKey="Absences (%)" stroke="#C2410C" connectNulls /><Line type="monotone" dataKey="Heures sup." stroke="#1F6F8B" /></LineChart>
              </ResponsiveContainer>
            </div>
          ) : <p className="text-sm text-ink-muted">Aucune présence enregistrée sur la période.</p>}
          <p className="mt-2 text-xs text-ink-muted">Absences = jours d’absence et de maladie rapportés aux jours de présence saisis.</p>
        </Section>
      </div>

      <Section title={pay.period ? `Coût du personnel — ${monthLabel(pay.period)} (bulletins validés)` : 'Coût du personnel'}>
        {pay.rows.length === 0 ? <p className="text-sm text-ink-muted">Aucun bulletin validé.</p> : (
          <table className="w-full text-sm">
            <thead><tr className="table-head"><th className="px-2 py-1.5">Catégorie</th><th className="px-2 py-1.5">Contrat</th><th className="px-2 py-1.5 text-right">Bulletins</th><th className="px-2 py-1.5 text-right">Brut</th><th className="px-2 py-1.5 text-right">Net</th><th className="px-2 py-1.5 text-right">Masse salariale</th></tr></thead>
            <tbody>{pay.rows.map((r, i) => (
              <tr key={i} className="border-b border-line/70"><td className="px-2 py-1.5">{r.staff_status ?? '—'}</td><td className="px-2 py-1.5">{r.employment_type}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{r.slips}</td><td className="px-2 py-1.5 text-right tabular-nums">{fcfa(r.gross)}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{fcfa(r.net)}</td><td className="px-2 py-1.5 text-right tabular-nums">{fcfa(r.cost)}</td></tr>
            ))}</tbody>
            <tfoot><tr className="font-semibold"><td colSpan={3} className="px-2 py-2">Total</td><td className="px-2 py-2 text-right tabular-nums">{fcfa(sum('gross'))}</td><td className="px-2 py-2 text-right tabular-nums">{fcfa(sum('net'))}</td><td className="px-2 py-2 text-right tabular-nums">{fcfa(sum('cost'))}</td></tr></tfoot>
          </table>
        )}
      </Section>

      <div className="mt-6"><PayrollForecast /></div>
    </>
  )
}
