import { useMutation } from '@tanstack/react-query'
import { Calculator, Target } from 'lucide-react'
import { useState } from 'react'
import { dataApi, unwrap } from '../lib/api'
import { useEmployees } from '../lib/queries'
import { currentPeriod, fcfa, monthBounds, num, pct } from '../lib/format'
import { Button, ErrorNote, Figure, PageHeader, Section, SelectField, TextField } from '../components/ui'

type Line = { code: string; label: string; section: string; sort: number; base?: number; quantity?: number; rate?: number; gain?: number; deduction?: number; employer_rate?: number; employer?: number }
type Calc = { lines: Line[]; totals: Record<string, number>; income_tax_detail?: Record<string, number> | null; inputs: Record<string, unknown> }

/**
 * Simulation sans enregistrement : calcule un bulletin avec un sursalaire libre,
 * ou retrouve le sursalaire qui donne un net cible (macro Valeur_Cible du classeur).
 */
export default function SimulatorPage() {
  const employees = useEmployees()
  const [employeeId, setEmployeeId] = useState('')
  const [period, setPeriod] = useState(currentPeriod())
  const [sursalaire, setSursalaire] = useState('')
  const [target, setTarget] = useState('')
  const { start, end } = monthBounds(period)

  const simulate = useMutation({
    mutationFn: async (override?: number) => unwrap(await dataApi.rpc('compute_salary_slip', {
      p_employee_id: employeeId, p_period_start: start, p_period_end: end,
      ...(override !== undefined ? { p_sursalaire: override } : sursalaire !== '' ? { p_sursalaire: Number(sursalaire) } : {}),
    })) as unknown as Calc,
  })
  const solve = useMutation({
    mutationFn: async () => Number(unwrap(await dataApi.rpc('solve_sursalaire_for_net', { p_employee_id: employeeId, p_period_start: start, p_period_end: end, p_target_net: Number(target) }))),
    onSuccess: (v) => { setSursalaire(String(Math.round(v * 100) / 100)); simulate.mutate(v) },
  })

  const c = simulate.data
  const t = c?.totals
  return (
    <>
      <PageHeader title="Simulateur net / brut" description="Testez une rémunération sans rien enregistrer : brut, cotisations, impôt et net à payer sont calculés par le même moteur que la paie." />
      <div className="grid gap-6 lg:grid-cols-[22rem_1fr]">
        <Section title="Paramètres">
          <div className="space-y-3">
            <SelectField label="Salarié" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
              <option value="">Choisir…</option>
              {(employees.data ?? []).filter((e) => e.status === 'Active').map((e) => <option key={e.id} value={e.id}>{e.employee_number} — {e.first_name} {e.last_name}</option>)}
            </SelectField>
            <TextField label="Mois" type="month" value={period.slice(0, 7)} onChange={(e) => setPeriod(`${e.target.value}-01`)} />
            <TextField label="Sursalaire (vide = valeur actuelle)" type="number" value={sursalaire} onChange={(e) => setSursalaire(e.target.value)} />
            <Button variant="primary" className="w-full" icon={<Calculator className="h-4 w-4" />} disabled={!employeeId} loading={simulate.isPending} onClick={() => simulate.mutate(undefined)}>Simuler le bulletin</Button>
            <hr className="border-line" />
            <TextField label="Net à payer souhaité (F CFA)" type="number" value={target} onChange={(e) => setTarget(e.target.value)} />
            <Button className="w-full" icon={<Target className="h-4 w-4" />} disabled={!employeeId || !target} loading={solve.isPending} onClick={() => solve.mutate()}>Trouver le sursalaire</Button>
            {solve.isSuccess && <p className="text-sm text-river-dark">Sursalaire nécessaire : <strong>{num(solve.data)}</strong> F</p>}
            <ErrorNote error={simulate.error || solve.error} />
          </div>
        </Section>

        <div className="space-y-6">
          {!c ? (
            <p className="panel px-4 py-6 text-sm text-ink-soft">Choisissez un salarié puis lancez la simulation.</p>
          ) : (
            <>
              <div className="panel grid grid-cols-2 gap-4 p-4 sm:grid-cols-4">
                <Figure label="Brut" value={`${fcfa(t!.gross_pay)} F`} />
                <Figure label="Retenues salariales" value={`${fcfa(t!.total_employee_deductions)} F`} />
                <Figure label="Net à payer" value={`${fcfa(t!.net_pay)} F`} />
                <Figure label="Coût employeur" value={`${fcfa(t!.payroll_cost)} F`} />
              </div>
              {c.income_tax_detail && (
                <Section title="Détail de l'impôt sur le revenu">
                  <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
                    <div><dt className="text-ink-muted">Brut annuel</dt><dd className="num">{fcfa(c.income_tax_detail.annual_gross)} F</dd></div>
                    <div><dt className="text-ink-muted">Revenu imposable (après abattement, arrondi)</dt><dd className="num">{fcfa(c.income_tax_detail.taxable_income)} F</dd></div>
                    <div><dt className="text-ink-muted">Impôt brut annuel</dt><dd className="num">{fcfa(c.income_tax_detail.gross_tax)} F</dd></div>
                    <div><dt className="text-ink-muted">Réduction pour charges de famille</dt><dd className="num">{fcfa(c.income_tax_detail.family_reduction)} F</dd></div>
                    <div><dt className="text-ink-muted">Impôt annuel dû</dt><dd className="num">{fcfa(c.income_tax_detail.annual_tax)} F</dd></div>
                    <div><dt className="text-ink-muted">IR mensuel</dt><dd className="num font-semibold">{num(c.income_tax_detail.monthly_tax)} F</dd></div>
                  </dl>
                </Section>
              )}
              <div className="panel overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="table-head"><th className="px-2 py-1.5">N°</th><th className="px-2 py-1.5">Rubrique</th><th className="px-2 py-1.5 text-right">Base</th><th className="px-2 py-1.5 text-right">Nombre</th><th className="px-2 py-1.5 text-right">Taux</th><th className="px-2 py-1.5 text-right">Gain</th><th className="px-2 py-1.5 text-right">Retenue</th><th className="px-2 py-1.5 text-right">Patronal</th></tr></thead>
                  <tbody>
                    {[...c.lines].sort((a, b) => a.sort - b.sort).map((l) => (
                      <tr key={l.code} className="border-b border-line/70">
                        <td className="px-2 py-1 text-ink-muted">{l.sort}</td>
                        <td className="px-2 py-1">{l.label}</td>
                        <td className="px-2 py-1 text-right">{l.base ? num(l.base) : ''}</td>
                        <td className="px-2 py-1 text-right">{l.quantity ? num(l.quantity) : ''}</td>
                        <td className="px-2 py-1 text-right">{l.rate ? pct(l.rate) : ''}</td>
                        <td className="px-2 py-1 text-right">{l.gain ? num(l.gain) : ''}</td>
                        <td className="px-2 py-1 text-right">{l.deduction ? num(l.deduction) : ''}</td>
                        <td className="px-2 py-1 text-right">{l.employer ? num(l.employer) : ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  )
}
