import { useEffect, useMemo, useState } from 'react'
import { Archive, CheckCircle2, Copy, Eye, FileText, Link as LinkIcon, LockKeyhole, Printer, Search, Trash2, Upload, XCircle } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ApiClient } from '../lib/api'
import { archiveEmployeeDocument, deleteEmployeeDocument, getEmployeeDocumentBlobUrl, getEmployeeDocumentThumbnailBlobUrl, getEmployeeDocumentUrl, openEmployeeDocumentsBundle, reviewEmployeeDocument, dataApi, unwrap, uploadEmployeeDocument } from '../lib/api'
import { Badge, Button, ErrorNote, Modal, PageHeader, Spinner } from '../components/ui'

const db = dataApi as unknown as ApiClient
type Employee = { id: string; employee_number: string; first_name: string; last_name: string; status: string; spouses_count: number; children_count: number }
type Requirement = { code: string; section_code: string; title: string; description: string; sort_order: number }
type Document = { id: string; employee_id: string; requirement_code: string | null; document_slot: number; title: string; file_name: string; status: string; rejection_reason: string | null; archived_at: string | null }
type ThumbnailDocument = Pick<Document, 'id' | 'file_name'>

export function DocumentThumbnail({ document }: { document: ThumbnailDocument }) {
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let active = true
    let sourceUrl: string | null = null
    void getEmployeeDocumentThumbnailBlobUrl(document.id).then((url) => {
      sourceUrl = url
      if (active) setThumbnailUrl(url)
    }).catch(() => { if (active) setFailed(true) })
    return () => {
      active = false
      if (sourceUrl) URL.revokeObjectURL(sourceUrl)
    }
  }, [document.id])

  return (
    <div className="mb-3 flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-line bg-paper-dark" aria-label={`Miniature de ${document.file_name}`}>
      {thumbnailUrl ? (
        <img src={thumbnailUrl} alt="" className="h-full w-full object-cover" />
      ) : !failed ? (
        <span className="text-[11px] text-ink-muted">Chargement…</span>
      ) : (
        <span className="px-2 text-center text-[10px] text-signal">Miniature indisponible</span>
      )}
    </div>
  )
}

function isImageFile(fileName: string) {
  return /\.(jpe?g|png)$/i.test(fileName)
}

function isPdfFile(fileName: string) {
  return /\.pdf$/i.test(fileName)
}

const sections = [
  ['identite', 'État civil et identité'],
  ['qualification', 'Qualification et parcours professionnel'],
  ['famille_social', 'Situation familiale et sociale'],
  ['aptitude_medicale', 'Aptitude médicale'],
  ['cas_specifiques', 'Cas spécifiques'],
] as const

export default function EmployeeDocumentsPage() {
  const [employeeId, setEmployeeId] = useState('')
  const [search, setSearch] = useState('')
  const [preview, setPreview] = useState<{ document: Document; blobUrl: string } | null>(null)
  const [previewError, setPreviewError] = useState<Error | null>(null)
  const [copied, setCopied] = useState(false)
  const [reviewTarget, setReviewTarget] = useState<{ document: Document; status: 'valide' | 'refuse' } | null>(null)
  const [reviewReason, setReviewReason] = useState('')
  const [bundleLoading, setBundleLoading] = useState(false)
  const [bundleError, setBundleError] = useState<Error | null>(null)
  const qc = useQueryClient()
  const employees = useQuery({
    queryKey: ['document_employees'],
    queryFn: async () => unwrap(await db.from('employees').select('id, employee_number, first_name, last_name, status, spouses_count, children_count').order('last_name')) as Employee[],
  })
  const requirements = useQuery({
    queryKey: ['document_requirements_admin'],
    queryFn: async () => unwrap(await db.from('document_requirements').select('code, section_code, title, description, sort_order').eq('active', true).order('sort_order')) as Requirement[],
  })
  const documents = useQuery({
    queryKey: ['employee_documents_admin', employeeId],
    enabled: !!employeeId,
    queryFn: async () => unwrap(await db.from('employee_documents').select('id, employee_id, requirement_code, document_slot, title, file_name, status, rejection_reason, archived_at').eq('employee_id', employeeId).is('archived_at', null)) as Document[],
  })
  const allDocuments = useQuery({
    queryKey: ['employee_documents_admin_summary'],
    queryFn: async () => unwrap(await db.from('employee_documents').select('employee_id, requirement_code, document_slot, status').is('archived_at', null)) as { employee_id: string; requirement_code: string | null; document_slot: number; status: string }[],
  })
  const selected = employees.data?.find((employee) => employee.id === employeeId)
  const documentMap = useMemo(() => new Map((documents.data ?? []).map((document) => [`${document.requirement_code ?? document.title}:${document.document_slot}`, document])), [documents.data])
  const upload = useMutation({
    mutationFn: async ({ requirementCode, slot, file }: { requirementCode: string; slot: number; file: File }) => uploadEmployeeDocument(employeeId, requirementCode, file, slot),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['employee_documents_admin', employeeId] }),
  })
  const review = useMutation({
    mutationFn: async () => {
      if (!reviewTarget) throw new Error('Document de validation manquant.')
      return reviewEmployeeDocument(reviewTarget.document.id, reviewTarget.status, reviewReason)
    },
    onSuccess: () => {
      setReviewTarget(null)
      setReviewReason('')
      void qc.invalidateQueries({ queryKey: ['employee_documents_admin', employeeId] })
    },
  })
  const archive = useMutation({
    mutationFn: (documentId: string) => archiveEmployeeDocument(documentId),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['employee_documents_admin', employeeId] }),
  })
  const remove = useMutation({
    mutationFn: (documentId: string) => deleteEmployeeDocument(documentId),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['employee_documents_admin', employeeId] }),
  })
  const filteredEmployees = (employees.data ?? []).filter((employee) =>
    `${employee.employee_number} ${employee.first_name} ${employee.last_name}`.toLocaleLowerCase('fr').includes(search.toLocaleLowerCase('fr')),
  )
  const dossierRows = useMemo(() => (requirements.data ?? []).flatMap((requirement) => Array.from({
    length: requirement.code === 'situation_matrimoniale' ? (selected?.spouses_count ?? 0) : requirement.code === 'actes_enfants' ? (selected?.children_count ?? 0) : 1,
  }, (_, index) => {
    const slot = index + 1
    return { requirement, slot, document: documentMap.get(`${requirement.code}:${slot}`) }
  })), [requirements.data, selected, documentMap])
  const dossierStats = useMemo(() => dossierRows.reduce((stats, row) => {
    if (!row.document) stats.missing += 1
    else if (row.document.status === 'valide') stats.validated += 1
    else if (row.document.status === 'refuse') stats.refused += 1
    else stats.pending += 1
    return stats
  }, { missing: 0, pending: 0, validated: 0, refused: 0 }), [dossierRows])
  const openBundle = async () => {
    if (!selected) return
    setBundleError(null)
    setBundleLoading(true)
    try {
      await openEmployeeDocumentsBundle(selected.id)
    } catch (error) {
      setBundleError(error instanceof Error ? error : new Error('Le dossier PDF est indisponible.'))
    } finally {
      setBundleLoading(false)
    }
  }
  const incompleteEmployees = useMemo(() => (employees.data ?? []).map((employee) => {
    const docs = (allDocuments.data ?? []).filter((document) => document.employee_id === employee.id)
    const expected = (requirements.data ?? []).reduce((total, requirement) => total + (requirement.code === 'situation_matrimoniale' ? employee.spouses_count : requirement.code === 'actes_enfants' ? employee.children_count : 1), 0)
    const provided = docs.length
    const refused = docs.filter((document) => document.status === 'refuse').length
    return { employee, missing: Math.max(0, expected - provided), refused }
  }).filter((item) => item.missing > 0 || item.refused > 0).sort((a, b) => (b.missing + b.refused) - (a.missing + a.refused)).slice(0, 8), [employees.data, allDocuments.data, requirements.data])
  useEffect(() => () => { if (preview?.blobUrl) URL.revokeObjectURL(preview.blobUrl) }, [preview?.blobUrl])
  const showPreview = async (document: Document) => {
    setPreviewError(null)
    try {
      const blobUrl = await getEmployeeDocumentBlobUrl(document.id)
      setPreview({ document, blobUrl })
    } catch (error) {
      setPreviewError(error instanceof Error ? error : new Error('Prévisualisation indisponible.'))
    }
  }
  const copyPrivateLink = async (documentId: string) => {
    await navigator.clipboard.writeText(getEmployeeDocumentUrl(documentId))
    setCopied(true)
    window.setTimeout(() => setCopied(false), 2000)
  }

  return (
    <>
      <PageHeader title="Dossiers administratifs salariés" description="Consultez et préparez les dossiers pour les salariés. Les fichiers restent privés et l’accès est journalisé." />
      <section className="panel mb-6 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div><h2 className="text-base font-semibold">Suivi des dossiers à compléter</h2><p className="text-xs text-ink-muted">Salariés avec des pièces manquantes ou refusées.</p></div>
          <span className="rounded-full bg-signal-light px-2.5 py-1 text-xs font-medium text-signal">{incompleteEmployees.length} dossier(s) à traiter</span>
        </div>
        {allDocuments.isLoading || requirements.isLoading ? <Spinner /> : incompleteEmployees.length === 0 ? <p className="mt-4 text-sm text-phosphate">Tous les dossiers visibles sont complets.</p> : (
          <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
            {incompleteEmployees.map(({ employee, missing, refused }) => <button key={employee.id} type="button" className="rounded-lg border border-line p-3 text-left transition-colors hover:bg-paper-dark" onClick={() => setEmployeeId(employee.id)}>
              <p className="truncate text-sm font-medium">{employee.first_name} {employee.last_name}</p>
              <p className="mt-1 text-xs text-ink-muted">{employee.employee_number}</p>
              <p className="mt-2 text-xs"><span className="text-ink-muted">{missing} manquant(s)</span>{refused > 0 && <span className="ml-2 text-signal">{refused} refusé(s)</span>}</p>
            </button>)}
          </div>
        )}
      </section>
      <div className="grid gap-6 lg:grid-cols-[minmax(16rem,22rem)_1fr]">
        <section className="panel">
          <div className="border-b border-line p-4">
            <label className="relative block">
              <span className="sr-only">Rechercher un salarié</span>
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-ink-muted" aria-hidden />
              <input className="field w-full pl-9" placeholder="Nom ou matricule…" value={search} onChange={(event) => setSearch(event.target.value)} />
            </label>
          </div>
          <div className="max-h-[32rem] overflow-auto">
            {employees.isLoading ? <Spinner /> : filteredEmployees.map((employee) => (
              <button key={employee.id} type="button" className={`flex w-full items-center gap-3 border-b border-line/70 px-4 py-3 text-left hover:bg-paper-dark ${employee.id === employeeId ? 'bg-river-light' : ''}`} onClick={() => setEmployeeId(employee.id)}>
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-paper-dark text-xs font-semibold text-river">{employee.first_name[0]}{employee.last_name[0]}</span>
                <span className="min-w-0"><strong className="block truncate text-sm">{employee.first_name} {employee.last_name}</strong><span className="text-xs text-ink-muted">{employee.employee_number} · {employee.status}</span></span>
              </button>
            ))}
          </div>
        </section>
        <section className="panel">
          {!selected ? <div className="p-8 text-center text-sm text-ink-muted">Sélectionnez un salarié pour ouvrir son dossier administratif.</div> : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-4">
                <div><h2 className="text-lg font-semibold">{selected.first_name} {selected.last_name}</h2><p className="text-sm text-ink-muted">{selected.employee_number}</p></div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button size="sm" variant="ghost" loading={bundleLoading} icon={<Printer className="h-3.5 w-3.5" />} onClick={() => void openBundle()}>Ouvrir le dossier PDF</Button>
                  <span className="inline-flex items-center gap-2 text-xs text-ink-muted"><LockKeyhole className="h-4 w-4 text-river" /> Accès RH/admin</span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 border-b border-line/70 p-4 sm:grid-cols-4">
                <Summary label="Manquants" value={dossierStats.missing} tone="text-ink-muted" />
                <Summary label="En attente" value={dossierStats.pending} tone="text-orange-700" />
                <Summary label="Validés" value={dossierStats.validated} tone="text-phosphate" />
                <Summary label="Refusés" value={dossierStats.refused} tone="text-signal" />
              </div>
              <ErrorNote error={documents.error || requirements.error || upload.error || review.error || archive.error || remove.error || bundleError} />
              <div className="space-y-5 p-4">
                {sections.map(([code, label]) => {
                  const rows = (requirements.data ?? []).filter((requirement) => requirement.section_code === code)
                  const sectionRows = rows.flatMap((requirement) => Array.from({ length: requirement.code === 'situation_matrimoniale' ? selected.spouses_count : requirement.code === 'actes_enfants' ? selected.children_count : 1 }, (_, index) => ({ requirement, slot: index + 1 })))
                  const sectionCompleted = sectionRows.filter(({ requirement, slot }) => documentMap.get(`${requirement.code}:${slot}`)?.status === 'valide').length
                  const sectionPending = sectionRows.filter(({ requirement, slot }) => {
                    const document = documentMap.get(`${requirement.code}:${slot}`)
                    return !!document && document.status !== 'valide'
                  }).length
                  return <div key={code} className="overflow-hidden rounded-xl border border-line bg-paper">
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-paper-dark/60 px-4 py-3">
                      <div><h3 className="text-sm font-semibold text-ink">{label}</h3><p className="mt-0.5 text-xs text-ink-muted">{sectionRows.length} pièce(s) attendue(s) · {sectionCompleted} validée(s){sectionPending > 0 ? ` · ${sectionPending} à vérifier` : ''}</p></div>
                      <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${sectionCompleted === sectionRows.length && sectionRows.length > 0 ? 'bg-phosphate-light text-phosphate' : 'bg-paper text-ink-soft'}`}>{sectionCompleted}/{sectionRows.length}</span>
                    </div>
                    <div className="grid gap-2 p-3 md:grid-cols-2">
                    {rows.flatMap((requirement) => Array.from({ length: requirement.code === 'situation_matrimoniale' ? selected.spouses_count : requirement.code === 'actes_enfants' ? selected.children_count : 1 }, (_, index) => ({ requirement, slot: index + 1 }))).map(({ requirement, slot }) => {
                      const document = documentMap.get(`${requirement.code}:${slot}`)
                      return <div key={`${requirement.code}:${slot}`} className={`rounded-lg border p-3 ${document?.status === 'refuse' ? 'border-signal/40 bg-signal-light/30' : document?.status === 'valide' ? 'border-phosphate/30 bg-phosphate-light/20' : 'border-line'}`}>
                        {document && <DocumentThumbnail document={document} />}
                        <div className="flex items-start gap-2"><FileText className="mt-0.5 h-4 w-4 text-river" /><div className="min-w-0 flex-1"><p className="text-sm font-medium">{requirement.title}{(requirement.code === 'situation_matrimoniale' || requirement.code === 'actes_enfants') ? ` n°${slot}` : ''}</p><p className="text-xs text-ink-muted">{document?.file_name ?? 'Aucun fichier fourni'}</p></div><Badge value={document?.status === 'valide' ? 'Validé' : document?.status === 'refuse' ? 'Refusé' : document ? 'En attente' : 'Manquant'} /></div>
                        {document?.rejection_reason && <p className="mt-2 text-xs text-signal">Motif : {document.rejection_reason}</p>}
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Button size="sm" variant="ghost" icon={<Eye className="h-3.5 w-3.5" />} disabled={!document} onClick={() => document && void showPreview(document)}>Prévisualiser</Button>
                          {document && <Button size="sm" variant="ghost" icon={<Copy className="h-3.5 w-3.5" />} onClick={() => void copyPrivateLink(document.id)}>{copied ? 'Lien copié' : 'Lien privé'}</Button>}
                          {document?.status !== 'refuse' && document && <Button size="sm" variant="primary" icon={<CheckCircle2 className="h-3.5 w-3.5" />} disabled={document.status === 'valide'} onClick={() => { setReviewReason(''); setReviewTarget({ document, status: 'valide' }) }}>Valider</Button>}
                          {document?.status !== 'refuse' && document && <Button size="sm" variant="danger" icon={<XCircle className="h-3.5 w-3.5" />} onClick={() => { setReviewReason(''); setReviewTarget({ document, status: 'refuse' }) }}>Refuser</Button>}
                          {document?.status === 'refuse' && <Button size="sm" variant="ghost" loading={archive.isPending} icon={<Archive className="h-3.5 w-3.5" />} onClick={() => archive.mutate(document.id)}>Archiver</Button>}
                          {document && <Button size="sm" variant="danger" loading={remove.isPending} icon={<Trash2 className="h-3.5 w-3.5" />} onClick={() => { if (window.confirm(`Supprimer ${document.file_name} définitivement ?`)) remove.mutate(document.id) }}>Supprimer</Button>}
                          <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded px-2.5 py-1.5 text-xs font-medium text-ink-soft hover:bg-paper hover:text-ink">
                            <Upload className="h-3.5 w-3.5" /> Déposer
                            <input className="sr-only" type="file" accept=".pdf,.doc,.docx,image/jpeg,image/png" capture="environment" onChange={(event) => { const file = event.target.files?.[0]; if (file) upload.mutate({ requirementCode: requirement.code, slot, file }); event.target.value = '' }} />
                          </label>
                        </div>
                      </div>
                    })}
                  </div>
                  </div>
                })}
              </div>
              <Modal open={!!preview} onClose={() => setPreview(null)} title={preview?.document.title ?? 'Prévisualisation du document'}>
                {preview && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-3 rounded-lg bg-paper-dark p-3 text-sm">
                      <span className="truncate font-medium">{preview.document.file_name}</span>
                      <span className="inline-flex items-center gap-1 text-xs text-ink-muted"><LinkIcon className="h-3.5 w-3.5" /> Lien privé</span>
                    </div>
                    {isPdfFile(preview.document.file_name) ? (
                      <iframe title={`Prévisualisation de ${preview.document.file_name}`} src={preview.blobUrl} className="h-[60vh] w-full rounded border border-line" />
                    ) : isImageFile(preview.document.file_name) ? (
                      <img src={preview.blobUrl} alt={`Prévisualisation de ${preview.document.title}`} className="max-h-[60vh] w-full rounded border border-line object-contain" />
                    ) : (
                      <div className="flex h-48 flex-col items-center justify-center gap-2 rounded border border-line bg-blue-50 text-blue-700">
                        <FileText className="h-10 w-10" aria-hidden />
                        <p className="text-sm font-semibold">Document Word</p>
                        <p className="max-w-sm px-4 text-center text-xs">La prévisualisation du contenu Word n’est pas disponible dans le navigateur. Utilisez le téléchargement ou le lien privé.</p>
                      </div>
                    )}
                    <p className="text-xs text-ink-muted">Le contenu est servi par une URL temporaire authentifiée et n’est pas un lien public.</p>
                  </div>
                )}
              </Modal>
              <Modal
                open={!!reviewTarget}
                onClose={() => { if (!review.isPending) { setReviewTarget(null); setReviewReason('') } }}
                title={reviewTarget?.status === 'valide' ? 'Valider le document' : 'Refuser le document'}
                footer={
                  <div className="flex justify-end gap-2">
                    <Button type="button" variant="ghost" onClick={() => { setReviewTarget(null); setReviewReason('') }} disabled={review.isPending}>Annuler</Button>
                    <Button type="button" variant={reviewTarget?.status === 'refuse' ? 'danger' : 'primary'} loading={review.isPending} onClick={() => review.mutate()}>
                      {reviewTarget?.status === 'valide' ? 'Confirmer la validation' : 'Confirmer le refus'}
                    </Button>
                  </div>
                }

              >
                <div className="space-y-3">
                  <p className="text-sm text-ink-soft">{reviewTarget?.document.file_name}</p>
                  {reviewTarget?.status === 'refuse' ? (
                    <label className="block">
                      <span className="label">Motif du refus <span className="text-signal">*</span></span>
                      <textarea className="field min-h-24 w-full" value={reviewReason} onChange={(event) => setReviewReason(event.target.value)} placeholder="Ex. document illisible ou expiré" required />
                    </label>
                  ) : (
                    <p className="text-sm text-ink-soft">Le document sera marqué comme validé et cette décision sera journalisée.</p>
                  )}
                  <ErrorNote error={review.error} />
                </div>
              </Modal>
              <ErrorNote error={previewError} />
            </>
          )}
        </section>
      </div>
    </>
  )
}

function Summary({ label, value, tone }: { label: string; value: number; tone: string }) {
  return <div className="rounded-lg border border-line/70 bg-paper-dark px-3 py-2"><p className={`text-xl font-semibold tabular-nums ${tone}`}>{value}</p><p className="text-[11px] text-ink-muted">{label}</p></div>
}
