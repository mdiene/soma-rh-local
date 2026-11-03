import type { Tables, Views } from '../lib/api'
import { amountInWords, date, fcfa, monthLabel, num, pct } from '../lib/format'

type Detail = Tables<'salary_slip_details'>
type Props = {
  slip: Tables<'salary_slips'>
  details: Detail[]
  ytd?: Views<'v_salary_slip_ytd'> | null
  company?: Tables<'companies'> | null
}

/**
 * Bulletin de paie — reproduit la maquette de la feuille BULLETIN du classeur Excel
 * (en-tête, rubriques gains / retenues / cotisations patronales, cumuls période et année).
 */
export function SalarySlipDocument({ slip, details, ytd, company }: Props) {
  const rows = [...details].sort((a, b) => a.sort_order - b.sort_order)
  const gains = rows.filter((d) => d.section === 'gain')
  const retenues = rows.filter((d) => d.section === 'retenue' || d.section === 'patronal')
  const after = rows.filter((d) => ['indemnite', 'retenue_net', 'appoint'].includes(d.section))
  const t = (slip.calculation as { totals?: Record<string, number> } | null)?.totals ?? {}

  return (
    <article className="slip print-area mx-auto max-w-[210mm] border border-ink/25 bg-white p-6 text-[12px] leading-snug text-ink shadow-sm">
      {/* ---------------------------------------------------------------- en-tête */}
      <header className="grid grid-cols-[1fr_auto] gap-6 border-b-2 border-ink pb-3">
        <div>
          <p className="text-[15px] font-bold" style={{ fontStretch: '80%' }}>{company?.name ?? 'SOCIETE MINIERE AFRICAINE'}</p>
          <p className="text-ink-soft">{[company?.legal_form, company?.share_capital ? `au capital de ${fcfa(company.share_capital)} F CFA` : null].filter(Boolean).join(' ')}</p>
          {company?.address && <p className="text-ink-soft">{company.address}</p>}
          {company?.phone && <p className="text-ink-soft">Tél. {company.phone}</p>}
          {company?.ninea && <p className="text-ink-soft">NINEA {company.ninea}</p>}
        </div>
        <div className="text-right">
          <h2 className="text-[22px] leading-none" style={{ fontStretch: '72%' }}>Bulletin de paie</h2>
          <p className="mt-1 font-semibold">{monthLabel(slip.period_start)}</p>
          <p className="text-ink-soft">Période du {date(slip.period_start)} au {date(slip.period_end)}</p>
          <p className="text-ink-soft">Paiement le {date(slip.period_end)} par {slip.payment_mode ?? 'espèces'}</p>
        </div>
      </header>

      {/* ------------------------------------------------------------- salarié */}
      <section className="grid grid-cols-2 gap-x-8 border-b border-ink/30 py-3">
        <dl className="grid grid-cols-[8.5rem_1fr] gap-y-0.5">
          <Row k="Matricule" v={slip.employee_number} />
          <Row k="Prénom et nom" v={<strong>{slip.employee_name}</strong>} />
          <Row k="Emploi" v={slip.designation} />
          <Row k="Adresse" v={slip.address} />
          <Row k="Date d'entrée" v={date(slip.date_of_joining)} />
          <Row k="Ancienneté" v={`${slip.seniority_years ?? 0} an(s) et ${slip.seniority_months ?? 0} mois`} />
          <Row k="Catégorie" v={[slip.grade_code, slip.grade_class].filter(Boolean).join(' — classe ')} />
          <Row k="Statut" v={slip.staff_status} />
          <Row k="Contrat" v={slip.employment_type} />
        </dl>
        <dl className="grid grid-cols-[10rem_1fr] content-start gap-y-0.5">
          <Row k="Situation de famille" v={slip.marital_status} />
          <Row k="Nombre de conjoint(e)s" v={slip.spouses_count} />
          <Row k="Nombre d'enfants" v={slip.children_count} />
          <Row k="Parts TRIMF" v={num(slip.trimf_parts, 1)} />
          <Row k="Parts IR" v={num(slip.ir_parts, 1)} />
          <Row k="Taux horaire" v={num(slip.hourly_rate)} />
        </dl>
      </section>

      {/* ----------------------------------------------------------- rubriques */}
      <table className="mt-3 w-full border-collapse">
        <thead>
          <tr className="border-y border-ink text-[11px]">
            <th rowSpan={2} className="w-8 text-left font-semibold">N°</th>
            <th rowSpan={2} className="text-left font-semibold">Désignation</th>
            <th rowSpan={2} className="text-right font-semibold">Base</th>
            <th rowSpan={2} className="text-right font-semibold">Nombre</th>
            <th colSpan={3} className="border-l border-ink/30 text-center font-semibold">Part salarié</th>
            <th colSpan={2} className="border-l border-ink/30 text-center font-semibold">Part patronale</th>
          </tr>
          <tr className="border-b border-ink text-[11px] text-ink-soft">
            <th className="border-l border-ink/30 text-right font-medium">Taux</th>
            <th className="text-right font-medium">Gains</th>
            <th className="text-right font-medium">Retenues</th>
            <th className="border-l border-ink/30 text-right font-medium">Taux</th>
            <th className="text-right font-medium">Cotisations</th>
          </tr>
        </thead>
        <tbody>
          {gains.map((d) => <Line key={d.id} d={d} />)}
          <TotalRow label="Total brut" gain={slip.gross_pay} />
          {retenues.map((d) => <Line key={d.id} d={d} />)}
          <TotalRow label="Total cotisations" deduction={slip.total_employee_deductions} employer={slip.employer_charges} />
          <TotalRow label="Rémunération nette" gain={slip.net_remuneration} strong />
          {after.map((d) => <Line key={d.id} d={d} />)}
        </tbody>
      </table>

      {/* ------------------------------------------------------------ net à payer */}
      <div className="mt-4 flex flex-wrap items-stretch justify-between gap-4">
        <table className="border-collapse text-[11px]">
          <thead>
            <tr className="border-y border-ink">
              <th className="text-left font-semibold">Cumuls</th>
              <th className="text-right font-semibold">Brut</th>
              <th className="text-right font-semibold">IR</th>
              <th className="text-right font-semibold">TRIMF</th>
              <th className="text-right font-semibold">Prov. congé</th>
              <th className="text-right font-semibold">IPRES RG</th>
              <th className="text-right font-semibold">IPRES RC</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-ink/20">
              <td>Période</td>
              <td className="text-right">{fcfa(slip.gross_pay)}</td>
              <td className="text-right">{fcfa(slip.income_tax)}</td>
              <td className="text-right">{fcfa(slip.trimf)}</td>
              <td className="text-right">{fcfa(slip.leave_provision)}</td>
              <td className="text-right">{fcfa(Number(t.ipres_rg_employee ?? 0) + Number(t.ipres_rg_employer ?? 0))}</td>
              <td className="text-right">{fcfa(Number(t.ipres_rc_employee ?? 0) + Number(t.ipres_rc_employer ?? 0))}</td>
            </tr>
            <tr className="border-b border-ink">
              <td>Année</td>
              <td className="text-right">{fcfa(ytd?.ytd_gross)}</td>
              <td className="text-right">{fcfa(ytd?.ytd_income_tax)}</td>
              <td className="text-right">{fcfa(ytd?.ytd_trimf)}</td>
              <td className="text-right">{fcfa(ytd?.ytd_leave_provision)}</td>
              <td className="text-right">{fcfa(ytd?.ytd_ipres_rg)}</td>
              <td className="text-right">{fcfa(ytd?.ytd_ipres_rc)}</td>
            </tr>
          </tbody>
        </table>

        <div className="min-w-[13rem] border-2 border-river px-4 py-2 text-right">
          <p className="text-[11px] text-ink-soft">Net à payer</p>
          <p className="num text-[24px] font-bold leading-tight text-river-dark" style={{ fontStretch: '80%' }}>{fcfa(slip.net_pay)} F CFA</p>
        </div>
      </div>
      <p className="mt-2 text-[11px] italic text-ink-soft">Arrêté le présent bulletin à la somme de {amountInWords(Number(slip.net_pay))}.</p>

      <footer className="mt-6 grid grid-cols-2 gap-8 text-[11px] text-ink-soft">
        <p>L'employeur</p>
        <p className="text-right">Signature du salarié</p>
      </footer>
      <p className="mt-8 text-[10px] text-ink-muted">
        Pour vous aider à faire valoir vos droits, conservez ce bulletin sans limitation de durée.
        {slip.status !== 'Validé' && ' — Document provisoire, traitement non validé.'}
      </p>
    </article>
  )
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <>
      <dt className="text-ink-soft">{k}</dt>
      <dd>{v ?? '—'}</dd>
    </>
  )
}

function Line({ d }: { d: Detail }) {
  const showRate = (r: number | null) => (r === null || r === undefined ? '' : r === 1 ? '100 %' : pct(r))
  return (
    <tr className="border-b border-ink/10">
      <td className="text-ink-muted">{d.sort_order}</td>
      <td>{d.label}</td>
      <td className="text-right">{d.base !== null && d.base !== 0 ? num(d.base) : ''}</td>
      <td className="text-right">{d.quantity !== null && d.quantity !== 0 ? num(d.quantity) : ''}</td>
      <td className="border-l border-ink/15 text-right">{showRate(d.employee_rate)}</td>
      <td className="text-right">{d.gain_amount !== 0 ? fcfa(d.gain_amount) : ''}</td>
      <td className="text-right">{d.deduction_amount !== 0 ? fcfa(d.deduction_amount) : d.section === 'retenue' ? '0' : ''}</td>
      <td className="border-l border-ink/15 text-right">{d.employer_rate !== null ? pct(d.employer_rate) : ''}</td>
      <td className="text-right">{d.employer_amount !== 0 ? fcfa(d.employer_amount) : ''}</td>
    </tr>
  )
}

function TotalRow({ label, gain, deduction, employer, strong }: { label: string; gain?: number; deduction?: number; employer?: number; strong?: boolean }) {
  return (
    <tr className={strong ? 'border-y-2 border-ink bg-paper font-bold' : 'border-y border-ink/60 bg-paper font-semibold'}>
      <td />
      <td>{label}</td>
      <td colSpan={3} />
      <td className="text-right">{gain !== undefined ? fcfa(gain) : ''}</td>
      <td className="text-right">{deduction !== undefined ? fcfa(deduction) : ''}</td>
      <td />
      <td className="text-right">{employer !== undefined ? fcfa(employer) : ''}</td>
    </tr>
  )
}
