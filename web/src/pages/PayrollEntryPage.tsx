import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createColumnHelper } from '@tanstack/react-table'
import { ArrowLeft, Ban, BookOpen, CheckCircle2, ChevronRight, Banknote, Download, FileText, LockKeyhole, Play, RotateCcw, Printer, Trash2, X } from 'lucide-react'
import { DeletePayrollModal } from '../components/DeletePayrollModal'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { PayrollRefusal, dataApi, transitionPayroll, unwrap, type Views } from '../lib/api'
import { useAuth } from '../lib/auth'
import { date, fcfa, monthLabel } from '../lib/format'
import { ComparisonPanel, ReopenModal, downloadPayrollSummary } from '../components/PayrollEntryExtras'
import { DataTable } from '../components/DataTable'
import { Badge, Button, ErrorNote, Figure, Modal, PageHeader, Spinner, TextField } from '../components/ui'

type Reg = Views<'v_payroll_register'>
const col = createColumnHelper<Reg>()
const sum = (rows: Reg[], k: keyof Reg) => rows.reduce((s, r) => s + Number(r[k] ?? 0), 0)
const money = (k: keyof Reg, header: string, strong = false) =>
  col.accessor((r) => Number(r[k] ?? 0), {
    id: String(k), header, meta: { align: 'right' },
    cell: (c) => strong ? <strong>{fcfa(c.getValue())}</strong> : fcfa(c.getValue()),
    footer: (ctx) => fcfa(sum(ctx.table.getFilteredRowModel().rows.map((r) => r.original), k)),
  })

const columns = [
  col.accessor('employee_number', { header: 'Matricule', footer: 'Total' }),
  col.accessor('employee_name', { header: 'Salarié', cell: (c) => <span className="font-medium">{c.getValue()}</span> }),
  col.accessor('employment_type', { header: 'Contrat' }),
  money('gross_pay', 'Brut'),
  money('income_tax', 'IR'),
  money('total_employee_deductions', 'Retenues'),
  money('total_non_taxable', 'Indemnités'),
  money('net_pay', 'Net à payer', true),
  money('employer_charges', 'Charges patronales'),
  money('payroll_cost', 'Masse salariale'),
  col.accessor('status', { header: 'État', cell: (c) => <Badge value={c.getValue() ?? ''} /> }),
]

type RunResult = { calculated: number; attendance_synced?: number; errors: { employee_number: string; name: string; error: string }[] }

export default function PayrollEntryPage() {
  const { id } = useParams()
  const nav = useNavigate()
  const qc = useQueryClient()
  const { can } = useAuth()
  const [confirm, setConfirm] = useState<null | 'submit' | 'cancel' | 'delete' | 'reopen'>(null)
  const [result, setResult] = useState<RunResult | null>(null)

  const entry = useQuery({
    queryKey: ['payroll_entry', id],
    queryFn: async () => unwrap(await dataApi.from('payroll_entries').select('*').eq('id', id!).single()),
  })
  const slips = useQuery({
    queryKey: ['register', id],
    queryFn: async () => unwrap(await dataApi.from('v_payroll_register').select('*').eq('payroll_entry_id', id!).order('employee_number')),
  })
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['payroll_entry', id] })
    qc.invalidateQueries({ queryKey: ['register', id] })
    qc.invalidateQueries({ queryKey: ['payroll_entries'] })
    qc.invalidateQueries({ queryKey: ['dashboard'] })
  }
  const run = useMutation({
    mutationFn: async () => unwrap(await dataApi.rpc('run_payroll_entry', { p_payroll_entry_id: id! })) as unknown as RunResult,
    onSuccess: (r) => { setResult(r); refresh() },
  })
  const [motif, setMotif] = useState('')
  const submit = useMutation({
    mutationFn: async () => transitionPayroll(id!, 'Validée', motif),
    onSuccess: () => { setConfirm(null); setMotif(''); refresh() },
  })
  type Check = { niveau: 'erreur' | 'alerte' | 'info'; code: string; salarie: string; message: string }
  const checks = useQuery({
    queryKey: ['payroll_checks', id, entry.data?.status, slips.data?.length],
    enabled: !!id && !!entry.data && entry.data.status !== 'Annulée' && (slips.data?.length ?? 0) > 0,
    queryFn: async () => (unwrap(await dataApi.rpc('payroll_entry_checks', { p_payroll_entry_id: id! })) ?? []) as unknown as Check[],
  })
  const cancel = useMutation({
    mutationFn: async () => unwrap(await dataApi.rpc('cancel_payroll_entry', { p_payroll_entry_id: id! })),
    onSuccess: () => { setConfirm(null); refresh() },
  })

  if (entry.isLoading) return <Spinner />
  const e = entry.data
  if (!e) return <ErrorNote error={entry.error ?? 'Traitement introuvable'} />
  const rows = slips.data ?? []
  const editable = e.status === 'Brouillon' || e.status === 'Calculée'
  const closed = e.status === 'Clôturée'

  return (
    <>
      <Link to="/paie" className="no-print mb-3 inline-flex items-center gap-1 text-sm text-ink-soft hover:text-river"><ArrowLeft className="h-4 w-4" /> Traitements de paie</Link>
      <PageHeader
        title={`Paie de ${monthLabel(e.period_start)}`}
        description={<span className="inline-flex flex-wrap items-center gap-2">Du {date(e.period_start)} au {date(e.period_end)} · paiement par {e.payment_mode} <Badge value={e.status} /></span>}
        actions={<>
          {rows.length > 0 && <Button icon={<BookOpen className="h-4 w-4" />} onClick={() => nav(`/paie/${id}/livre`)}>Livre de paie imprimable</Button>}
          {rows.length > 0 && <Button icon={<Printer className="h-4 w-4" />} onClick={() => nav(`/paie/${id}/imprimer`)}>Imprimer les bulletins</Button>}
          {rows.length > 0 && <Button icon={<FileText className="h-4 w-4" />} onClick={() => nav(`/paie/${id}/rapport`)}>Rapport de clôture</Button>}
          {can('paie', 'rh') && editable && <Button icon={<Play className="h-4 w-4" />} loading={run.isPending} onClick={() => run.mutate()}>{rows.length ? 'Recalculer' : 'Calculer les bulletins'}</Button>}
          {can('admin') && e.status === 'Calculée' && <Button variant="primary" icon={<CheckCircle2 className="h-4 w-4" />} onClick={() => setConfirm('submit')}>Valider la paie</Button>}
          {e.status === 'Validée' && <Button icon={<Banknote className="h-4 w-4" />} onClick={() => nav(`/paie/${id}/paiements`)}>Paiements</Button>}
          {rows.length > 0 && <Button icon={<Download className="h-4 w-4" />} onClick={() => downloadPayrollSummary(id!, e.period_start)}>Synthèse (CSV)</Button>}
          {can('admin') && e.status === 'Validée' && <Button variant="ghost" icon={<RotateCcw className="h-4 w-4" />} onClick={() => setConfirm('reopen')}>Rouvrir</Button>}
          {can('admin') && e.status !== 'Annulée' && <Button variant="ghost" icon={<Ban className="h-4 w-4" />} onClick={() => setConfirm('cancel')}>Annuler</Button>}
          {can('paie', 'rh') && (e.status !== 'Validée' || can('admin')) && (
            <Button variant="ghost" className="text-signal hover:bg-signal-light hover:text-signal" icon={<Trash2 className="h-4 w-4" />} onClick={() => setConfirm('delete')}>Supprimer</Button>
          )}
        </>}
      />
      {closed && (
        <div className="mb-5 flex items-center gap-3 rounded-lg border-2 border-ink bg-ink px-4 py-3 text-white shadow-sm" role="status">
          <LockKeyhole className="h-5 w-5 shrink-0 text-phosphate" aria-hidden />
          <div>
            <p className="font-semibold tracking-wide">PAIE CLÔTURÉE — LECTURE SEULE</p>
            <p className="mt-0.5 text-xs text-white/70">Ce traitement est immuable. Les actions de modification sont désactivées.</p>
          </div>
        </div>
      )}
      <DeletePayrollModal open={confirm === 'delete'} entry={e} onClose={() => setConfirm(null)} onDeleted={() => nav('/paie', { replace: true })} />
      <ErrorNote error={slips.error || run.error} />

      {result && (
        <div className="mb-4 rounded border border-line bg-white text-sm">
          <div className="flex items-center gap-3 px-4 py-3">
            <p className="flex-1">
              <strong>{result.calculated}</strong> bulletin(s) calculé(s)
              {result.errors.length > 0 && <>, <strong className="text-signal">{result.errors.length}</strong> salarié(s) non calculé(s)</>}.
              {!!result.attendance_synced && <span className="text-ink-soft"> Présences reprises pour {result.attendance_synced} salarié(s).</span>}
            </p>
            <button type="button" onClick={() => setResult(null)} className="rounded p-1 text-ink-muted hover:bg-paper hover:text-ink" aria-label="Fermer le compte rendu">
              <X className="h-4 w-4" />
            </button>
          </div>
          {result.errors.length > 0 && (
            // repliée par défaut : la liste peut être longue
            <details className="group border-t border-line">
              <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-2 text-signal hover:bg-signal-light/50">
                <ChevronRight className="h-4 w-4 transition-transform group-open:rotate-90" aria-hidden />
                <span className="group-open:hidden">Afficher les {result.errors.length} salarié(s) non calculé(s)</span>
                <span className="hidden group-open:inline">Masquer la liste</span>
              </summary>
              <ul className="max-h-64 space-y-1 overflow-y-auto px-4 pb-3 pl-10 text-signal">
                {result.errors.map((x) => (
                  <li key={x.employee_number}><span className="font-medium">{x.employee_number} {x.name}</span> : {x.error}</li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}

      {rows.length > 0 && <ComparisonPanel entryId={id!} enabled={e.status === 'Calculée' || e.status === 'Validée'} />}

      {(checks.data?.length ?? 0) > 0 && (() => {
        const list = checks.data!
        const n = (l: Check['niveau']) => list.filter((c) => c.niveau === l).length
        const tone = { erreur: 'text-signal', alerte: 'text-phosphate', info: 'text-ink-soft' } as const
        const label = { erreur: 'Erreur', alerte: 'Alerte', info: 'Info' } as const
        return (
          <details className="group mb-4 rounded border border-line bg-white text-sm" open={n('erreur') > 0}>
            <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3">
              <ChevronRight className="h-4 w-4 transition-transform group-open:rotate-90" aria-hidden />
              <strong>Contrôles avant validation</strong>
              <span className="text-ink-soft">
                {n('erreur')} erreur(s) · {n('alerte')} alerte(s) · {n('info')} information(s)
              </span>
            </summary>
            <ul className="max-h-72 space-y-1 overflow-y-auto border-t border-line px-4 py-3">
              {list.map((c, i) => (
                <li key={i}><span className={`font-medium ${tone[c.niveau]}`}>{label[c.niveau]}</span> · {c.salarie} : {c.message}</li>
              ))}
            </ul>
          </details>
        )
      })()}

      {rows.length > 0 && (
        <div className="panel mb-6 grid grid-cols-2 gap-x-6 gap-y-4 p-4 sm:grid-cols-3 lg:grid-cols-6">
          <Figure label="Bulletins" value={rows.length} />
          <Figure label="Brut" value={`${fcfa(sum(rows, 'gross_pay'))} F`} />
          <Figure label="Retenues salariales" value={`${fcfa(sum(rows, 'total_employee_deductions'))} F`} />
          <Figure label="Net à payer" value={`${fcfa(sum(rows, 'net_pay'))} F`} />
          <Figure label="Charges patronales" value={`${fcfa(sum(rows, 'employer_charges'))} F`} />
          <Figure label="Masse salariale" value={`${fcfa(sum(rows, 'payroll_cost'))} F`} />
        </div>
      )}

      {slips.isLoading ? <Spinner /> : rows.length === 0 ? (
        <p className="panel px-4 py-6 text-sm text-ink-soft">Aucun bulletin pour ce traitement. Vérifiez les variables du mois puis lancez le calcul.</p>
      ) : (
        <DataTable data={rows} columns={columns} footer exportName={`livre-de-paie-${e.period_start.slice(0, 7)}`} onRowClick={(r) => nav(`/bulletins/${r.salary_slip_id}`)} />
      )}

      <ReopenModal entryId={id!} open={confirm === 'reopen'} onClose={() => setConfirm(null)} onDone={() => { setConfirm(null); refresh() }} />
      <Modal open={confirm === 'submit'} onClose={() => setConfirm(null)} title="Valider la paie"
        footer={<><Button variant="ghost" onClick={() => setConfirm(null)}>Revenir</Button><Button variant="primary" loading={submit.isPending} onClick={() => submit.mutate()}>Valider {rows.length} bulletin(s)</Button></>}>
        <p className="text-sm">Une fois validés, les bulletins de {monthLabel(e.period_start)} ne peuvent plus être recalculés et deviennent visibles par les salariés.</p>
        {submit.error instanceof PayrollRefusal && submit.error.code === 'SD403' && (
          <TextField className="mt-3" label="Motif de la dérogation (obligatoire)" value={motif} onChange={(ev) => setMotif(ev.target.value)}
            hint="Vous avez préparé cette paie : en tant qu'administrateur, vous pouvez la valider en indiquant un motif, qui sera journalisé." />
        )}
        <div className="mt-3"><ErrorNote error={submit.error} /></div>
      </Modal>
      <Modal open={confirm === 'cancel'} onClose={() => setConfirm(null)} title="Annuler le traitement"
        footer={<><Button variant="ghost" onClick={() => setConfirm(null)}>Revenir</Button><Button variant="danger" loading={cancel.isPending} onClick={() => cancel.mutate()}>Annuler le traitement</Button></>}>
        <p className="text-sm">Les bulletins de {monthLabel(e.period_start)} seront marqués « Annulé ». Un nouveau traitement pourra ensuite être créé pour ce mois.</p>
        <div className="mt-3"><ErrorNote error={cancel.error} /></div>
      </Modal>
    </>
  )
}
