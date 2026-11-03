import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, ArrowRight, CheckCircle2, ClipboardCheck, FileText, LockKeyhole, ShieldAlert } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PayrollRefusal, dataApi, transitionPayroll, unwrap } from '../lib/api'
import { useAuth } from '../lib/auth'
import { date, monthLabel } from '../lib/format'
import { Badge, Button, Empty, ErrorNote, Modal, PageHeader, Section, Spinner, TextField } from '../components/ui'

type PayrollEntry = {
  id: string
  period_start: string
  period_end: string
  status: string
  notes: string | null
}

type Anomaly = {
  payroll_entry_id: string
  severity: string
  status: string
  message: string
}
type Approval = {
  payroll_entry_id: string
  role: string
  decision: string
  created_at: string
}
type CheckResult = { niveau: 'erreur' | 'alerte' | 'info'; code: string; salarie?: string; message: string }

const FLOW = ['Brouillon', 'Calculée', 'En revue', 'Approuvée', 'Validée', 'Payée', 'Clôturée']
const NEXT: Record<string, { status: string; label: string }> = {
  Calculée: { status: 'En revue', label: 'Envoyer en revue' },
  'En revue': { status: 'Approuvée', label: 'Approuver la paie' },
  Approuvée: { status: 'Validée', label: 'Valider la paie' },
  Validée: { status: 'Payée', label: 'Marquer comme payée' },
  Payée: { status: 'Clôturée', label: 'Clôturer la période' },
}

export default function PayrollGovernancePage() {
  const { can } = useAuth()
  const qc = useQueryClient()
  const nav = useNavigate()
  const entries = useQuery({
    queryKey: ['payroll-governance'],
    queryFn: async () => {
      const [entryResult, anomalyResult, approvalResult] = await Promise.all([
        dataApi.from('payroll_entries').select('id, period_start, period_end, status, notes').order('period_start', { ascending: false }),
        dataApi.from('payroll_anomalies').select('payroll_entry_id, severity, status, message'),
        dataApi.from('payroll_approvals').select('payroll_entry_id, role, decision, created_at').order('created_at', { ascending: false }),
      ])
      return {
        entries: unwrap(entryResult) as PayrollEntry[],
        anomalies: unwrap(anomalyResult) as Anomaly[],
        approvals: unwrap(approvalResult) as Approval[],
      }
    },
  })
  // dérogation à la séparation des tâches : proposée à l'administrateur seulement, avec motif obligatoire
  const [derog, setDerog] = useState<{ id: string; status: string } | null>(null)
  const [motif, setMotif] = useState('')
  const transition = useMutation({
    mutationFn: async ({ id, status, reason }: { id: string; status: string; reason?: string }) =>
      transitionPayroll(id, status, reason),
    onSuccess: () => { setDerog(null); setMotif(''); qc.invalidateQueries({ queryKey: ['payroll-governance'] }) },
    onError: (err, vars) => { if (err instanceof PayrollRefusal && err.code === 'SD403' && can('admin')) setDerog({ id: vars.id, status: vars.status }) },
  })
  const checks = useMutation({
    mutationFn: async (id: string) => unwrap(await dataApi.rpc('payroll_entry_checks', { p_payroll_entry_id: id })),
  })

  return (
    <>
      <PageHeader
        title="Gouvernance de la paie"
        description="Suivez les périodes, contrôlez les anomalies et appliquez les transitions sécurisées jusqu'à la clôture."
      />
      <ErrorNote error={entries.error ?? transition.error} />
      {entries.isLoading ? <Spinner /> : !entries.data?.entries.length ? (
        <Empty title="Aucune période de paie">Créez un traitement depuis la page Traitements de paie.</Empty>
      ) : (
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-3">
            <MetricCard label="Périodes suivies" value={entries.data.entries.length} tone="text-river" />
            <MetricCard label="Anomalies ouvertes" value={entries.data.anomalies.filter((item) => item.status !== 'résolue').length} tone="text-signal" />
            <MetricCard label="Périodes clôturées" value={entries.data.entries.filter((entry) => entry.status === 'Clôturée').length} tone="text-ink" />
          </div>
          {entries.data.entries.map((entry) => {
            const anomalies = entries.data.anomalies.filter((item) => item.payroll_entry_id === entry.id)
            const blocking = anomalies.filter((item) => item.severity === 'bloquante' && item.status !== 'résolue')
            const next = NEXT[entry.status]
            const closed = entry.status === 'Clôturée'
            const position = FLOW.indexOf(entry.status)
            const checkResult = checks.data && checks.variables === entry.id ? checks.data as CheckResult[] : null
            const checkErrors = checkResult?.filter((item) => item.niveau === 'erreur') ?? []
            return (
              <Section key={entry.id} className={closed ? 'border-2 border-ink/20 bg-ink/[0.035] grayscale-[0.15]' : undefined} title={monthLabel(entry.period_start)} actions={<div className="flex items-center gap-2"><Badge value={entry.status} /><Button size="sm" variant="ghost" icon={<FileText className="h-3.5 w-3.5" />} onClick={() => nav(`/paie/${entry.id}/rapport`)}>Rapport</Button><Button size="sm" variant="ghost" loading={checks.isPending && checks.variables === entry.id} icon={<ClipboardCheck className="h-3.5 w-3.5" />} onClick={() => checks.mutate(entry.id)}>Contrôler</Button></div>}>
                <div className="grid gap-5 lg:grid-cols-[1fr_auto]">
                  <div>
                    {closed && (
                      <div className="mb-4 flex items-center gap-3 rounded-lg border-2 border-ink bg-ink px-4 py-3 text-white shadow-sm" role="status">
                        <LockKeyhole className="h-5 w-5 shrink-0 text-phosphate" aria-hidden />
                        <div>
                          <p className="font-semibold tracking-wide">PÉRIODE CLÔTURÉE — OPÉRATIONS BLOQUÉES</p>
                          <p className="mt-0.5 text-xs text-white/70">Le snapshot est figé. Aucune modification, validation ou paiement supplémentaire n’est autorisé.</p>
                        </div>
                      </div>
                    )}
                    <p className="text-sm text-ink-soft">Du {date(entry.period_start)} au {date(entry.period_end)}</p>
                    <div className="mt-4 flex flex-wrap items-center gap-1" aria-label={`Progression ${entry.status}`}>
                      {FLOW.map((status, index) => (
                        <span key={status} className="flex items-center gap-1">
                          <span className={index <= position ? 'rounded-full bg-river px-2 py-1 text-[11px] text-white' : 'rounded-full border border-line px-2 py-1 text-[11px] text-ink-muted'}>
                            {status}
                          </span>
                          {index < FLOW.length - 1 && <ArrowRight className="h-3 w-3 text-ink-muted" aria-hidden />}
                        </span>
                      ))}
                    </div>
                    <div className="mt-4 flex flex-wrap gap-3 text-xs text-ink-soft">
                      <span className="inline-flex items-center gap-1"><ShieldAlert className="h-3.5 w-3.5" aria-hidden /> {anomalies.length} anomalie(s)</span>
                      <span>{entries.data.approvals.filter((approval) => approval.payroll_entry_id === entry.id && approval.decision === 'approuvée').length} approbation(s)</span>
                      {(blocking.length > 0 || checkErrors.length > 0) && <span className="font-medium text-signal">{blocking.length + checkErrors.length} contrôle(s) bloquant(s)</span>}
                      {entry.status === 'Clôturée' && <span className="inline-flex items-center gap-1 text-river-dark"><LockKeyhole className="h-3.5 w-3.5" aria-hidden /> Snapshot figé</span>}
                    </div>
                    {anomalies.length > 0 && (
                      <ul className="mt-3 space-y-1 text-xs text-ink-soft">
                        {anomalies.slice(0, 3).map((anomaly) => (
                          <li key={`${anomaly.payroll_entry_id}-${anomaly.message}`} className={anomaly.severity === 'bloquante' && anomaly.status !== 'résolue' ? 'font-medium text-signal' : undefined}>
                            {anomaly.message}
                          </li>
                        ))}
                        {anomalies.length > 3 && <li>+ {anomalies.length - 3} autre(s)</li>}
                      </ul>
                    )}
                    {checkResult && (
                      <div className="mt-4 rounded-xl border border-line bg-paper-dark p-3" role="status">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Contrôle de préparation</p>
                          <span className={`inline-flex items-center gap-1 text-xs font-medium ${checkErrors.length ? 'text-signal' : 'text-phosphate'}`}>
                            {checkErrors.length ? <AlertTriangle className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                            {checkErrors.length ? `${checkErrors.length} erreur(s)` : 'Contrôle réussi'}
                          </span>
                        </div>
                        {checkResult.length === 0 ? <p className="mt-2 text-xs text-ink-muted">Aucune anomalie détectée.</p> : (
                          <ul className="mt-2 space-y-1.5 text-xs">
                            {checkResult.slice(0, 6).map((item, index) => <li key={`${item.code}-${item.salarie ?? index}`} className={item.niveau === 'erreur' ? 'text-signal' : item.niveau === 'alerte' ? 'text-orange-700' : 'text-ink-soft'}><strong>{item.salarie ?? item.code}</strong> · {item.message}</li>)}
                            {checkResult.length > 6 && <li className="text-ink-muted">+ {checkResult.length - 6} autre(s)</li>}
                          </ul>
                        )}
                      </div>
                    )}
                  </div>
                  {can('paie') && next && (
                    <Button
                      variant="primary"
                      loading={transition.isPending && transition.variables?.id === entry.id}
                      disabled={blocking.length > 0 || checkErrors.length > 0}
                      icon={<CheckCircle2 className="h-4 w-4" />}
                      onClick={() => transition.mutate({ id: entry.id, status: next.status })}
                    >
                      {next.label}
                    </Button>
                  )}
                  {can('paie') && closed && (
                    <Button variant="secondary" disabled icon={<LockKeyhole className="h-4 w-4" />}>
                      Actions verrouillées
                    </Button>
                  )}
                </div>
              </Section>
            )
          })}
        </div>
      )}
      <Modal open={derog !== null} onClose={() => setDerog(null)} title="Dérogation à la séparation des tâches"
        footer={<><Button variant="ghost" onClick={() => setDerog(null)}>Annuler</Button>
          <Button variant="primary" loading={transition.isPending} disabled={!motif.trim()}
            onClick={() => derog && transition.mutate({ ...derog, reason: motif })}>Déroger et poursuivre</Button></>}>
        <p className="text-sm">Vous avez préparé cette paie. En tant qu'administrateur, vous pouvez poursuivre à condition d'indiquer un motif. Il sera enregistré dans le journal d'audit.</p>
        <TextField className="mt-3" label="Motif (obligatoire)" value={motif} onChange={(ev) => setMotif(ev.target.value)} />
        <div className="mt-3"><ErrorNote error={derog ? transition.error : null} /></div>
      </Modal>
    </>
  )
}

function MetricCard({ label, value, tone }: { label: string; value: number; tone: string }) {
  return <div className="panel border-line/70 bg-paper p-4"><p className={`text-2xl font-semibold tabular-nums ${tone}`}>{value}</p><p className="mt-1 text-xs text-ink-muted">{label}</p></div>
}
