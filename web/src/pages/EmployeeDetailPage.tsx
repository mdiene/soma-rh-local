import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Lock, Save, Target } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { omit, dataApi, unwrap, type Tables } from '../lib/api'
import { selectable, useAgreements, useCompany, useContractTypes, useDesignations, useGrades, usePaymentModes } from '../lib/queries'
import { useAuth } from '../lib/auth'
import { currentPeriod, fcfa, monthBounds, monthLabel } from '../lib/format'
import { Badge, Button, ErrorNote, Modal, PageHeader, Section, SelectField, Spinner, TextField } from '../components/ui'
import { EmployeeFicheButton } from '../components/EmployeeFiche'

type Emp = Tables<'employees'>
type Assign = Tables<'salary_structure_assignments'>

const EMPTY: Partial<Emp> = {
  employment_type: 'CDI', status: 'Active', payment_mode: 'espèces', marital_status: 'Célibataire',
  spouses_count: 0, children_count: 0, trimf_parts: 1, ir_parts: 1, nationality: 'sénégalaise',
}

export default function EmployeeDetailPage() {
  const { id } = useParams()
  const isNew = id === 'nouveau'
  const nav = useNavigate()
  const location = useLocation()
  const qc = useQueryClient()
  const { can } = useAuth()
  const company = useCompany()
  const designations = useDesignations()
  const agreements = useAgreements()
  const contractTypes = useContractTypes()
  const paymentModes = usePaymentModes()

  const emp = useQuery({
    queryKey: ['employee', id],
    enabled: !isNew,
    queryFn: async () => unwrap(await dataApi.from('employees').select('*').eq('id', id!).single()),
  })
  const [form, setForm] = useState<Partial<Emp>>(EMPTY)
  useEffect(() => { if (emp.data) setForm(emp.data) }, [emp.data])
  const grades = useGrades(form.agreement_code)
  const set = (k: keyof Emp) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const v = e.target.type === 'number' ? (e.target.value === '' ? null : Number(e.target.value)) : (e.target.value === '' ? null : e.target.value)
    setForm((f) => ({ ...f, [k]: v }))
  }

  // matricule : attribué par la base à la création (séquence + déclencheur), jamais envoyé par le formulaire
  const preview = useQuery({
    queryKey: ['next-employee-number'],
    enabled: isNew,
    queryFn: async () => unwrap(await dataApi.rpc('preview_employee_number')) as string,
  })
  const created = (location.state as { createdNumber?: string } | null)?.createdNumber
  const [changing, setChanging] = useState(false)

  const save = useMutation({
    mutationFn: async () => {
      const payload = omit({ ...form, company_id: form.company_id ?? company.data?.id } as Emp, 'created_at', 'updated_at', 'employee_number')
      if (isNew) {
        return unwrap(await dataApi.from('employees').insert(omit(payload, 'id') as Emp).select().single())
      }
      return unwrap(await dataApi.from('employees').update(payload).eq('id', id!).select().single())
    },
    onSuccess: (row) => {
      qc.invalidateQueries({ queryKey: ['employees'] })
      qc.invalidateQueries({ queryKey: ['employee', row.id] })
      qc.invalidateQueries({ queryKey: ['next-employee-number'] })
      if (isNew) nav(`/salaries/${row.id}`, { replace: true, state: { createdNumber: row.employee_number } })
    },
  })

  if (!isNew && emp.isLoading) return <Spinner />
  const readOnly = !can('rh')

  return (
    <>
      <Link to="/salaries" className="no-print mb-3 inline-flex items-center gap-1 text-sm text-ink-soft hover:text-river"><ArrowLeft className="h-4 w-4" /> Salariés</Link>
      <PageHeader
        title={isNew ? 'Nouveau salarié' : `${form.first_name ?? ''} ${form.last_name ?? ''}`}
        description={isNew ? 'Renseignez au minimum le nom, le contrat et la date d’entrée. Le matricule est attribué automatiquement.' : <span className="inline-flex items-center gap-2">{form.employee_number} <Badge value={form.status ?? 'Active'} /></span>}
        actions={<>
          {!isNew && emp.data && <EmployeeFicheButton employee={emp.data} />}
          {!readOnly && <Button variant="primary" icon={<Save className="h-4 w-4" />} loading={save.isPending} onClick={() => save.mutate()}>{isNew ? 'Créer le salarié' : 'Enregistrer la fiche'}</Button>}
        </>}
      />
      <ErrorNote error={emp.error || save.error} />
      {created && !save.isSuccess && <p className="mb-4 rounded border border-river/30 bg-river-light px-3 py-2 text-sm text-river-dark">Salarié créé avec le matricule <strong>{created}</strong>.</p>}
      {save.isSuccess && !isNew && <p className="mb-4 rounded border border-river/30 bg-river-light px-3 py-2 text-sm text-river-dark">Fiche enregistrée.</p>}
      {!isNew && emp.data && (
        <ChangeNumberModal open={changing} onClose={() => setChanging(false)} employeeId={emp.data.id} current={emp.data.employee_number} />
      )}

      <fieldset disabled={readOnly} className="grid gap-6 xl:grid-cols-2">
        <Section title="Identité">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <span className="label">Matricule</span>
              <div className="flex items-center gap-2">
                <span className="field inline-flex items-center gap-2 bg-paper font-semibold" aria-live="polite">
                  <Lock className="h-3.5 w-3.5 text-ink-muted" aria-hidden />
                  {isNew ? (preview.data ?? '…') : form.employee_number}
                </span>
                {!isNew && can('admin') && (
                  <button type="button" className="whitespace-nowrap text-xs text-river hover:underline" onClick={() => setChanging(true)}>Corriger…</button>
                )}
              </div>
              <p className="mt-1 text-xs text-ink-muted">
                {isNew ? 'Prochain matricule, attribué définitivement à l’enregistrement.' : 'Attribué automatiquement, non modifiable.'}
              </p>
            </div>
            <SelectField label="Sexe" value={form.gender ?? ''} onChange={set('gender')}><option value="">—</option><option value="M">Masculin</option><option value="F">Féminin</option></SelectField>
            <TextField label="Prénom" required value={form.first_name ?? ''} onChange={set('first_name')} />
            <TextField label="Nom" required value={form.last_name ?? ''} onChange={set('last_name')} />
            <TextField label="Date de naissance" type="date" value={form.date_of_birth ?? ''} onChange={set('date_of_birth')} />
            <TextField label="Lieu de naissance" value={form.place_of_birth ?? ''} onChange={set('place_of_birth')} />
            <TextField label="Nationalité" value={form.nationality ?? ''} onChange={set('nationality')} />
            <TextField label="N° CNI ou passeport" value={form.id_document_number ?? ''} onChange={set('id_document_number')} />
            <TextField label="Délivrée le" type="date" value={form.id_issue_date ?? ''} onChange={set('id_issue_date')} />
            <TextField label="Expire le" type="date" value={form.id_expiry_date ?? ''} onChange={set('id_expiry_date')} />
            <TextField label="Père" value={form.father_name ?? ''} onChange={set('father_name')} />
            <TextField label="Mère" value={form.mother_name ?? ''} onChange={set('mother_name')} />
          </div>
        </Section>

        <Section title="Coordonnées">
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField label="Adresse" className="sm:col-span-2" value={form.address ?? ''} onChange={set('address')} />
            <TextField label="Téléphone personnel" value={form.phone_personal ?? ''} onChange={set('phone_personal')} />
            <TextField label="Téléphone professionnel" value={form.phone_work ?? ''} onChange={set('phone_work')} />
            <TextField label="E-mail personnel" type="email" value={form.email_personal ?? ''} onChange={set('email_personal')} />
            <TextField label="E-mail professionnel" type="email" value={form.email_work ?? ''} onChange={set('email_work')} />
            <TextField label="Personne à prévenir" value={form.emergency_contact_name ?? ''} onChange={set('emergency_contact_name')} />
            <TextField label="Téléphone d'urgence" value={form.emergency_contact_phone ?? ''} onChange={set('emergency_contact_phone')} />
            <TextField label="N° IPRES" value={form.ipres_number ?? ''} onChange={set('ipres_number')} />
            <TextField label="N° allocations familiales (CSS)" value={form.css_number ?? ''} onChange={set('css_number')} />
          </div>
        </Section>

        <Section title="Famille et fiscalité">
          <div className="grid gap-3 sm:grid-cols-3">
            <SelectField label="Situation de famille" value={form.marital_status ?? ''} onChange={set('marital_status')}>
              {['Marié(e)', 'Célibataire', 'Divorcé(e)', 'Veuf(ve)'].map((s) => <option key={s}>{s}</option>)}
            </SelectField>
            <TextField label="Conjoint(e)s" type="number" min={0} value={form.spouses_count ?? 0} onChange={set('spouses_count')} />
            <TextField label="Enfants à charge" type="number" min={0} value={form.children_count ?? 0} onChange={set('children_count')} />
            <TextField label="Parts TRIMF" type="number" step="0.5" min={1} value={form.trimf_parts ?? 1} onChange={set('trimf_parts')} />
            <TextField label="Parts IR (quotient familial)" type="number" step="0.5" min={1} max={5} value={form.ir_parts ?? 1} onChange={set('ir_parts')} hint="De 1 à 5 parts" />
          </div>
        </Section>

        <Section title="Contrat et classification">
          <div className="grid gap-3 sm:grid-cols-2">
            <SelectField label="Emploi" value={form.designation_id ?? ''} onChange={set('designation_id')}>
              <option value="">—</option>
              {selectable(designations.data, (d) => d.id === form.designation_id).map((d) => <option key={d.id} value={d.id}>{d.name}{d.is_active ? '' : ' (désactivé)'}</option>)}
            </SelectField>
            <SelectField label="Type de contrat" value={form.employment_type ?? 'CDI'} onChange={set('employment_type')}>
              {selectable(contractTypes.data, (c) => c.code === form.employment_type).map((c) => <option key={c.code} value={c.code}>{c.code} — {c.label}{c.is_active ? '' : ' (désactivé)'}</option>)}
            </SelectField>
            <SelectField label="Convention collective" className="sm:col-span-2" value={form.agreement_code ?? ''} onChange={(e) => setForm((f) => ({ ...f, agreement_code: e.target.value || null, grade_id: null }))}>
              <option value="">—</option>
              {selectable(agreements.data, (a) => a.code === form.agreement_code).map((a) => <option key={a.code} value={a.code}>{a.name}{a.is_active ? '' : ' (désactivée)'}</option>)}
            </SelectField>
            <SelectField label="Catégorie" className="sm:col-span-2" value={form.grade_id ?? ''} onChange={set('grade_id')} disabled={!form.agreement_code}>
              <option value="">—</option>
              {selectable(grades.data, (g) => g.id === form.grade_id).map((g) => (
                <option key={g.id} value={g.id}>{g.code} — {g.staff_status}{g.grade_class ? ` (classe ${g.grade_class})` : ''} — {fcfa(g.base_salary)} F</option>
              ))}
            </SelectField>
            <TextField label="Date d'entrée" type="date" required value={form.date_of_joining ?? ''} onChange={set('date_of_joining')} />
            <TextField label="Date de retour de congé" type="date" value={form.leave_return_date ?? ''} onChange={set('leave_return_date')} />
            <TextField label="Début du contrat en cours" type="date" value={form.contract_start ?? ''} onChange={set('contract_start')} />
            <TextField label="Fin du contrat en cours" type="date" value={form.contract_end ?? ''} onChange={set('contract_end')} />
            <TextField label="Date de sortie" type="date" value={form.relieving_date ?? ''} onChange={set('relieving_date')} />
            <SelectField label="Motif de sortie" value={form.exit_reason ?? ''} onChange={set('exit_reason')}>
              <option value="">—</option>
              {['DEMISSION', 'LICENCIEMENT', 'RETRAITE', 'DECES', 'FIN DE CONTRAT'].map((s) => <option key={s}>{s}</option>)}
            </SelectField>
            <SelectField label="État" value={form.status ?? 'Active'} onChange={set('status')}>
              <option value="Active">Actif</option><option value="Suspended">Suspendu</option><option value="Inactive">Inactif</option><option value="Left">Sorti</option>
            </SelectField>
          </div>
        </Section>

        <Section title="Paiement">
          <div className="grid gap-3 sm:grid-cols-2">
            <SelectField label="Mode de paiement" value={form.payment_mode ?? 'espèces'} onChange={set('payment_mode')}>
              {selectable(paymentModes.data, (m) => m.code === form.payment_mode).map((m) => <option key={m.code} value={m.code}>{m.label}{m.is_active ? '' : ' (désactivé)'}</option>)}
            </SelectField>
            <TextField label="Banque" value={form.bank_name ?? ''} onChange={set('bank_name')} />
            <TextField label="RIB" className="sm:col-span-2" value={form.bank_account ?? ''} onChange={set('bank_account')} />
          </div>
        </Section>
      </fieldset>

      {!isNew && emp.data && (
        <div className="mt-6 grid gap-6 xl:grid-cols-2">
          <SalaryAssignment employee={emp.data} />
          <SlipHistory employeeId={emp.data.id} />
        </div>
      )}
    </>
  )
}

/* ---------------------------------------------------- structure salariale */
function SalaryAssignment({ employee }: { employee: Emp }) {
  const { can } = useAuth()
  const qc = useQueryClient()
  const q = useQuery({
    queryKey: ['assignment', employee.id],
    queryFn: async () => unwrap(await dataApi.from('salary_structure_assignments').select('*').eq('employee_id', employee.id).order('from_date', { ascending: false })),
  })
  const structures = useQuery({
    queryKey: ['structures'],
    queryFn: async () => unwrap(await dataApi.from('salary_structures').select('*').eq('is_active', true)),
  })
  // affectation éditée : la plus récente par défaut, ou une version choisie dans l'historique
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const current = q.data?.find((a) => a.id === selectedId) ?? q.data?.[0]
  const [f, setF] = useState<Partial<Assign>>({})
  useEffect(() => {
    setF(current ?? { from_date: currentPeriod(), sursalaire: 0, fees: 0, other_fixed: 0, transport_mode: 'Prime de transport', leave_paid_monthly: true })
  }, [current])
  const [period, setPeriod] = useState(currentPeriod())
  const original = f.id ? q.data?.find((a) => a.id === f.id) : undefined
  const movedEarlier = !!original && !!f.from_date && f.from_date < original.from_date

  const save = useMutation({
    mutationFn: async () => {
      const fromDate = f.from_date
      if (!fromDate) throw new Error('La date « En vigueur à partir du » est obligatoire.')
      const duplicate = q.data?.find((a) => a.id !== f.id && a.from_date === fromDate)
      if (duplicate) throw new Error(`Une affectation commence déjà le ${fromDate.split('-').reverse().join('/')}. Modifiez-la depuis l'historique ou choisissez une autre date.`)
      const payload = omit({ ...f, employee_id: employee.id, structure_id: f.structure_id ?? structures.data?.[0]?.id } as Assign, 'id', 'created_at', 'updated_at')
      // modification d'une affectation existante : mise à jour par identifiant (la date peut changer,
      // y compris vers une date antérieure) ; sinon création d'une nouvelle version
      if (f.id) return unwrap(await dataApi.from('salary_structure_assignments').update(payload).eq('id', f.id).select().single())
      return unwrap(await dataApi.from('salary_structure_assignments').insert(payload).select().single())
    },
    onSuccess: (row) => { setSelectedId(row.id); qc.invalidateQueries({ queryKey: ['assignment', employee.id] }) },
  })
  function newVersion() {
    save.reset()
    setSelectedId(null)
    setF({ ...omit((current ?? {}) as Assign, 'id', 'created_at', 'updated_at'), from_date: currentPeriod() })
  }
  const solve = useMutation({
    mutationFn: async () => {
      const { start, end } = monthBounds(period)
      return unwrap(await dataApi.rpc('solve_sursalaire_for_net', { p_employee_id: employee.id, p_period_start: start, p_period_end: end, p_target_net: Number(f.target_net) }))
    },
    onSuccess: (v) => setF((x) => ({ ...x, sursalaire: Math.round(Number(v) * 100) / 100 })),
  })
  const num = (k: keyof Assign) => (e: React.ChangeEvent<HTMLInputElement>) => setF((x) => ({ ...x, [k]: e.target.value === '' ? null : Number(e.target.value) }))
  const readOnly = !can('paie')

  return (
    <Section
      title="Structure salariale"
      actions={!readOnly && (
        <div className="flex gap-2">
          {q.data && q.data.length > 0 && <Button size="sm" variant="ghost" onClick={newVersion}>Nouvelle version</Button>}
          <Button size="sm" variant="primary" loading={save.isPending} onClick={() => save.mutate()} icon={<Save className="h-3.5 w-3.5" />}>Enregistrer</Button>
        </div>
      )}
    >
      {q.isLoading ? <Spinner /> : (
        <fieldset disabled={readOnly} className="space-y-4">
          {q.data && q.data.length > 1 && (
            <div className="flex flex-wrap items-center gap-1.5 text-xs" aria-label="Historique des affectations">
              <span className="text-ink-muted">Historique :</span>
              {q.data.map((a) => (
                <button key={a.id} type="button" onClick={() => { save.reset(); setSelectedId(a.id) }}
                  className={`rounded border px-2 py-0.5 ${a.id === f.id ? 'border-river bg-river-light font-semibold text-river-dark' : 'border-line hover:border-river'}`}>
                  depuis le {a.from_date.split('-').reverse().join('/')}
                </button>
              ))}
            </div>
          )}
          <p className="text-xs text-ink-soft">
            {f.id ? 'Vous modifiez l’affectation existante' : 'Nouvelle affectation'} : la date peut être avancée ou reculée. Les bulletins déjà validés ne sont jamais recalculés ;
            la nouvelle valeur s’applique aux traitements calculés ou recalculés ensuite.
          </p>
          {movedEarlier && (
            <p className="rounded border border-phosphate bg-phosphate-light px-3 py-2 text-xs text-ink">
              Date avancée du {original!.from_date.split('-').reverse().join('/')} au {f.from_date!.split('-').reverse().join('/')} : les mois validés de cette période gardent leurs bulletins ; un mois encore « Calculé » prendra cette structure s’il est relancé.
            </p>
          )}
          {save.isSuccess && <p role="status" className="rounded border border-river/30 bg-river-light px-3 py-2 text-xs text-river-dark">Structure salariale enregistrée.</p>}
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField label="En vigueur à partir du" type="date" value={f.from_date ?? ''} onChange={(e) => setF((x) => ({ ...x, from_date: e.target.value }))} />
            <TextField label="Salaire de base (vide = minimum de la catégorie)" type="number" value={f.base_salary ?? ''} onChange={num('base_salary')} />
            <TextField label="Sursalaire" type="number" step="0.01" value={f.sursalaire ?? 0} onChange={num('sursalaire')} />
            <TextField label="Honoraires (prestataires)" type="number" value={f.fees ?? 0} onChange={num('fees')} />
            <TextField label="Autre élément fixe" type="number" value={f.other_fixed ?? 0} onChange={num('other_fixed')} />
            <SelectField label="Transport" value={f.transport_mode ?? 'Prime de transport'} onChange={(e) => setF((x) => ({ ...x, transport_mode: e.target.value }))}>
              <option>Prime de transport</option><option>Indemnité kilométrique</option><option>Aucun</option>
            </SelectField>
            <SelectField label="Congé payé chaque mois ?" value={f.leave_paid_monthly ? 'oui' : 'non'} onChange={(e) => setF((x) => ({ ...x, leave_paid_monthly: e.target.value === 'oui' }))} hint="Non : une provision congé de 1/12 du brut est constituée.">
              <option value="oui">Oui</option><option value="non">Non (provision)</option>
            </SelectField>
          </div>
          <div className="rounded border border-line bg-paper p-3">
            <p className="text-sm font-medium">Net à simuler</p>
            <p className="mb-2 text-xs text-ink-soft">Calcule le sursalaire qui donne exactement ce net à payer (équivalent de la macro « Valeur cible » du classeur).</p>
            <div className="flex flex-wrap items-end gap-2">
              <TextField label="Net cible (F CFA)" type="number" value={f.target_net ?? ''} onChange={num('target_net')} className="w-40" />
              <TextField label="Mois de référence" type="month" value={period.slice(0, 7)} onChange={(e) => setPeriod(`${e.target.value}-01`)} className="w-44" />
              <Button icon={<Target className="h-4 w-4" />} loading={solve.isPending} disabled={!f.target_net} onClick={() => solve.mutate()}>Calculer le sursalaire</Button>
            </div>
            {solve.isSuccess && <p className="mt-2 text-xs text-river-dark">Sursalaire calculé : {fcfa(solve.data as number)} F. Enregistrez pour l'appliquer.</p>}
          </div>
          <ErrorNote error={q.error || save.error || solve.error} />
        </fieldset>
      )}
    </Section>
  )
}

function SlipHistory({ employeeId }: { employeeId: string }) {
  const q = useQuery({
    queryKey: ['slips-of', employeeId],
    queryFn: async () => unwrap(await dataApi.from('salary_slips').select('id, period_start, status, gross_pay, net_pay').eq('employee_id', employeeId).neq('status', 'Annulé').order('period_start', { ascending: false })),
  })
  return (
    <Section title="Bulletins">
      {q.isLoading ? <Spinner /> : (q.data ?? []).length === 0 ? <p className="text-sm text-ink-soft">Aucun bulletin calculé pour ce salarié.</p> : (
        <table className="w-full text-sm">
          <thead><tr className="table-head"><th className="px-2 py-1.5">Mois</th><th className="px-2 py-1.5 text-right">Brut</th><th className="px-2 py-1.5 text-right">Net à payer</th><th className="px-2 py-1.5">État</th></tr></thead>
          <tbody>
            {q.data!.map((s) => (
              <tr key={s.id} className="border-b border-line/70">
                <td className="px-2 py-1.5"><Link className="text-river hover:underline" to={`/bulletins/${s.id}`}>{monthLabel(s.period_start)}</Link></td>
                <td className="px-2 py-1.5 text-right">{fcfa(s.gross_pay)}</td>
                <td className="px-2 py-1.5 text-right font-medium">{fcfa(s.net_pay)}</td>
                <td className="px-2 py-1.5"><Badge value={s.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Section>
  )
}

/** Procédure d'administration exceptionnelle : correction d'un matricule, motif obligatoire, journalisée. */
function ChangeNumberModal({ open, onClose, employeeId, current }: { open: boolean; onClose: () => void; employeeId: string; current: string }) {
  const qc = useQueryClient()
  const [value, setValue] = useState(current)
  const [reason, setReason] = useState('')
  const change = useMutation({
    mutationFn: async () => unwrap(await dataApi.rpc('admin_change_employee_number', { p_employee_id: employeeId, p_new_number: value, p_reason: reason })),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['employee', employeeId] })
      qc.invalidateQueries({ queryKey: ['employees'] })
      onClose()
    },
  })
  return (
    <Modal open={open} onClose={onClose} title={`Corriger le matricule ${current}`}
      footer={<>
        <Button variant="ghost" onClick={onClose}>Annuler</Button>
        <Button variant="primary" loading={change.isPending} disabled={!reason.trim() || value.trim().toUpperCase() === current} onClick={() => change.mutate()}>Corriger le matricule</Button>
      </>}>
      <p className="mb-3 text-sm text-ink-soft">
        Réservé aux administrateurs, pour corriger une erreur de reprise. Les bulletins déjà émis conservent l'ancien matricule. Le changement est inscrit au journal d'audit.
      </p>
      <div className="grid gap-3">
        <TextField label="Nouveau matricule" value={value} onChange={(e) => setValue(e.target.value)} hint="Format : S suivi d'au moins 4 chiffres" />
        <TextField label="Motif (obligatoire)" value={reason} onChange={(e) => setReason(e.target.value)} />
      </div>
      <div className="mt-3"><ErrorNote error={change.error} /></div>
    </Modal>
  )
}
