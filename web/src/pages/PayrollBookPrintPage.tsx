import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Printer } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { dataApi, unwrap } from '../lib/api'
import { useCompany } from '../lib/queries'
import { date, fcfa } from '../lib/format'
import { Button, ErrorNote, Spinner } from '../components/ui'

/** Livre de paie mensuel imprimable : rubriques en lignes, salariés en colonnes (7 par page A4), total en dernière colonne. */

type Line = { code: string; label: string; section: string; sort: number; quantity?: number; gain?: number; deduction?: number }
type Slip = {
  id: string; employee_number: string; gross_pay: number; total_employee_deductions: number; employer_charges: number
  net_pay: number; payroll_cost: number; leave_provision: number | null; precarity_provision: number | null
  calculation: { lines?: Line[]; inputs?: Record<string, number> } | null
  employee: { gender: string | null; first_name: string; last_name: string } | null
}
type Rubrique = { code: string; label: string; sort: number; section: string; field: 'gain' | 'deduction' }

const PER_PAGE = 7
const SECTION_ORDER = ['gain', 'retenue', 'indemnite']

const lineOf = (s: Slip, code: string) => (s.calculation?.lines ?? []).find((l) => l.code === code)
const amountOf = (l: Line | undefined, field: 'gain' | 'deduction') => Number(l?.[field] ?? 0)
const hours = (s: Slip) => Number(lineOf(s, 'SAL_BASE')?.quantity ?? 0)
const overtime = (s: Slip) => ['overtime_15', 'overtime_40', 'overtime_60', 'overtime_100'].reduce((a, k) => a + Number(s.calculation?.inputs?.[k] ?? 0), 0)
const absence = (s: Slip) => Number(s.calculation?.inputs?.absence_hours ?? 0)

const STATS: { label: string; value: (s: Slip) => number; hours?: boolean }[] = [
  { label: 'Présence (heures)', value: hours, hours: true },
  { label: 'Brut', value: (s) => Number(s.gross_pay) },
  { label: 'Cotisations salariales', value: (s) => Number(s.total_employee_deductions) },
  { label: 'Cotisations patronales', value: (s) => Number(s.employer_charges) },
  { label: 'Net à payer', value: (s) => Number(s.net_pay) },
  { label: 'Net imposable', value: (s) => Number(s.gross_pay) },
  { label: 'Total des heures travaillées', value: hours, hours: true },
  { label: 'Total des hres supplémentaires', value: overtime, hours: true },
  { label: 'Total des heures d’absence', value: absence, hours: true },
  { label: 'Provision congé', value: (s) => Number(s.leave_provision ?? 0) },
  { label: 'Provision précarité', value: (s) => Number(s.precarity_provision ?? 0) },
  { label: 'Coût total', value: (s) => Number(s.payroll_cost) },
]

const cell = 'px-1.5 py-[2.5px] text-right tabular-nums'
const show = (v: number) => (Math.round(v) === 0 ? '' : fcfa(v))
const round2 = (v: number) => Math.round(v * 100) / 100

export default function PayrollBookPrintPage() {
  const { id } = useParams()
  const company = useCompany()
  const entry = useQuery({
    queryKey: ['payroll_entry', id],
    queryFn: async () => unwrap(await dataApi.from('payroll_entries').select('*').eq('id', id!).single()),
  })
  const slips = useQuery({
    queryKey: ['book-slips', id],
    queryFn: async () => unwrap(await dataApi.from('salary_slips')
      .select('id, employee_number, gross_pay, total_employee_deductions, employer_charges, net_pay, payroll_cost, leave_provision, precarity_provision, calculation, employee:employees(gender, first_name, last_name)')
      .eq('payroll_entry_id', id!).neq('status', 'Annulé').order('employee_number')) as unknown as Slip[],
  })

  if (entry.isLoading || slips.isLoading) return <Spinner />
  const e = entry.data
  const list = slips.data ?? []
  if (!e) return <ErrorNote error={entry.error ?? 'Traitement introuvable'} />

  // rubriques rencontrées, dans l'ordre des sections puis du code d'ordre ; les cotisations patronales restent dans les totaux
  const map = new Map<string, Rubrique>()
  for (const s of list) {
    for (const l of s.calculation?.lines ?? []) {
      if (l.section === 'patronal' || map.has(l.code)) continue
      map.set(l.code, { code: l.code, label: l.label, sort: l.sort, section: l.section, field: l.section === 'retenue' ? 'deduction' : 'gain' })
    }
  }
  const rubriques = [...map.values()]
    .filter((r) => list.some((s) => amountOf(lineOf(s, r.code), r.field) !== 0))
    .sort((a, b) => {
      const sa = SECTION_ORDER.indexOf(a.section), sb = SECTION_ORDER.indexOf(b.section)
      return (sa < 0 ? 99 : sa) - (sb < 0 ? 99 : sb) || a.sort - b.sort
    })
  const gains = rubriques.filter((r) => r.section === 'gain')
  const retenues = rubriques.filter((r) => r.section === 'retenue')
  const others = rubriques.filter((r) => r.section !== 'gain' && r.section !== 'retenue')

  const pages: Slip[][] = []
  for (let i = 0; i < list.length; i += PER_PAGE) pages.push(list.slice(i, i + PER_PAGE))
  const totalOnLast = pages.length > 0 && pages[pages.length - 1].length < PER_PAGE
  const totalPages = pages.length + (totalOnLast ? 0 : 1)

  const now = new Date()
  const today = date(now.toISOString().slice(0, 10))
  const time = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  const closing = e.status === 'Validée' ? '(Après clôture mensuelle)' : '(Avant clôture mensuelle)'
  const first = list[0]?.employee_number ?? ''
  const last = list[list.length - 1]?.employee_number ?? ''
  const sumRub = (r: Rubrique) => list.reduce((a, s) => a + amountOf(lineOf(s, r.code), r.field), 0)
  const sumAll = (f: (s: Slip) => number) => list.reduce((a, s) => a + f(s), 0)

  const SECTION = 'bg-[#E9F1F0] text-[#0A4F4C] text-[8.5px] font-bold uppercase tracking-[0.08em] [print-color-adjust:exact]'

  function renderTable(slipsOfPage: Slip[], withTotal: boolean) {
    const span = 1 + slipsOfPage.length + (withTotal ? 1 : 0)
    const totalCell = 'border-l-2 border-[#0F6E6A] bg-[#F1F7F6] [print-color-adjust:exact]'
    const sectionRow = (label: string) => (
      <tr><td colSpan={span} className={`${SECTION} px-1.5 py-[3px]`}>{label}</td></tr>
    )
    const rubRow = (r: Rubrique) => (
      <tr key={r.code} className="border-b border-[#DCE1DE] even:bg-[#FAFBFA] [print-color-adjust:exact]">
        <td className="whitespace-nowrap py-[2.5px] pl-1.5 pr-2"><span className="inline-block w-7 text-right text-[8px] text-[#7A8791]">{r.sort}</span> {r.label}</td>
        {slipsOfPage.map((s) => <td key={s.id} className={cell}>{show(amountOf(lineOf(s, r.code), r.field))}</td>)}
        {withTotal && <td className={`${cell} font-semibold ${totalCell}`}>{show(sumRub(r))}</td>}
      </tr>
    )
    const emphasis = (label: string, val: (s: Slip) => number, tone: string, tot: string) => (
      <tr className={`${tone} font-bold [print-color-adjust:exact]`}>
        <td className="py-[3px] pl-1.5">{label}</td>
        {slipsOfPage.map((s) => <td key={s.id} className={cell}>{fcfa(val(s))}</td>)}
        {withTotal && <td className={`${cell} ${tot} border-l-2 border-[#0F6E6A]`}>{fcfa(sumAll(val))}</td>}
      </tr>
    )
    return (
      <table className="w-full table-fixed border-collapse text-[9.5px] leading-tight text-[#1D2A33]">
        <colgroup><col style={{ width: '47mm' }} />{slipsOfPage.map((s) => <col key={s.id} />)}{withTotal && <col />}</colgroup>
        <thead>
          <tr className="bg-[#17323B] align-bottom text-white [print-color-adjust:exact]">
            <th className="px-1.5 py-1.5 text-left text-[8.5px] font-semibold uppercase tracking-wider text-white/80">Rubriques</th>
            {slipsOfPage.map((s) => (
              <th key={s.id} className="border-l border-white/20 px-1.5 py-1.5 text-left font-normal leading-tight">
                <span className="block text-[10px] font-bold tracking-wide text-[#F2C94C]">{s.employee_number}</span>
                <span className="block break-words text-[9px] font-semibold uppercase">{s.employee?.last_name}</span>
                <span className="block break-words text-[8.5px] uppercase text-white/80">{s.employee?.gender === 'F' ? 'Mme ' : ''}{s.employee?.first_name}</span>
              </th>
            ))}
            {withTotal && <th className="border-l-2 border-[#F2C94C] px-1.5 py-1.5 text-right text-[10px] font-bold uppercase tracking-wider text-[#F2C94C]">Total</th>}
          </tr>
        </thead>
        <tbody>
          {sectionRow('Rémunération')}
          {gains.map(rubRow)}
          {emphasis('Total brut', (s) => Number(s.gross_pay), 'bg-[#FFF3B8] text-[#1D2A33]', 'bg-[#FFE97A]')}
          {sectionRow('Retenues salariales')}
          {retenues.map(rubRow)}
          {emphasis('Total retenues', (s) => Number(s.total_employee_deductions), 'bg-[#FADCD6] text-[#8A2C1F]', 'bg-[#F5C4BA]')}
          {others.length > 0 && sectionRow('Indemnités et autres éléments')}
          {others.map(rubRow)}
          {sectionRow('Synthèse')}
          {STATS.map((st) => {
            const strong = st.label === 'Net à payer'
            return (
              <tr key={st.label} className={strong ? 'bg-[#CFE7E4] font-bold text-[#0A4F4C] [print-color-adjust:exact]' : 'border-b border-[#DCE1DE] even:bg-[#FAFBFA] [print-color-adjust:exact]'}>
                <td className={`py-[2.5px] pl-1.5 ${strong ? 'text-[10px]' : ''}`}>{st.label}</td>
                {slipsOfPage.map((s) => <td key={s.id} className={`${cell} ${strong ? 'text-[10px]' : ''}`}>{st.hours ? round2(st.value(s)) : fcfa(st.value(s))}</td>)}
                {withTotal && <td className={`${cell} font-semibold border-l-2 border-[#0F6E6A] ${strong ? 'bg-[#B5DBD6] text-[10px]' : 'bg-[#F1F7F6]'}`}>{st.hours ? round2(sumAll(st.value)) : fcfa(sumAll(st.value))}</td>}
              </tr>
            )
          })}
          <tr className="border-y-2 border-[#17323B]">
            <td className="py-[3px] pl-1.5 font-bold">Nombre de salariés</td>
            {slipsOfPage.map((s) => <td key={s.id} />)}
            {withTotal && <td className={`${cell} border-l-2 border-[#0F6E6A] text-[11px] font-bold`}>{list.length}</td>}
          </tr>
        </tbody>
      </table>
    )
  }

  function renderHeader(page: number) {
    return (
      <header className="mb-3">
        <div className="flex items-end justify-between border-b-[3px] border-[#0F6E6A] pb-2">
          <div>
            <p className="text-[8.5px] font-semibold uppercase tracking-[0.14em] text-[#52606B]">Société</p>
            <p className="text-[13px] font-bold leading-tight">{company.data?.name ?? ''}</p>
            {company.data?.ninea && <p className="text-[8.5px] text-[#52606B]">NINEA {company.data.ninea}</p>}
          </div>
          <div className="text-center">
            <p className="text-[17px] font-bold uppercase tracking-[0.18em] text-[#0A4F4C]">Livre de paie mensuel</p>
            <p className="text-[10px] font-semibold">Période du {date(e!.period_start)} au {date(e!.period_end)}</p>
          </div>
          <div className="text-right text-[8.5px] leading-snug text-[#52606B]">
            <p className="text-[11px] font-bold text-[#1D2A33]">Page {page} / {totalPages}</p>
            <p>Édité le {today} à {time}</p>
            <p className="font-semibold text-[#8A6A00]">{closing}</p>
          </div>
        </div>
        <p className="mt-1 text-[8.5px] text-[#52606B]">Matricules {first} à {last} · {list.length} salarié(s) · montants en F CFA</p>
      </header>
    )
  }

  const sheetCls = 'mx-auto min-h-[277mm] w-[190mm] bg-white p-3 shadow-sm print:min-h-0 print:p-0 print:shadow-none'
  return (
    <>
      <div className="no-print mb-4 flex items-center justify-between">
        <Link to={`/paie/${id}`} className="inline-flex items-center gap-1 text-sm text-ink-soft hover:text-river"><ArrowLeft className="h-4 w-4" /> Traitement de paie</Link>
        <Button variant="primary" icon={<Printer className="h-4 w-4" />} onClick={() => window.print()}>Imprimer ou enregistrer en PDF</Button>
      </div>
      <ErrorNote error={slips.error} />
      {list.length === 0 ? <p className="panel px-4 py-6 text-sm text-ink-soft">Aucun bulletin à imprimer : calculez d’abord le traitement.</p> : (
        <div className="space-y-6 print:space-y-0" style={{ fontFamily: 'Archivo, sans-serif' }}>
          {pages.map((p, i) => (
            <section key={i} className={`${sheetCls} print:break-after-page`}>
              {renderHeader(i + 1)}
              {renderTable(p, totalOnLast && i === pages.length - 1)}
              <p className="mt-2 border-t border-[#DCE1DE] pt-1 text-[8px] text-[#7A8791]">(*) Rubriques particulières · document confidentiel</p>
            </section>
          ))}
          {!totalOnLast && (
            <section className={sheetCls}>
              {renderHeader(totalPages)}
              {renderTable([], true)}
              <p className="mt-2 border-t border-[#DCE1DE] pt-1 text-[8px] text-[#7A8791]">(*) Rubriques particulières · document confidentiel</p>
            </section>
          )}
        </div>
      )}
    </>
  )
}
