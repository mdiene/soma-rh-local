import { useQuery } from '@tanstack/react-query'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { dataApi, unwrap } from '../lib/api'
import { fcfa, MONTHS, MONTHS_SHORT } from '../lib/format'
import { ErrorNote, Spinner } from './ui'

/** Agrégats renvoyés par hr_dashboard_year (traitements validés uniquement). */
export type YearAgg = {
  gross: number; net: number; income_tax: number; trimf: number; employee_deductions: number; net_deductions: number
  ipres_rg: number; ipres_rc: number; css: number; cfce: number; employer_charges: number
  leave_provision: number; precarity_provision: number; payroll_cost: number; slips: number; employees: number
}
type YearData = {
  year: number
  totals: YearAgg & { months: number }
  months: (YearAgg & { period: string })[]
  pending_slips: number
}

function useYearDashboard(year: number) {
  return useQuery({
    queryKey: ['dashboard-year', year],
    queryFn: async () => unwrap(await dataApi.rpc('hr_dashboard_year', { p_year: year })) as unknown as YearData,
    placeholderData: (prev) => prev, // garde l'affichage précédent pendant le changement d'année
  })
}

const CARDS: { key: keyof YearAgg; label: string; tone?: 'river' | 'signal' | 'ink' | 'phosphate' }[] = [
  { key: 'gross', label: 'Salaires bruts', tone: 'river' },
  { key: 'net', label: 'Nets à payer', tone: 'river' },
  { key: 'employee_deductions', label: 'Retenues salariales', tone: 'signal' },
  { key: 'ipres_rg', label: 'IPRES régime général', tone: 'ink' },
  { key: 'ipres_rc', label: 'IPRES régime cadres', tone: 'ink' },
  { key: 'trimf', label: 'TRIMF', tone: 'signal' },
  { key: 'css', label: 'CSS (prest. familiales + AT)', tone: 'ink' },
  { key: 'cfce', label: 'CFCE', tone: 'ink' },
  { key: 'employer_charges', label: 'Charges patronales', tone: 'ink' },
  { key: 'leave_provision', label: 'Provisions congés', tone: 'phosphate' },
  { key: 'precarity_provision', label: 'Provisions précarité', tone: 'phosphate' },
]
const EDGE = { river: 'border-l-river', signal: 'border-l-signal', ink: 'border-l-ink', phosphate: 'border-l-phosphate' }

/**
 * Section « Synthèse annuelle — AAAA » : cartes, évolution mensuelle et récapitulatif.
 * `compact` (vue mensuelle) replie le tableau récapitulatif.
 */
export function AnnualSynthesis({ year, compact }: { year: number; compact?: boolean }) {
  const q = useYearDashboard(year)
  const d = q.data
  return (
    <section className="panel" aria-labelledby="synthese-annuelle">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-4 py-3">
        <h2 id="synthese-annuelle" className="text-lg">Synthèse annuelle — {year}</h2>
        <p className="text-xs text-ink-muted">Traitements validés uniquement, janvier à décembre{q.isFetching && d ? ' · actualisation…' : ''}</p>
      </div>
      <div className="space-y-5 p-4">
        <ErrorNote error={q.error} />
        {!d ? <Spinner /> : d.totals.slips === 0 ? (
          <p className="text-sm text-ink-soft">
            Aucun traitement validé en {year}.{d.pending_slips > 0 && ` ${d.pending_slips} bulletin(s) sont calculés mais pas encore validés : ils apparaîtront ici après validation.`}
          </p>
        ) : (
          <>
            <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
              <div>
                <p className="text-xs text-ink-muted">Masse salariale annuelle</p>
                <p className="num text-3xl font-bold" style={{ fontStretch: '78%' }}>{fcfa(d.totals.payroll_cost)} F CFA</p>
              </div>
              <p className="text-sm text-ink-soft">
                <span className="num font-semibold text-ink">{d.totals.slips}</span> bulletins validés ·{' '}
                <span className="num font-semibold text-ink">{d.totals.employees}</span> salariés concernés ·{' '}
                <span className="num font-semibold text-ink">{d.totals.months}</span> mois validé(s)
                {d.pending_slips > 0 && <span className="text-ink-muted"> · {d.pending_slips} bulletin(s) en attente de validation, non comptés</span>}
              </p>
            </div>

            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
              {CARDS.map((c) => (
                <div key={c.key} className={`rounded border border-line border-l-4 bg-white px-3 py-2 ${EDGE[c.tone ?? 'ink']}`}>
                  <dt className="text-xs text-ink-muted">{c.label}</dt>
                  <dd className="num mt-0.5 text-lg font-semibold" style={{ fontStretch: '85%' }}>{fcfa(d.totals[c.key])}</dd>
                </div>
              ))}
            </dl>

            <MonthlyChart months={d.months} />

            {compact ? (
              <details className="group">
                <summary className="cursor-pointer text-sm font-medium text-river hover:underline">Voir le récapitulatif mois par mois</summary>
                <div className="mt-3"><MonthlyTable d={d} /></div>
              </details>
            ) : <MonthlyTable d={d} />}
          </>
        )}
      </div>
    </section>
  )
}

/** Barres empilées : chaque franc de la masse salariale du mois (même lecture que la barre du mois). */
function MonthlyChart({ months }: { months: YearData['months'] }) {
  const data = months.map((m) => ({
    label: MONTHS_SHORT[Number(m.period.slice(5, 7)) - 1],
    net: m.net,
    retenues: m.employee_deductions + m.net_deductions,
    patronal: m.employer_charges,
    total: m.payroll_cost,
  }))
  return (
    <figure>
      <figcaption className="mb-2 text-sm text-ink-soft">Masse salariale validée par mois (F CFA)</figcaption>
      <div className="h-56">
        <ResponsiveContainer>
          <BarChart data={data} barCategoryGap="22%">
            <CartesianGrid stroke="#DCE1DE" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#6B7A84' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: '#6B7A84' }} axisLine={false} tickLine={false} width={48}
              tickFormatter={(v: number) => (v === 0 ? '0' : `${(v / 1e6).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} M`)} />
            <Tooltip formatter={(v: number, name: string) => [`${fcfa(v)} F`, name]} cursor={{ fill: '#F1F7F6' }} />
            <Legend iconType="square" wrapperStyle={{ fontSize: 12 }} />
            <Bar isAnimationActive={false} dataKey="net" name="Net à payer" stackId="m" fill="#0F6E6A" />
            <Bar isAnimationActive={false} dataKey="retenues" name="Retenues salariales et diverses" stackId="m" fill="#3A4A55" />
            <Bar isAnimationActive={false} dataKey="patronal" name="Charges patronales" stackId="m" fill="#E0B000" radius={[2, 2, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </figure>
  )
}

function MonthlyTable({ d }: { d: YearData }) {
  const cols: { key: keyof YearAgg; label: string }[] = [
    { key: 'gross', label: 'Brut' }, { key: 'employee_deductions', label: 'Retenues' }, { key: 'net', label: 'Net à payer' },
    { key: 'ipres_rg', label: 'IPRES RG' }, { key: 'ipres_rc', label: 'IPRES RC' }, { key: 'trimf', label: 'TRIMF' },
    { key: 'css', label: 'CSS' }, { key: 'cfce', label: 'CFCE' }, { key: 'employer_charges', label: 'Charges patr.' },
    { key: 'leave_provision', label: 'Prov. congés' }, { key: 'precarity_provision', label: 'Prov. précarité' },
    { key: 'payroll_cost', label: 'Masse salariale' },
  ]
  const rows = d.months.filter((m) => m.slips > 0)
  return (
    <div className="overflow-x-auto rounded border border-line">
      <table className="w-full min-w-[60rem] border-collapse text-sm">
        <thead>
          <tr className="table-head">
            <th className="px-2 py-1.5">Mois</th>
            <th className="px-2 py-1.5 text-right">Bulletins</th>
            {cols.map((c) => <th key={c.key} className="whitespace-nowrap px-2 py-1.5 text-right">{c.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((m) => (
            <tr key={m.period} className="border-b border-line/70">
              <td className="px-2 py-1.5 font-medium">{MONTHS[Number(m.period.slice(5, 7)) - 1]}</td>
              <td className="px-2 py-1.5 text-right">{m.slips}</td>
              {cols.map((c) => <td key={c.key} className="whitespace-nowrap px-2 py-1.5 text-right">{fcfa(m[c.key])}</td>)}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-ink/20 bg-paper font-semibold">
            <td className="whitespace-nowrap px-2 py-1.5">Total {d.year}</td>
            <td className="px-2 py-1.5 text-right">{d.totals.slips}</td>
            {cols.map((c) => <td key={c.key} className="whitespace-nowrap px-2 py-1.5 text-right">{fcfa(d.totals[c.key])}</td>)}
          </tr>
        </tfoot>
      </table>
    </div>
  )
}
