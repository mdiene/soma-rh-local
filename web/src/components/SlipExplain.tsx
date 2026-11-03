import { useQuery } from '@tanstack/react-query'
import { Fragment, useState } from 'react'
import { dataApi, unwrap } from '../lib/api'
import { fcfa, pct } from '../lib/format'
import { Button, ErrorNote, Section, Spinner } from './ui'

/** Détail d'un bulletin pour la paie et la RH : montant, cumul annuel par rubrique, coût employeur, et « expliquer ce montant ». */

type Line = {
  code: string; label: string; section: string
  base: number | null; quantity: number | null; rate: number | null; employer_rate: number | null
  gain: number; deduction: number; employer: number
  ytd_gain: number; ytd_deduction: number; ytd_employer: number
}
type Explained = { gross_pay: number; net_pay: number; employer_charges: number; payroll_cost: number; lines: Line[] }

const SECTION: Record<string, string> = { gain: 'Gains', indemnite: 'Indemnités', retenue: 'Retenues', patronal: 'Charges patronales' }

/** Reconstitue le calcul à partir de la base, de la quantité et du taux stockés sur la ligne. */
function explainLine(l: Line): string {
  const amount = Number(l.gain) || Number(l.deduction) || Number(l.employer) || 0
  const rate = l.section === 'patronal' ? Number(l.employer_rate) : Number(l.rate)
  const base = Number(l.base), qty = Number(l.quantity)
  const close = (v: number) => Math.abs(v - amount) < 1
  if (base && qty && rate && close(base * qty * rate)) return `${fcfa(base)} (taux horaire ou base) × ${qty} (quantité) × ${pct(rate)} (taux) = ${fcfa(amount)}`
  if (base && rate && close(base * rate)) return `${fcfa(base)} (base) × ${pct(rate)} (taux) = ${fcfa(amount)}`
  if (base && qty && close(base * qty)) return `${fcfa(base)} × ${qty} = ${fcfa(amount)}`
  if (base) return `Calculé à partir d’une base de ${fcfa(base)} selon le barème, le plafond ou l’arrondi applicable : ${fcfa(amount)}`
  return `Montant de ${fcfa(amount)} saisi ou issu d’un calcul d’ensemble (pas de base détaillée)`
}

export function SlipExplain({ slipId }: { slipId: string }) {
  const [open, setOpen] = useState<string | null>(null)
  const q = useQuery({
    queryKey: ['slip-explained', slipId],
    queryFn: async () => unwrap(await dataApi.rpc('salary_slip_explained' as never, { p_slip_id: slipId } as never)) as unknown as Explained | null,
  })
  if (q.isLoading) return <Spinner />
  if (!q.data) return <ErrorNote error={q.error ?? 'Détail indisponible'} />
  const { lines } = q.data
  const groups = ['gain', 'indemnite', 'retenue', 'patronal'].map((s) => ({ s, rows: lines.filter((l) => l.section === s) })).filter((g) => g.rows.length)
  return (
    <Section title="Détail, cumuls annuels et coût employeur" className="no-print mt-6">
      <div className="grid gap-3 sm:grid-cols-4 text-sm tabular-nums">
        {([['Brut', q.data.gross_pay], ['Net à payer', q.data.net_pay], ['Charges patronales', q.data.employer_charges], ['Coût total employeur', q.data.payroll_cost]] as const).map(([label, v]) => (
          <div key={label} className="rounded-lg border border-line p-3"><p className="text-xs text-ink-muted">{label}</p><p className="text-lg font-semibold">{fcfa(v)}</p></div>
        ))}
      </div>
      {groups.map((g) => (
        <table key={g.s} className="mt-5 w-full text-sm tabular-nums">
          <caption className="pb-1 text-left text-xs font-semibold uppercase tracking-wide text-ink-soft">{SECTION[g.s]}</caption>
          <thead><tr className="border-b border-line text-left text-xs text-ink-muted"><th className="py-1">Rubrique</th><th className="text-right">Ce mois</th><th className="text-right">Cumul de l’année</th><th /></tr></thead>
          <tbody>
            {g.rows.map((l) => {
              const mois = g.s === 'patronal' ? l.employer : g.s === 'retenue' ? l.deduction : l.gain
              const cumul = g.s === 'patronal' ? l.ytd_employer : g.s === 'retenue' ? l.ytd_deduction : l.ytd_gain
              const key = `${l.code}-${g.s}`
              return (
                <Fragment key={key}>
                  <tr className="border-b border-line/60">
                    <td className="py-1.5">{l.label}</td><td className="text-right">{fcfa(mois)}</td><td className="text-right">{fcfa(cumul)}</td>
                    <td className="text-right"><Button size="sm" variant="ghost" onClick={() => setOpen(open === key ? null : key)}>{open === key ? 'Masquer' : 'Expliquer'}</Button></td>
                  </tr>
                  {open === key && <tr><td colSpan={4} className="bg-paper-dark px-3 py-2 text-xs text-ink-soft">{explainLine(l)}</td></tr>}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      ))}
      <p className="mt-3 text-xs text-ink-muted">Le cumul de l’année additionne ce bulletin et les bulletins validés des mois précédents.</p>
    </Section>
  )
}
