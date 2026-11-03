import { useQuery } from '@tanstack/react-query'
import clsx from 'clsx'
import { useEffect, useMemo, useState } from 'react'
import { dataApi, unwrap, type Views } from '../lib/api'
import { useCompany, usePayrollEntries } from '../lib/queries'
import { date, fcfa, monthLabel } from '../lib/format'
import { GroupedTable, type Check, type GBlock, type GCol } from '../components/GroupedTable'
import { Empty, ErrorNote, PageHeader, SelectField, Spinner } from '../components/ui'

/**
 * États et déclarations : livre de paie, état résumé des cotisations, charges patronales
 * et écritures comptables. Chaque état utilise le même tableau groupé : blocs fonctionnels
 * colorés, en-têtes figés, sous-totaux, total général, contrôles de cohérence, export CSV.
 */

type Reg = Views<'v_payroll_register'>
type Contrib = Views<'v_contribution_summary'>
type Journal = Views<'v_accounting_journal'>

const TABS = [
  { id: 'livre', label: 'Livre de paie' },
  { id: 'cotisations', label: 'État résumé des cotisations' },
  { id: 'patronal', label: 'Charges patronales' },
  { id: 'compta', label: 'Écritures comptables' },
] as const
type Tab = (typeof TABS)[number]['id']

/* ----------------------------------------------------------- aides de colonnes */
function moneyOf<T>(id: keyof T, header: string, opts: Partial<GCol<T>> = {}): GCol<T> {
  return { id: String(id), header, kind: 'money', value: (r) => Number(r[id] ?? 0), ...opts }
}
function textOf<T>(id: keyof T, header: string, stickyWidth?: number): GCol<T> {
  return { id: String(id), header, kind: 'text', stickyWidth, value: (r) => (r[id] as string | null) ?? '' }
}
const regMoney = (id: keyof Reg, header: string, title?: string) => moneyOf<Reg>(id, header, { title })

const identity: GBlock<Reg> = { id: 'ident', label: 'Identification', tone: 'neutral', columns: [
  textOf<Reg>('employee_number', 'Matricule', 84), textOf<Reg>('employee_name', 'Salarié', 210),
  textOf<Reg>('designation', 'Emploi'), textOf<Reg>('grade_code', 'Catégorie'), textOf<Reg>('employment_type', 'Contrat'),
] }

/** Livre de paie : sept blocs fonctionnels. */
const registerBlocks: GBlock<Reg>[] = [
  identity,
  { id: 'remu', label: 'Rémunération', tone: 'river', columns: [
    regMoney('base_salary', 'Salaire de base'), regMoney('sursalaire', 'Sursalaire'), regMoney('seniority_bonus', 'Prime anc.'),
    regMoney('variable_gross', 'Primes'), regMoney('leave_allowance', 'Alloc. congé'),
    regMoney('precarity_allowance', 'Ind. précarité', 'Indemnité de fin de contrat payée le mois de sortie'),
    regMoney('overtime_amount', 'Heures sup.'), regMoney('gross_pay', 'Brut'),
  ] },
  { id: 'ret', label: 'Retenues salariales', tone: 'signal', columns: [
    regMoney('income_tax', 'IR'), regMoney('trimf', 'TRIMF'), regMoney('ipres_rg_employee', 'IPRES RG'), regMoney('ipres_rc_employee', 'IPRES RC'),
    regMoney('ipm_employee', 'IPM'), regMoney('brs', 'BRS'), regMoney('total_employee_deductions', 'Total retenues'),
    regMoney('total_net_deductions', 'Retenues diverses', 'Avances, prêts et autres retenues sur le net'),
  ] },
  { id: 'pat', label: 'Cotisations patronales', tone: 'ink', columns: [
    regMoney('css_af', 'CSS prest. fam.'), regMoney('css_at', 'CSS acc. travail'), regMoney('ipres_rg_employer', 'IPRES RG'),
    regMoney('ipres_rc_employer', 'IPRES RC'), regMoney('ipm_employer', 'IPM'), regMoney('cfce', 'CFCE'), regMoney('employer_charges', 'Total patronal'),
  ] },
  { id: 'prov', label: 'Provisions du mois', tone: 'phosphate', columns: [
    regMoney('leave_provision', 'Prov. congé'), regMoney('precarity_provision', 'Prov. précarité'),
  ] },
  { id: 'cumul', label: 'Cumuls annuels validés', tone: 'phosphateSoft', columns: [
    regMoney('ytd_trimf', 'Cumul TRIMF'), regMoney('ytd_ipres_rg', 'Cumul IPRES RG', 'Parts salariale et patronale'),
    regMoney('ytd_ipres_rc', 'Cumul IPRES RC', 'Parts salariale et patronale'),
    regMoney('ytd_leave_provision', 'Cumul prov. congé'), regMoney('ytd_precarity_provision', 'Cumul prov. précarité'),
  ] },
  { id: 'net', label: 'Net à payer et masse salariale', tone: 'riverDark', columns: [
    regMoney('net_remuneration', 'Rém. nette'),
    regMoney('total_non_taxable', 'Indemnités', 'Transport, panier, kilométrique et autres indemnités non imposables'),
    regMoney('net_pay', 'Net à payer'), regMoney('payroll_cost', 'Masse salariale'),
  ] },
]

/** Charges patronales par salarié. */
const employerBlocks: GBlock<Reg>[] = [
  { ...identity, columns: [identity.columns[0], identity.columns[1], textOf<Reg>('grade_code', 'Catégorie'), textOf<Reg>('staff_status', 'Statut')] },
  { id: 'remu', label: 'Rémunération', tone: 'river', columns: [regMoney('gross_pay', 'Brut')] },
  { id: 'sal', label: 'Cotisations salariales', tone: 'inkSoft', columns: [
    regMoney('ipres_rg_employee', 'IPRES RG'), regMoney('ipres_rc_employee', 'IPRES RC'), regMoney('ipm_employee', 'IPM'),
  ] },
  { id: 'pat', label: 'Cotisations patronales', tone: 'ink', columns: [
    regMoney('css_af', 'Prest. familiales'), regMoney('css_at', 'Accident du travail'), regMoney('ipres_rg_employer', 'IPRES RG'),
    regMoney('ipres_rc_employer', 'IPRES RC'), regMoney('ipm_employer', 'IPM'), regMoney('cfce', 'CFCE'),
  ] },
  { id: 'prov', label: 'Provisions du mois', tone: 'phosphate', columns: [regMoney('leave_provision', 'Prov. congé'), regMoney('precarity_provision', 'Prov. précarité')] },
  { id: 'tot', label: 'Totaux', tone: 'riverDark', columns: [regMoney('employer_charges', 'Total patronal'), regMoney('payroll_cost', 'Masse salariale')] },
]

/** Caisse ou administration destinataire de chaque rubrique. */
const CAISSE: Record<string, string> = {
  IPRES_RG: 'IPRES', IPRES_RC: 'IPRES', CSS_AF: 'Caisse de sécurité sociale', CSS_AT: 'Caisse de sécurité sociale',
  IPM: 'IPM', IR: 'Impôts (DGID)', TRIMF: 'Impôts (DGID)', CFCE: 'Impôts (DGID)', BRS: 'Impôts (DGID)',
}
type ContribRow = Contrib & { caisse: string }
const rate = (id: keyof Contrib, header: string): GCol<ContribRow> => ({ id: String(id), header, kind: 'rate', sum: false, value: (r) => (r[id] ? Number(r[id]) : null) })
const contribBlocks: GBlock<ContribRow>[] = [
  { id: 'ident', label: 'Identification', tone: 'neutral', columns: [
    { id: 'label', header: 'Rubrique', kind: 'text', stickyWidth: 230, value: (r) => r.label ?? '' },
    { id: 'caisse', header: 'Caisse', kind: 'text', value: (r) => r.caisse },
  ] },
  { id: 'taux', label: 'Taux', tone: 'inkSoft', columns: [rate('employee_rate', 'Salarial'), rate('employer_rate', 'Patronal')] },
  { id: 'assiette', label: 'Assiette', tone: 'river', columns: [
    moneyOf<ContribRow>('base_total', 'Assiette totale', { sum: false, title: 'Les assiettes de rubriques différentes ne s\'additionnent pas' }),
  ] },
  { id: 'sal', label: 'Cotisations salariales', tone: 'signal', columns: [moneyOf<ContribRow>('employee_amount', 'Montant salarial')] },
  { id: 'pat', label: 'Cotisations patronales', tone: 'ink', columns: [moneyOf<ContribRow>('employer_amount', 'Montant patronal')] },
  { id: 'tot', label: 'Totaux', tone: 'riverDark', columns: [
    moneyOf<ContribRow>('total_amount', 'Montant global'),
    { id: 'headcount', header: 'Effectif', kind: 'int', sum: false, value: (r) => Number(r.headcount ?? 0) },
  ] },
]

type JournalRow = Journal & { journal_label: string }
const journalBlocks: GBlock<JournalRow>[] = [
  { id: 'ident', label: 'Écriture', tone: 'neutral', columns: [
    { id: 'account', header: 'Compte', kind: 'text', stickyWidth: 84, value: (r) => r.account ?? '' },
    { id: 'label', header: 'Libellé', kind: 'text', stickyWidth: 320, value: (r) => r.label ?? '' },
  ] },
  { id: 'tot', label: 'Montants', tone: 'riverDark', columns: [
    { id: 'debit', header: 'Débit', kind: 'money', value: (r) => (Number(r.debit) ? Number(r.debit) : null) },
    { id: 'credit', header: 'Crédit', kind: 'money', value: (r) => (Number(r.credit) ? Number(r.credit) : null) },
  ] },
]

/* --------------------------------------------------------- contrôles de cohérence */
const sum = <T,>(rows: T[], f: (r: T) => unknown) => rows.reduce((s, r) => s + Number(f(r) ?? 0), 0)
const TOL = 0.01 // F CFA : comparaison en pleine précision
function check(label: string, a: number, b: number): Check {
  const gap = Math.abs(a - b)
  return { label, ok: gap <= TOL, detail: gap <= TOL ? `${fcfa(a)} F` : `écart de ${gap.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} F (${fcfa(a)} / ${fcfa(b)})` }
}
function payrollChecks(reg: Reg[], contrib: Contrib[] | undefined): Check[] {
  const out: Check[] = [
    check('Net à payer reconstitué', sum(reg, (r) => Number(r.net_remuneration) + Number(r.total_non_taxable) - Number(r.total_net_deductions) + Number(r.previous_rounding ?? 0)), sum(reg, (r) => r.net_pay)),
    check('Masse salariale reconstituée', sum(reg, (r) => Number(r.gross_pay) + Number(r.employer_charges) + Number(r.total_non_taxable) + Number(r.previous_rounding ?? 0)), sum(reg, (r) => r.payroll_cost)),
  ]
  if (contrib) {
    out.push(check('Retenues = état des cotisations', sum(reg, (r) => r.total_employee_deductions), sum(contrib, (c) => c.employee_amount)))
    out.push(check('Charges patronales = état des cotisations', sum(reg, (r) => r.employer_charges), sum(contrib, (c) => c.employer_amount)))
  }
  return out
}

export default function ReportsPage() {
  const entries = usePayrollEntries()
  const company = useCompany()
  const [entryId, setEntryId] = useState('')
  const [tab, setTab] = useState<Tab>('livre')
  const [byStatus, setByStatus] = useState(false)
  useEffect(() => { if (!entryId && entries.data?.length) setEntryId(entries.data.find((e) => e.status !== 'Annulée')?.id ?? '') }, [entries.data, entryId])
  const entry = entries.data?.find((e) => e.id === entryId)

  const reg = useQuery({
    queryKey: ['register', entryId], enabled: !!entryId,
    queryFn: async () => unwrap(await dataApi.from('v_payroll_register').select('*').eq('payroll_entry_id', entryId).order('employee_number')),
  })
  const contrib = useQuery({
    queryKey: ['contrib', entryId], enabled: !!entryId,
    queryFn: async () => unwrap(await dataApi.from('v_contribution_summary').select('*').eq('payroll_entry_id', entryId).order('sort_order')),
  })
  const journal = useQuery({
    queryKey: ['journal', entryId], enabled: !!entryId && tab === 'compta',
    queryFn: async () => unwrap(await dataApi.from('v_accounting_journal').select('*').eq('payroll_entry_id', entryId).order('journal').order('line_no')),
  })
  const suffix = entry ? entry.period_start.slice(0, 7) : ''

  const regRows = useMemo(() => reg.data ?? [], [reg.data])
  const checks = useMemo(() => payrollChecks(regRows, contrib.data), [regRows, contrib.data])
  const contribRows: ContribRow[] = useMemo(() => (contrib.data ?? []).map((c) => ({ ...c, caisse: CAISSE[c.component_code ?? ''] ?? 'Autres' })), [contrib.data])
  const journalRows: JournalRow[] = useMemo(() => (journal.data ?? []).map((j) => ({ ...j, journal_label: (j.journal ?? '').replace(/^\d-/, '') })), [journal.data])
  const journalChecks: Check[] = useMemo(() => {
    const names = [...new Set(journalRows.map((j) => j.journal_label))]
    const brut = sum(journalRows.filter((j) => ['661', '6057'].includes(j.account ?? '')), (j) => j.debit)
    return [
      ...names.map((n) => {
        const l = journalRows.filter((j) => j.journal_label === n)
        return check(`${n} équilibré`, sum(l, (j) => j.debit), sum(l, (j) => j.credit))
      }),
      ...(regRows.length ? [check('Brut comptabilisé = livre de paie', brut, sum(regRows, (r) => r.gross_pay))] : []),
    ]
  }, [journalRows, regRows])

  const statusGroup = byStatus ? { key: (r: Reg) => r.staff_status ?? '—', label: (r: Reg) => r.staff_status ?? 'Sans statut' } : undefined
  const groupToggle = (
    <label className="inline-flex items-center gap-2 text-sm">
      <input type="checkbox" className="h-4 w-4 accent-[#0F6E6A]" checked={byStatus} onChange={(e) => setByStatus(e.target.checked)} />
      Sous-totaux par statut
    </label>
  )
  const notValidated = entry && entry.status !== 'Validée'

  return (
    <>
      <PageHeader
        title="États et déclarations"
        description="Livre de paie, cotisations sociales et fiscales, charges patronales et écritures comptables du mois. Chaque état s'imprime et s'exporte en CSV pour Excel."
        actions={
          <SelectField label="Traitement" value={entryId} onChange={(e) => setEntryId(e.target.value)} className="min-w-[13rem]">
            {(entries.data ?? []).filter((e) => e.status !== 'Annulée').map((e) => <option key={e.id} value={e.id}>{monthLabel(e.period_start)} — {e.status}</option>)}
          </SelectField>
        }
      />
      <div className="no-print mb-4 flex flex-wrap gap-1 border-b border-line" role="tablist">
        {TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}
            className={clsx('-mb-px border-b-2 px-3 py-2 text-sm', tab === t.id ? 'border-river font-medium text-ink' : 'border-transparent text-ink-soft hover:text-ink')}>
            {t.label}
          </button>
        ))}
      </div>
      <ErrorNote error={entries.error || reg.error || contrib.error || journal.error} />
      {!entryId ? <Empty title="Aucun traitement de paie">Les états apparaissent dès qu'un traitement est calculé.</Empty> : (
        <div className="print-landscape">
          {/* titre imprimé (la barre d'onglets n'est pas imprimée) */}
          <header className="mb-3 hidden items-end justify-between border-b-[3px] border-river pb-2 print:flex">
            <div>
              <p className="text-[8.5px] font-semibold uppercase tracking-[0.14em] text-ink-muted">Société</p>
              <p className="text-[13px] font-bold leading-tight">{company.data?.name ?? ''}</p>
              {company.data?.ninea && <p className="text-[8.5px] text-ink-muted">NINEA {company.data.ninea}</p>}
            </div>
            <div className="text-center">
              <p className="text-[17px] font-bold uppercase tracking-[0.16em] text-river-dark">{TABS.find((t) => t.id === tab)?.label}</p>
              {entry && <p className="text-[10px] font-semibold">Période du {date(entry.period_start)} au {date(entry.period_end)}</p>}
            </div>
            <div className="text-right text-[8.5px] leading-snug text-ink-muted">
              <p>Édité le {date(new Date().toISOString().slice(0, 10))}</p>
              {entry && <p className="font-semibold text-ink">{entry.status === 'Validée' ? 'Paie validée' : `Traitement ${entry.status.toLowerCase()} — provisoire`}</p>}
              <p>Montants en F CFA</p>
            </div>
          </header>
          {tab === 'livre' && (reg.isLoading ? <Spinner /> : (
            <GroupedTable rows={regRows} blocks={registerBlocks} rowKey={(r) => r.salary_slip_id ?? r.employee_number ?? ''}
              groupBy={statusGroup} toolbar={groupToggle} checks={checks} exportName={`livre-de-paie-${suffix}`}
              notice={notValidated ? (
                <p className="rounded border border-phosphate bg-phosphate-light px-3 py-2 text-ink">
                  Traitement « {entry!.status} » : les montants du mois s'affichent, mais les cumuls annuels ne comprennent que les mois déjà validés.
                </p>
              ) : (
                <p className="text-xs text-ink-muted">Cumuls du 1<sup>er</sup> janvier au mois affiché, bulletins validés uniquement. Montants arrondis à l'affichage ; totaux calculés en pleine précision.</p>
              )} />
          ))}
          {tab === 'patronal' && (reg.isLoading ? <Spinner /> : (
            <GroupedTable rows={regRows} blocks={employerBlocks} rowKey={(r) => r.salary_slip_id ?? r.employee_number ?? ''}
              groupBy={statusGroup} toolbar={groupToggle} checks={checks.slice(1)} exportName={`charges-patronales-${suffix}`} />
          ))}
          {tab === 'cotisations' && (contrib.isLoading ? <Spinner /> : (
            <GroupedTable rows={contribRows} blocks={contribBlocks} rowKey={(r) => r.component_code ?? r.label ?? ''}
              groupBy={{ key: (r) => r.caisse, label: (r) => r.caisse }} checks={checks.slice(2)}
              searchPlaceholder="Rechercher une rubrique, une caisse…" exportName={`cotisations-${suffix}`}
              notice={<p className="text-xs text-ink-muted">Sous-total par caisse (IPRES, Caisse de sécurité sociale, IPM, impôts) puis total général.</p>} />
          ))}
          {tab === 'compta' && (journal.isLoading ? <Spinner /> : (
            <GroupedTable rows={journalRows} blocks={journalBlocks} rowKey={(r) => `${r.journal}-${r.line_no}`}
              groupBy={{ key: (r) => r.journal ?? '', label: (r) => r.journal_label }} checks={journalChecks}
              searchPlaceholder="Rechercher un compte, un libellé…" exportName={`ecritures-${suffix}`} />
          ))}
        </div>
      )}
    </>
  )
}
