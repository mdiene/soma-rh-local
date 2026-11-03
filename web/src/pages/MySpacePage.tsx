import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ApiClient } from '../lib/api'
import { CheckCircle2, Clock3, Eye, FilePlus2, FileText, LockKeyhole, Search, Upload, XCircle } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { openEmployeeDocument, dataApi, unwrap, uploadEmployeeDocument } from '../lib/api'
import { date, fcfa, monthLabel, num } from '../lib/format'
import { Badge, Button, ErrorNote, Modal, PageHeader, SelectField, Spinner, TextField } from '../components/ui'
import { REQUEST_TYPES, type EmployeeRequest } from '../lib/requests'
import { DocumentThumbnail } from './EmployeeDocumentsPage'

const db = dataApi as unknown as ApiClient
const today = () => new Date().toISOString().slice(0, 10)
const documentSections = [
  { code: 'identite', label: 'État civil et identité', icon: '👤' },
  { code: 'qualification', label: 'Qualification et parcours professionnel', icon: '🎓' },
  { code: 'famille_social', label: 'Situation familiale et sociale', icon: '👨‍👩‍👧‍👦' },
  { code: 'aptitude_medicale', label: 'Aptitude médicale', icon: '🩺' },
  { code: 'cas_specifiques', label: 'Cas spécifiques', icon: '🌍' },
] as const
const statusLabels = {
  en_attente: 'En attente de validation',
  valide: 'Validé',
  refuse: 'Refusé',
} as const

/** Mon espace : bulletin récent, soldes de congés, planning à venir et demandes du salarié. */
export default function MySpacePage() {
  const qc = useQueryClient()
  const me = useQuery({ queryKey: ['my_employee_id'], queryFn: async () => unwrap(await dataApi.rpc('my_employee_id')) as string | null })
  const meId = me.data ?? null
  const [open, setOpen] = useState(false)
  const [documentSearch, setDocumentSearch] = useState('')
  const [f, setF] = useState({ request_type: 'attestation_travail', amount: '', target_date: '', message: '' })

  const emp = useQuery({
    queryKey: ['my_employee', meId], enabled: !!meId,
    queryFn: async () => unwrap(await dataApi.from('employees').select('first_name, last_name, employee_number, spouses_count, children_count').eq('id', meId!).maybeSingle()),
  })
  const slip = useQuery({
    queryKey: ['my_last_slip', meId], enabled: !!meId,
    queryFn: async () => unwrap(await dataApi.from('salary_slips').select('id, period_start, net_pay, status').eq('employee_id', meId!).eq('status', 'Validé').order('period_start', { ascending: false }).limit(1)),
  })
  const balances = useQuery({
    queryKey: ['my_balances', meId], enabled: !!meId,
    queryFn: async () => unwrap(await dataApi.from('v_leave_balances').select('leave_type_name, balance').eq('employee_id', meId!)),
  })
  const planning = useQuery({
    queryKey: ['my_planning', meId], enabled: !!meId,
    queryFn: async () => unwrap(await db.from('shift_assignments').select('work_date, shift_code').eq('employee_id', meId!).gte('work_date', today()).order('work_date').limit(7)) as { work_date: string; shift_code: string }[],
  })
  const requests = useQuery({
    queryKey: ['my_requests', meId], enabled: !!meId,
    queryFn: async () => unwrap(await db.from('employee_requests').select('*').eq('employee_id', meId!).order('created_at', { ascending: false }).limit(30)) as EmployeeRequest[],
  })
  const notifications = useQuery({
    queryKey: ['my_notifications', meId], enabled: !!meId,
    queryFn: async () => unwrap(await db.from('employee_notifications').select('id, title, message, created_at, read_at').is('read_at', null).order('created_at', { ascending: false }).limit(5)) as { id: string; title: string; message: string; created_at: string; read_at: string | null }[],
  })
  const documents = useQuery({
    queryKey: ['my_documents', meId], enabled: !!meId,
    queryFn: async () => unwrap(await db.from('employee_documents').select('id, requirement_code, document_slot, document_type, title, file_name, mime_type, size_bytes, status, rejection_reason, created_at').order('created_at', { ascending: false }).limit(30)) as { id: string; requirement_code: string | null; document_slot: number; document_type: string; title: string; file_name: string; mime_type: string; size_bytes: number; status: string; rejection_reason: string | null; created_at: string }[],
  })
  const documentRequirements = useQuery({
    queryKey: ['document_requirements'],
    queryFn: async () => unwrap(await db.from('document_requirements').select('code, section_code, title, description, required, conditional_rule, sort_order').eq('active', true).order('sort_order')) as { code: string; section_code: string; title: string; description: string; required: boolean; conditional_rule: string | null; sort_order: number }[],
  })
  const markNotificationRead = useMutation({
    mutationFn: async (id: string) => unwrap(await dataApi.rpc('mark_employee_notification_read' as never, { p_notification_id: id } as never)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['my_notifications', meId] }),
  })

  const create = useMutation({
    mutationFn: async () => unwrap(await db.from('employee_requests').insert({
      employee_id: meId, request_type: f.request_type, amount: f.amount ? Number(f.amount.replace(',', '.')) : null,
      target_date: f.target_date || null, message: f.message.trim() || null,
    })),
    onSuccess: () => { setOpen(false); setF({ request_type: 'attestation_travail', amount: '', target_date: '', message: '' }); qc.invalidateQueries({ queryKey: ['my_requests'] }) },
  })
  const cancel = useMutation({
    mutationFn: async (id: string) => unwrap(await dataApi.rpc('cancel_my_request' as never, { p_request_id: id } as never)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['my_requests'] }),
  })
  const upload = useMutation({
    mutationFn: async ({ requirementCode, slot, file }: { requirementCode: string; slot: number; file: File }) => uploadEmployeeDocument(meId!, requirementCode, file, slot),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['my_documents', meId] }),
  })

  const last = slip.data?.[0]
  const needsAmount = f.request_type === 'acompte'
  const invalid = needsAmount && !(Number(f.amount.replace(',', '.')) > 0)
  const documentMap = useMemo(() => new Map((documents.data ?? []).map((document) => [`${document.requirement_code ?? document.document_type}:${document.document_slot}`, document])), [documents.data])
  const filteredRequirements = useMemo(() => {
    const search = documentSearch.trim().toLocaleLowerCase('fr')
    return (documentRequirements.data ?? []).filter((requirement) =>
      !search || `${requirement.title} ${requirement.description}`.toLocaleLowerCase('fr').includes(search),
    )
  }, [documentRequirements.data, documentSearch])
  const expectedDocuments = (documentRequirements.data ?? []).reduce((total, requirement) => total + (requirement.code === 'situation_matrimoniale' ? (emp.data?.spouses_count ?? 0) : requirement.code === 'actes_enfants' ? (emp.data?.children_count ?? 0) : 1), 0)
  const documentsProvided = (documentRequirements.data ?? []).reduce((total, requirement) => {
    const count = requirement.code === 'situation_matrimoniale' ? (emp.data?.spouses_count ?? 0) : requirement.code === 'actes_enfants' ? (emp.data?.children_count ?? 0) : 1
    return total + Array.from({ length: count }, (_, index) => index + 1).filter((slot) => documentMap.has(`${requirement.code}:${slot}`)).length
  }, 0)
  const completion = expectedDocuments ? Math.round((documentsProvided / expectedDocuments) * 100) : 0

  if (me.isLoading) return <Spinner />
  if (!meId) return <p className="panel px-4 py-6 text-sm text-ink-soft">Votre compte n’est pas encore relié à une fiche salarié. Demandez au service RH de le rattacher.</p>

  return (
    <>
      <PageHeader title={`Bonjour ${emp.data?.first_name ?? ''}`} description="Vos bulletins, congés, planning et demandes."
        actions={<Button variant="primary" icon={<FilePlus2 className="h-4 w-4" />} onClick={() => setOpen(true)}>Nouvelle demande</Button>} />
      <div className="mb-6 grid gap-4 md:grid-cols-3">
        <section className="panel p-4">
          <h2 className="text-base">Dernier bulletin</h2>
          {slip.isLoading ? <Spinner /> : last ? (
            <p className="mt-2 text-sm">{monthLabel(last.period_start)} · net <strong className="tabular-nums">{fcfa(last.net_pay)} F</strong><br />
              <Link className="text-river hover:underline" to={`/bulletins/${last.id}`}>Ouvrir le bulletin</Link> · <Link className="text-river hover:underline" to="/mes-bulletins">Tous mes bulletins</Link></p>
          ) : <p className="mt-2 text-sm text-ink-muted">Aucun bulletin validé pour l’instant.</p>}
        </section>
        <section className="panel p-4">
          <h2 className="text-base">Congés</h2>
          {(balances.data ?? []).length === 0 ? <p className="mt-2 text-sm text-ink-muted">Aucun solde.</p> : (
            <ul className="mt-2 space-y-1 text-sm">{(balances.data ?? []).map((b) => <li key={b.leave_type_name}>{b.leave_type_name} : <strong className="tabular-nums">{num(b.balance, 1)} j</strong></li>)}</ul>
          )}
          <Link className="mt-2 inline-block text-sm text-river hover:underline" to="/conges">Demander un congé</Link>
        </section>
        <section className="panel p-4">
          <h2 className="text-base">Mon planning</h2>
          {(planning.data ?? []).length === 0 ? <p className="mt-2 text-sm text-ink-muted">Aucun poste planifié à venir.</p> : (
            <ul className="mt-2 space-y-0.5 text-sm tabular-nums">{planning.data!.map((p) => <li key={p.work_date}>{date(p.work_date)} · <strong>{p.shift_code}</strong></li>)}</ul>
          )}
        </section>
      </div>

      <section className="panel">
        <div className="border-b border-line px-4 py-3"><h2 className="text-base">Mes demandes</h2></div>
        <ErrorNote error={requests.error || cancel.error} />
        {(requests.data ?? []).length === 0 ? <p className="px-4 py-6 text-sm text-ink-muted">Aucune demande.</p> : (
          <ul className="divide-y divide-line/70">
            {requests.data!.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm">
                <span className="min-w-52 font-medium">{REQUEST_TYPES[r.request_type] ?? r.request_type}</span>
                <span className="text-ink-soft">{date(r.created_at.slice(0, 10))}{r.amount ? ` · ${fcfa(r.amount)} F` : ''}</span>
                <Badge value={r.status} />
                {r.decision_note && <span className="text-xs text-ink-soft">« {r.decision_note} »</span>}
                {r.status === 'Ouverte' && <Button size="sm" variant="ghost" className="ml-auto" loading={cancel.isPending} onClick={() => cancel.mutate(r.id)}>Annuler</Button>}
              </li>
            ))}
          </ul>
        )}
      </section>
      {(notifications.data ?? []).length > 0 && (
        <section className="panel mt-6">
          <div className="border-b border-line px-4 py-3"><h2 className="text-base">Notifications</h2></div>
          <ul className="divide-y divide-line/70">
            {notifications.data!.map((n) => (
              <li key={n.id} className="flex items-start gap-3 px-4 py-3 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{n.title}</p>
                  <p className="text-ink-soft">{n.message}</p>
                  <p className="mt-1 text-xs text-ink-muted">{date(n.created_at.slice(0, 10))}</p>
                </div>
                <Button size="sm" variant="ghost" loading={markNotificationRead.isPending} onClick={() => markNotificationRead.mutate(n.id)}>Marquer comme lu</Button>
              </li>
            ))}
          </ul>
        </section>
      )}
      <section className="panel mt-6">
        <div className="flex items-center gap-2 border-b border-line px-4 py-3">
          <LockKeyhole className="h-4 w-4 text-river" aria-hidden />
          <div>
            <h2 className="text-base">Mon Dossier Administratif</h2>
            <p className="text-xs text-ink-muted">Pour finaliser votre intégration et garantir vos droits, importez les justificatifs demandés.</p>
          </div>
        </div>
        <div className="border-b border-line/70 px-4 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium">{documentsProvided} sur {expectedDocuments} documents fournis</p>
              <div className="mt-2 h-2 w-64 max-w-full overflow-hidden rounded-full bg-paper-dark" aria-label={`${completion}% du dossier fourni`}>
                <div className="h-full rounded-full bg-river transition-all" style={{ width: `${completion}%` }} />
              </div>
            </div>
            <div className="relative w-full sm:w-64">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-ink-muted" aria-hidden />
              <input className="field w-full pl-9" placeholder="Rechercher un document" value={documentSearch} onChange={(event) => setDocumentSearch(event.target.value)} />
            </div>
          </div>
          <p className="mt-3 text-xs text-ink-muted">Vos documents sont privés. Les pièces médicales et d’identité ne sont pas visibles par votre manager.</p>
        </div>
        <ErrorNote error={documents.error || documentRequirements.error || upload.error} />
        <div className="space-y-6 p-4">
          {documentSections.map((section) => {
            const requirements = filteredRequirements.filter((requirement) => requirement.section_code === section.code)
            if (requirements.length === 0) return null
            return (
              <div key={section.code}>
                <h3 className="mb-3 text-sm font-semibold text-ink"><span className="mr-2">{section.icon}</span>{section.label}</h3>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {requirements.flatMap((requirement) => {
                    const count = requirement.code === 'situation_matrimoniale' ? (emp.data?.spouses_count ?? 0) : requirement.code === 'actes_enfants' ? (emp.data?.children_count ?? 0) : 1
                    return Array.from({ length: count }, (_, index) => ({ requirement, slot: index + 1 }))
                  }).map(({ requirement, slot }) => {
                    const document = documentMap.get(`${requirement.code}:${slot}`)
                    const status = document?.status as keyof typeof statusLabels | undefined
                    return (
                      <article key={`${requirement.code}:${slot}`} className="rounded-xl border border-line bg-paper p-4 transition-shadow hover:shadow-sm">
                        {document && <DocumentThumbnail document={document} />}
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex min-w-0 gap-3">
                            <span className="mt-0.5 rounded-lg bg-paper-dark p-2 text-river"><FileText className="h-4 w-4" aria-hidden /></span>
                            <div className="min-w-0">
                              <h4 className="text-sm font-medium">{requirement.title}{(requirement.code === 'situation_matrimoniale' || requirement.code === 'actes_enfants') ? ` n°${slot}` : ''}</h4>
                              <p className="mt-1 text-xs leading-5 text-ink-muted">{requirement.description}</p>
                            </div>
                          </div>
                          <span className="text-[10px] font-semibold uppercase tracking-wide text-signal">Indispensable</span>
                        </div>
                        <div className="mt-4 flex items-center justify-between gap-2">
                          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs ${status === 'valide' ? 'bg-phosphate/15 text-phosphate' : status === 'refuse' ? 'bg-signal/15 text-signal' : status === 'en_attente' ? 'bg-orange-100 text-orange-700' : 'bg-paper-dark text-ink-muted'}`}>
                            {status === 'valide' ? <CheckCircle2 className="h-3.5 w-3.5" /> : status === 'refuse' ? <XCircle className="h-3.5 w-3.5" /> : status === 'en_attente' ? <Clock3 className="h-3.5 w-3.5" /> : <Upload className="h-3.5 w-3.5" />}
                            {status ? statusLabels[status] : 'Manquant'}
                          </span>
                          {document ? <Button size="sm" variant="ghost" icon={<Eye className="h-3.5 w-3.5" />} onClick={() => void openEmployeeDocument(document.id)}>Visualiser</Button> : (
                            <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded px-2.5 py-1.5 text-xs font-medium text-ink-soft hover:bg-paper hover:text-ink">
                              <Upload className="h-3.5 w-3.5" /> Charger
                              <input className="sr-only" type="file" accept=".pdf,.doc,.docx,image/jpeg,image/png" capture="environment" onChange={(event) => { const file = event.target.files?.[0]; if (file) upload.mutate({ requirementCode: requirement.code, slot, file }); event.target.value = '' }} />
                            </label>
                          )}
                        </div>
                        {document?.file_name && <p className="mt-2 truncate text-xs text-ink-muted" title={document.file_name}>{document.file_name}</p>}
                        {document?.status === 'refuse' && document.rejection_reason && <p className="mt-2 text-xs text-signal">Motif : {document.rejection_reason}</p>}
                      </article>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </section>

      <Modal open={open} onClose={() => setOpen(false)} title="Nouvelle demande"
        footer={<><Button variant="ghost" onClick={() => setOpen(false)}>Annuler</Button><Button variant="primary" loading={create.isPending} disabled={invalid} onClick={() => create.mutate()}>Envoyer</Button></>}>
        <SelectField label="Type de demande" value={f.request_type} onChange={(e) => setF({ ...f, request_type: e.target.value })}>
          {Object.entries(REQUEST_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </SelectField>
        {needsAmount && <TextField className="mt-3" label="Montant demandé (F CFA)" inputMode="decimal" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} />}
        {f.request_type === 'correction_presence' && <TextField className="mt-3" label="Date concernée" type="date" value={f.target_date} onChange={(e) => setF({ ...f, target_date: e.target.value })} />}
        <TextField className="mt-3" label="Précisions (facultatif)" value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} />
        <div className="mt-3"><ErrorNote error={create.error} /></div>
      </Modal>
    </>
  )
}
