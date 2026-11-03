import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createColumnHelper } from '@tanstack/react-table'
import clsx from 'clsx'
import { Plus, Save, ShieldCheck } from 'lucide-react'
import { useEffect, useState } from 'react'
import { dataApi, unwrap, type Tables } from '../lib/api'
import { useAuth, type Role } from '../lib/auth'
import { useAgreements, useCompany, useComponents, useEmployees, useGrades } from '../lib/queries'
import { date, fcfa, num, pct } from '../lib/format'
import { DataTable } from '../components/DataTable'
import { AuditLogView, ReferentialManager, type RefConfig, type RefTable } from '../components/ReferentialManager'
import { Button, ErrorNote, Modal, PageHeader, Section, SelectField, Spinner, TextField } from '../components/ui'

const TABS = [
  { id: 'acces', label: 'Accès' },
  { id: 'referentiels', label: 'Référentiels RH' },
  { id: 'journal', label: 'Journal des modifications' },
  { id: 'paie', label: 'Taux et plafonds' },
  { id: 'baremes', label: 'Barèmes IR et TRIMF' },
  { id: 'rubriques', label: 'Rubriques de paie' },
  { id: 'grilles', label: 'Grilles conventionnelles' },
  { id: 'societe', label: 'Société' },
] as const
type Tab = (typeof TABS)[number]['id']

export default function SettingsPage() {
  const [tab, setTab] = useState<Tab>('acces')
  return (
    <>
      <PageHeader title="Paramètres" description="Comptes et rôles, référentiels RH, constantes de paie, barèmes, rubriques et grilles des conventions collectives." />
      <div className="no-print mb-5 flex flex-wrap gap-1 border-b border-line" role="tablist">
        {TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}
            className={clsx('-mb-px border-b-2 px-3 py-2 text-sm', tab === t.id ? 'border-river font-medium text-ink' : 'border-transparent text-ink-soft hover:text-ink')}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'acces' && <AccessTab />}
      {tab === 'referentiels' && <ReferentialsTab />}
      {tab === 'journal' && <AuditLogView />}
      {tab === 'paie' && <PayrollSettingsTab />}
      {tab === 'baremes' && <TaxTab />}
      {tab === 'rubriques' && <ComponentsTab />}
      {tab === 'grilles' && <GradesTab />}
      {tab === 'societe' && <CompanyTab />}
    </>
  )
}

/* ------------------------------------------------------------------ accès */
const ROLE_LABEL: Record<Role, string> = { admin: 'Administrateur', rh: 'RH', paie: 'Paie', manager: 'Manager', salarie: 'Salarié' }
type UserRow = { user_id: string; email: string; created_at: string; last_sign_in_at: string | null; roles: Role[]; employee_id: string | null; employee_number: string | null }

function AccessTab() {
  const { session, roles, can, refreshRoles } = useAuth()
  const qc = useQueryClient()
  const employees = useEmployees()
  const claim = useMutation({
    mutationFn: async () => unwrap(await dataApi.rpc('claim_first_admin')),
    onSuccess: () => refreshRoles(),
  })
  const users = useQuery({
    queryKey: ['admin_users'], enabled: can('admin'),
    queryFn: async () => unwrap(await dataApi.rpc('admin_list_users')) as UserRow[],
  })
  const toggle = useMutation({
    mutationFn: async ({ user, role, on }: { user: string; role: Role; on: boolean }) => on
      ? unwrap(await dataApi.from('user_roles').insert({ user_id: user, role }).select())
      : unwrap(await dataApi.from('user_roles').delete().eq('user_id', user).eq('role', role).select()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin_users'] }),
  })
  const link = useMutation({
    mutationFn: async ({ user, employee }: { user: string; employee: string | null }) =>
      unwrap(await dataApi.rpc('admin_link_employee', { p_user_id: user, p_employee_id: employee as string })),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin_users'] }),
  })

  return (
    <div className="space-y-6">
      <Section title="Mon compte">
        <p className="text-sm">{session?.user.email}</p>
        <p className="mt-1 text-sm text-ink-soft">Rôles : {roles.length ? roles.map((r) => ROLE_LABEL[r]).join(', ') : 'aucun'}</p>
        {roles.length === 0 && (
          <div className="mt-3 rounded border border-phosphate/40 bg-phosphate-light p-3 text-sm">
            <p>Si aucun administrateur n'existe encore, vous pouvez vous déclarer administrateur. Sinon, communiquez votre adresse à un administrateur.</p>
            <Button className="mt-2" variant="primary" icon={<ShieldCheck className="h-4 w-4" />} loading={claim.isPending} onClick={() => claim.mutate()}>Me déclarer administrateur</Button>
            {claim.isSuccess && claim.data === false && <p className="mt-2 text-signal">Un administrateur existe déjà : demandez-lui de vous attribuer un rôle.</p>}
          </div>
        )}
        <div className="mt-2"><ErrorNote error={claim.error} /></div>
      </Section>

      {can('admin') && (
        <Section title="Comptes et rôles">
          <p className="mb-3 text-sm text-ink-soft">Les comptes se créent depuis l'écran de connexion. Attribuez ensuite les rôles ; relier un compte à une fiche lui donne accès à « Mes bulletins ».</p>
          <ErrorNote error={users.error || toggle.error || link.error} />
          {users.isLoading ? <Spinner /> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="table-head"><th className="px-2 py-1.5">Compte</th>{(Object.keys(ROLE_LABEL) as Role[]).map((r) => <th key={r} className="px-2 py-1.5 text-center">{ROLE_LABEL[r]}</th>)}<th className="px-2 py-1.5">Fiche salarié</th><th className="px-2 py-1.5">Dernière connexion</th></tr></thead>
                <tbody>
                  {(users.data ?? []).map((u) => (
                    <tr key={u.user_id} className="border-b border-line/70">
                      <td className="px-2 py-1.5">{u.email}</td>
                      {(Object.keys(ROLE_LABEL) as Role[]).map((r) => (
                        <td key={r} className="px-2 py-1.5 text-center">
                          <input type="checkbox" aria-label={`${ROLE_LABEL[r]} pour ${u.email}`} className="h-4 w-4 accent-river"
                            checked={u.roles.includes(r)} disabled={u.user_id === session?.user.id && r === 'admin'}
                            onChange={(e) => toggle.mutate({ user: u.user_id, role: r, on: e.target.checked })} />
                        </td>
                      ))}
                      <td className="px-2 py-1.5">
                        <select className="field py-1" aria-label={`Fiche liée à ${u.email}`} value={u.employee_id ?? ''} onChange={(e) => link.mutate({ user: u.user_id, employee: e.target.value || null })}>
                          <option value="">—</option>
                          {(employees.data ?? []).map((e) => <option key={e.id} value={e.id}>{e.employee_number} — {e.first_name} {e.last_name}</option>)}
                        </select>
                      </td>
                      <td className="px-2 py-1.5 text-ink-soft">{date(u.last_sign_in_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>
      )}
    </div>
  )
}

/* ------------------------------------------------------- taux et plafonds */
const SETTING_FIELDS: { key: keyof Tables<'payroll_settings'>; label: string; kind: 'rate' | 'amount' | 'number' }[] = [
  { key: 'monthly_hours', label: 'Heures mensuelles', kind: 'number' },
  { key: 'cfce_rate', label: 'CFCE (patronal)', kind: 'rate' },
  { key: 'brs_rate', label: 'BRS prestataires', kind: 'rate' },
  { key: 'ipres_rg_ceiling', label: 'Plafond IPRES régime général', kind: 'amount' },
  { key: 'ipres_rg_rate', label: 'Taux IPRES RG global', kind: 'rate' },
  { key: 'ipres_rg_employee_share', label: 'Part salariale IPRES RG', kind: 'rate' },
  { key: 'ipres_rc_ceiling', label: 'Plafond IPRES régime cadre', kind: 'amount' },
  { key: 'ipres_rc_rate', label: 'Taux IPRES RC global', kind: 'rate' },
  { key: 'ipres_rc_employee_share', label: 'Part salariale IPRES RC', kind: 'rate' },
  { key: 'css_ceiling', label: 'Plafond CSS', kind: 'amount' },
  { key: 'css_af_rate', label: 'CSS allocations familiales', kind: 'rate' },
  { key: 'css_at_rate', label: 'CSS accident du travail', kind: 'rate' },
  { key: 'ipm_ceiling', label: 'Plafond IPM', kind: 'amount' },
  { key: 'ipm_employee_share', label: 'Part salariale IPM', kind: 'rate' },
  { key: 'transport_allowance', label: 'Prime de transport mensuelle', kind: 'amount' },
  { key: 'km_allowance', label: 'Indemnité kilométrique mensuelle', kind: 'amount' },
  { key: 'smig_hourly', label: 'SMIG horaire', kind: 'number' },
  { key: 'meal_allowance_factor', label: 'Panier : multiple du SMIG horaire', kind: 'number' },
  { key: 'ir_abatement_rate', label: 'Abattement IR', kind: 'rate' },
  { key: 'ir_abatement_cap', label: "Plafond de l'abattement IR (annuel)", kind: 'amount' },
  { key: 'precarity_rate', label: 'Indemnité de précarité CDD', kind: 'rate' },
  { key: 'seniority_min_years', label: "Ancienneté minimale pour la prime (ans)", kind: 'number' },
]

function PayrollSettingsTab() {
  const { can } = useAuth()
  const qc = useQueryClient()
  const q = useQuery({
    queryKey: ['payroll_settings'],
    queryFn: async () => unwrap(await dataApi.from('payroll_settings').select('*').order('effective_from', { ascending: false })),
  })
  const current = q.data?.[0]
  const [f, setF] = useState<Partial<Tables<'payroll_settings'>>>({})
  useEffect(() => { if (current) setF(current) }, [current])
  const save = useMutation({
    mutationFn: async () => unwrap(await dataApi.from('payroll_settings').update(f).eq('id', current!.id).select()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['payroll_settings'] }),
  })
  if (q.isLoading) return <Spinner />
  return (
    <Section
      title={`Paramètres en vigueur depuis le ${date(current?.effective_from)}`}
      actions={can('paie') && <Button size="sm" variant="primary" icon={<Save className="h-3.5 w-3.5" />} loading={save.isPending} onClick={() => save.mutate()}>Enregistrer</Button>}
    >
      <p className="mb-4 max-w-prose text-sm text-ink-soft">Les taux s'expriment en fraction (0,056 = 5,6 %). Une modification s'applique aux prochains calculs ; les bulletins déjà validés ne changent pas.</p>
      <fieldset disabled={!can('paie')} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {SETTING_FIELDS.map((s) => (
          <TextField key={s.key} label={s.label} type="number" step="any" value={(f[s.key] as number) ?? ''}
            hint={s.kind === 'rate' ? pct(f[s.key] as number) : s.kind === 'amount' ? `${fcfa(f[s.key] as number)} F` : undefined}
            onChange={(e) => setF({ ...f, [s.key]: Number(e.target.value) })} />
        ))}
      </fieldset>
      <h3 className="mb-1 mt-6 text-sm font-semibold">Règles de calcul</h3>
      <p className="mb-3 max-w-prose text-xs text-ink-muted">Arbitrages D10 (voir docs/ARBITRAGES_PAIE.md). La valeur « Excel » rétablit l'ancien calcul du classeur.</p>
      <fieldset disabled={!can('paie')} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <SelectField label="Transport et km en cas d'absence" value={f.allowance_absence_basis ?? 'hours'}
          hint="Heures : l'indemnité baisse au prorata des heures d'absence."
          onChange={(e) => setF({ ...f, allowance_absence_basis: e.target.value })}>
          <option value="hours">Au prorata des heures d'absence</option>
          <option value="excel">Comme le classeur Excel (heures ÷ 8)</option>
        </SelectField>
        <SelectField label="IPM des prestataires" value={f.ipm_on_contractors ? 'oui' : 'non'}
          hint="Non : les prestataires ne cotisent pas à l'IPM."
          onChange={(e) => setF({ ...f, ipm_on_contractors: e.target.value === 'oui' })}>
          <option value="non">Pas d'IPM</option>
          <option value="oui">IPM appliquée (comme le classeur)</option>
        </SelectField>
        <SelectField label="Base de l'indemnité de licenciement / retraite" value={f.severance_basis ?? 'average12'}
          hint="Moyenne : mois de sortie et 11 mois validés précédents."
          onChange={(e) => setF({ ...f, severance_basis: e.target.value })}>
          <option value="average12">Moyenne des 12 derniers mois</option>
          <option value="month">Salaire du mois de sortie (classeur)</option>
        </SelectField>
      </fieldset>
      <div className="mt-3"><ErrorNote error={q.error || save.error} /></div>
    </Section>
  )
}

/* ---------------------------------------------------------------- barèmes */
function TaxTab() {
  const q = useQuery({
    queryKey: ['tax'],
    queryFn: async () => {
      const [slabs, brackets, reds, trimf] = await Promise.all([
        dataApi.from('tax_slabs').select('*').order('effective_from', { ascending: false }),
        dataApi.from('tax_slab_brackets').select('*').order('from_amount'),
        dataApi.from('ir_family_reductions').select('*').order('parts'),
        dataApi.from('trimf_brackets').select('*').order('min_annual_gross'),
      ])
      return { slabs: unwrap(slabs), brackets: unwrap(brackets), reds: unwrap(reds), trimf: unwrap(trimf) }
    },
  })
  if (q.isLoading) return <Spinner />
  if (!q.data) return <ErrorNote error={q.error} />
  const slab = q.data.slabs[0]
  const br = q.data.brackets.filter((b) => b.slab_id === slab?.id)
  return (
    <div className="grid gap-6 xl:grid-cols-3">
      <Section title="Barème progressif de l'IR (annuel)">
        <p className="mb-2 text-xs text-ink-muted">{slab?.name}</p>
        <table className="w-full text-sm">
          <thead><tr className="table-head"><th className="px-2 py-1.5">Tranche de revenu imposable</th><th className="px-2 py-1.5 text-right">Taux</th></tr></thead>
          <tbody>{br.map((b, i) => (
            <tr key={b.id} className="border-b border-line/70"><td className="px-2 py-1.5">{br[i + 1] ? `${fcfa(b.from_amount)} à ${fcfa(br[i + 1].from_amount)} F` : `Au-delà de ${fcfa(b.from_amount)} F`}</td><td className="px-2 py-1.5 text-right">{pct(b.rate)}</td></tr>
          ))}</tbody>
        </table>
        <p className="mt-2 text-xs text-ink-soft">Revenu imposable = brut annuel − abattement de 30 % plafonné à 900 000 F, arrondi au millier inférieur.</p>
      </Section>
      <Section title="Réduction pour charges de famille">
        <table className="w-full text-sm">
          <thead><tr className="table-head"><th className="px-2 py-1.5">Parts</th><th className="px-2 py-1.5 text-right">Taux</th><th className="px-2 py-1.5 text-right">Minimum</th><th className="px-2 py-1.5 text-right">Maximum</th></tr></thead>
          <tbody>{q.data.reds.filter((r) => r.slab_id === slab?.id).map((r) => (
            <tr key={r.id} className="border-b border-line/70"><td className="px-2 py-1.5">{num(r.parts, 1)}</td><td className="px-2 py-1.5 text-right">{pct(r.rate)}</td><td className="px-2 py-1.5 text-right">{fcfa(r.min_amount)}</td><td className="px-2 py-1.5 text-right">{fcfa(r.max_amount)}</td></tr>
          ))}</tbody>
        </table>
      </Section>
      <Section title="TRIMF (annuel)">
        <table className="w-full text-sm">
          <thead><tr className="table-head"><th className="px-2 py-1.5">Brut annuel à partir de</th><th className="px-2 py-1.5 text-right">Montant</th></tr></thead>
          <tbody>{q.data.trimf.filter((t) => t.slab_id === slab?.id).map((t) => (
            <tr key={t.id} className="border-b border-line/70"><td className="px-2 py-1.5">{fcfa(t.min_annual_gross)} F</td><td className="px-2 py-1.5 text-right">{fcfa(t.annual_amount)} F{t.per_part ? ' par part' : ' forfaitaire'}</td></tr>
          ))}</tbody>
        </table>
      </Section>
    </div>
  )
}

/* -------------------------------------------------------------- rubriques */
const TYPE_LABEL: Record<string, string> = {
  gross_earning: 'Gain imposable', statutory_deduction: 'Retenue légale', employer_contribution: 'Cotisation patronale',
  non_taxable_earning: 'Indemnité non imposable', net_deduction: 'Retenue sur net', rounding: 'Appoint',
}
const kc = createColumnHelper<Tables<'salary_components'>>()
const componentCols = [
  kc.accessor('rubric_number', { header: 'N°' }),
  kc.accessor('code', { header: 'Code' }),
  kc.accessor('name', { header: 'Libellé' }),
  kc.accessor('component_type', { header: 'Nature', cell: (c) => TYPE_LABEL[c.getValue()] }),
  kc.accessor('input_mode', { header: 'Saisie', cell: (c) => ({ computed: 'Calculée', variable: 'Mensuelle', fixed: 'Fixe' } as Record<string, string>)[c.getValue()] }),
]
function ComponentsTab() {
  const { can } = useAuth()
  const qc = useQueryClient()
  const q = useComponents()
  const [open, setOpen] = useState(false)
  const [f, setF] = useState({ code: '', name: '', rubric_number: 20, component_type: 'gross_earning', input_mode: 'variable' })
  const add = useMutation({
    mutationFn: async () => unwrap(await dataApi.from('salary_components').insert({ ...f, code: f.code.toUpperCase() }).select()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['salary_components'] }); setOpen(false) },
  })
  return (
    <>
      <p className="mb-3 max-w-prose text-sm text-ink-soft">Les rubriques « mensuelles » apparaissent comme colonnes dans les variables du mois. Ajoutez ici une nouvelle prime imposable, une indemnité non imposable ou une retenue sur le net.</p>
      {q.isLoading ? <Spinner /> : <DataTable data={q.data ?? []} columns={componentCols} exportName="rubriques"
        toolbar={can('paie') && <Button size="sm" variant="primary" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setOpen(true)}>Nouvelle rubrique</Button>} />}
      <Modal open={open} onClose={() => setOpen(false)} title="Nouvelle rubrique de paie"
        footer={<><Button variant="ghost" onClick={() => setOpen(false)}>Annuler</Button><Button variant="primary" loading={add.isPending} disabled={!f.code || !f.name} onClick={() => add.mutate()}>Créer la rubrique</Button></>}>
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField label="Code" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} hint="Ex. PRIME_RENDEMENT" />
          <TextField label="N° de rubrique" type="number" value={f.rubric_number} onChange={(e) => setF({ ...f, rubric_number: Number(e.target.value) })} />
          <TextField label="Libellé sur le bulletin" className="sm:col-span-2" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          <SelectField label="Nature" className="sm:col-span-2" value={f.component_type} onChange={(e) => setF({ ...f, component_type: e.target.value })}>
            <option value="gross_earning">Gain imposable (entre dans le brut)</option>
            <option value="non_taxable_earning">Indemnité non imposable (après le net)</option>
            <option value="net_deduction">Retenue sur le net (avance, coopérative…)</option>
          </SelectField>
        </div>
        <div className="mt-3"><ErrorNote error={add.error} /></div>
      </Modal>
    </>
  )
}

/* ------------------------------------------------------------- référentiels */
const NATURES = [
  { value: 'TRAVAIL', label: 'Contrat de travail (IR, TRIMF, IPRES, CFCE, AF)' },
  { value: 'PRESTATION', label: 'Prestation de services (BRS)' },
  { value: 'STAGE', label: 'Stage' },
  { value: 'APPRENTISSAGE', label: 'Apprentissage' },
  { value: 'AUTRE', label: 'Autre (ouvrier journalier…)' },
]
const STAFF_STATUSES = ['Employés', 'Ouvriers', 'Agents de maîtrise', 'Cadres', 'Chauffeurs']

function ReferentialsTab() {
  const agreements = useAgreements()
  const [which, setWhich] = useState<RefTable>('designations')
  const agreementOptions = (agreements.data ?? []).map((a) => ({ value: a.code, label: a.name }))
  const configs: Record<RefTable, RefConfig> = {
    designations: {
      table: 'designations', title: 'Emplois', description: 'Intitulés de poste proposés dans la fiche salarié et imprimés sur les bulletins.',
      keyField: 'id', labelField: 'name', orderBy: 'name',
      fields: [{ key: 'name', label: 'Emploi', required: true }],
    },
    contract_types: {
      table: 'contract_types', title: 'Types de contrat',
      description: 'La nature détermine les cotisations appliquées par le moteur de paie ; la précarité et l’indemnité de licenciement en dépendent.',
      keyField: 'code', labelField: 'label', orderBy: 'sort_order',
      fields: [
        { key: 'code', label: 'Code', required: true, createOnly: true, upper: true, hint: 'Majuscules, ex. CDD' },
        { key: 'label', label: 'Libellé', required: true },
        { key: 'nature', label: 'Nature', type: 'select', options: NATURES, required: true },
        { key: 'sort_order', label: 'Ordre d’affichage', type: 'number', list: false },
        { key: 'precarity_eligible', label: 'Indemnité de précarité (fin de contrat)', short: 'Précarité', type: 'checkbox' },
        { key: 'severance_eligible', label: 'Indemnité de licenciement / départ à la retraite', short: 'Licenciement / retraite', type: 'checkbox' },
      ],
    },
    collective_agreements: {
      table: 'collective_agreements', title: 'Conventions collectives', description: 'Conventions dont dépendent les grilles de catégories.',
      keyField: 'code', labelField: 'name', orderBy: 'name',
      fields: [
        { key: 'code', label: 'Code', required: true, createOnly: true, upper: true },
        { key: 'name', label: 'Libellé', required: true },
      ],
    },
    employee_grades: {
      table: 'employee_grades', title: 'Catégories', description: 'Catégories et salaires de base des grilles conventionnelles.',
      keyField: 'id', labelField: 'code', orderBy: 'base_salary',
      filter: { field: 'agreement_code', label: 'Convention collective', options: agreementOptions },
      fields: [
        { key: 'agreement_code', label: 'Convention', type: 'select', options: agreementOptions, required: true, list: false },
        { key: 'code', label: 'Catégorie', required: true },
        { key: 'staff_status', label: 'Statut', suggestions: STAFF_STATUSES, hint: '« Cadres » déclenche l’IPRES régime cadres' },
        { key: 'grade_class', label: 'Classe' },
        { key: 'base_salary', label: 'Salaire de base', type: 'number', required: true },
        { key: 'hourly_rate', label: 'Taux horaire', type: 'number' },
        { key: 'effective_from', label: 'En vigueur depuis', type: 'date', list: false },
      ],
    },
    payment_modes: {
      table: 'payment_modes', title: 'Modes de paiement', description: 'Modes de règlement du salaire proposés dans la fiche salarié et le traitement de paie.',
      keyField: 'code', labelField: 'label', orderBy: 'sort_order',
      fields: [
        { key: 'code', label: 'Code', required: true, createOnly: true, hint: 'ex. wave' },
        { key: 'label', label: 'Libellé', required: true },
        { key: 'sort_order', label: 'Ordre d’affichage', type: 'number', list: false },
      ],
    },
  }
  const order: RefTable[] = ['designations', 'contract_types', 'collective_agreements', 'employee_grades', 'payment_modes']
  return (
    <div className="grid gap-4 lg:grid-cols-[13rem_1fr]">
      <nav aria-label="Référentiels" className="flex flex-row flex-wrap gap-1 lg:flex-col">
        {order.map((t) => (
          <button key={t} type="button" aria-current={which === t} onClick={() => setWhich(t)}
            className={clsx('rounded px-3 py-2 text-left text-sm', which === t ? 'bg-river text-white' : 'text-ink-soft hover:bg-white hover:text-ink')}>
            {configs[t].title}
          </button>
        ))}
        <p className="mt-2 hidden text-xs text-ink-muted lg:block">Les taux de cotisation et plafonds sont dans l’onglet « Taux et plafonds ».</p>
      </nav>
      {which === 'employee_grades' && agreements.isLoading ? <Spinner /> : <ReferentialManager key={which} config={configs[which]} />}
    </div>
  )
}

/* ----------------------------------------------------------------- grilles */
const gc = createColumnHelper<Tables<'employee_grades'>>()
const gradeCols = [
  gc.accessor('code', { header: 'Catégorie' }),
  gc.accessor('staff_status', { header: 'Statut' }),
  gc.accessor('grade_class', { header: 'Classe' }),
  gc.accessor('hourly_rate', { header: 'Taux horaire', meta: { align: 'right' }, cell: (c) => num(c.getValue()) }),
  gc.accessor('base_salary', { header: 'Salaire de base', meta: { align: 'right' }, cell: (c) => fcfa(c.getValue()) }),
]
function GradesTab() {
  const agreements = useAgreements()
  const [code, setCode] = useState('INDUSTRIES_CHIMIQUES_EXTRATIVES_PROSPECTION_MINIERE')
  const grades = useGrades(code)
  return (
    <>
      <SelectField label="Convention collective" className="mb-4 max-w-md" value={code} onChange={(e) => setCode(e.target.value)}>
        {(agreements.data ?? []).map((a) => <option key={a.code} value={a.code}>{a.name}</option>)}
      </SelectField>
      {grades.isLoading ? <Spinner /> : <DataTable data={grades.data ?? []} columns={gradeCols} exportName={`grille-${code.toLowerCase()}`} />}
    </>
  )
}

/* ----------------------------------------------------------------- société */
function CompanyTab() {
  const { can } = useAuth()
  const qc = useQueryClient()
  const company = useCompany()
  const [f, setF] = useState<Partial<Tables<'companies'>>>({})
  useEffect(() => { if (company.data) setF(company.data) }, [company.data])
  const save = useMutation({
    mutationFn: async () => unwrap(await dataApi.from('companies').update(f).eq('id', company.data!.id).select()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['company'] }),
  })
  const t = (k: keyof Tables<'companies'>) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value })
  return (
    <Section title="Identité de l'employeur (en-tête des bulletins)"
      actions={can('rh') && <Button size="sm" variant="primary" icon={<Save className="h-3.5 w-3.5" />} loading={save.isPending} onClick={() => save.mutate()}>Enregistrer</Button>}>
      <fieldset disabled={!can('rh')} className="grid gap-3 sm:grid-cols-2">
        <TextField label="Raison sociale" value={f.name ?? ''} onChange={t('name')} />
        <TextField label="Forme juridique" value={f.legal_form ?? ''} onChange={t('legal_form')} />
        <TextField label="Capital (F CFA)" type="number" value={f.share_capital ?? ''} onChange={(e) => setF({ ...f, share_capital: Number(e.target.value) })} />
        <TextField label="Téléphone" value={f.phone ?? ''} onChange={t('phone')} />
        <TextField label="Adresse" className="sm:col-span-2" value={f.address ?? ''} onChange={t('address')} />
        <TextField label="NINEA" value={f.ninea ?? ''} onChange={t('ninea')} />
        <TextField label="RCCM" value={f.rccm ?? ''} onChange={t('rccm')} />
        <TextField label="E-mail" type="email" value={f.email ?? ''} onChange={t('email')} />
      </fieldset>
      <div className="mt-3"><ErrorNote error={company.error || save.error} /></div>
    </Section>
  )
}
