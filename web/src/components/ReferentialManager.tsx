import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ApiClient } from '../lib/api'
import clsx from 'clsx'
import { Pencil, Plus, Power, Search, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { dataApi, unwrap } from '../lib/api'
import { useAuth } from '../lib/auth'
import { fcfa, num } from '../lib/format'
import { Button, ErrorNote, Modal, SelectField, Spinner, TextField } from './ui'

/**
 * Gestion générique d'un référentiel RH : liste, recherche, création, modification,
 * activation / désactivation, suppression des seules valeurs inutilisées (contrôlée
 * aussi en base), date et auteur de la dernière modification. Les doublons sont
 * refusés par des index uniques insensibles à la casse ; le journal est tenu en base.
 */

export type RefTable = 'designations' | 'contract_types' | 'collective_agreements' | 'employee_grades' | 'payment_modes'
type Row = Record<string, unknown> & { is_active: boolean; updated_at: string; updated_by: string | null }
type Field = {
  key: string; label: string
  type?: 'text' | 'number' | 'checkbox' | 'select' | 'date'
  options?: { value: string; label: string }[]
  required?: boolean
  /** modifiable seulement à la création (codes référencés ailleurs) */
  createOnly?: boolean
  upper?: boolean
  list?: boolean
  hint?: string
  suggestions?: string[]
  /** libellé court pour l'en-tête de colonne */
  short?: string
}
export type RefConfig = {
  table: RefTable
  title: string
  description: string
  keyField: 'id' | 'code'
  /** champ comparé pour le contrôle des doublons */
  labelField: string
  orderBy: string
  fields: Field[]
  /** filtre facultatif (ex. convention pour les catégories) */
  filter?: { field: string; label: string; options: { value: string; label: string }[] }
}

// client non typé : le composant sert cinq tables différentes
const db = dataApi as unknown as ApiClient

function frError(e: unknown): Error | null {
  if (!e) return null
  const msg = e instanceof Error ? e.message : String(e)
  if (/duplicate key|unique/i.test(msg)) return new Error('Cette valeur existe déjà (les doublons sont contrôlés sans tenir compte des majuscules ni des espaces).')
  if (/row-level security|permission denied/i.test(msg)) return new Error('Droits insuffisants : seuls les rôles RH et administrateur peuvent modifier les référentiels.')
  if (/check constraint/i.test(msg)) return new Error('Valeur refusée : vérifiez le format du code (majuscules, chiffres, tirets).')
  return e instanceof Error ? e : new Error(msg)
}

export function ReferentialManager({ config }: { config: RefConfig }) {
  const { can } = useAuth()
  const editable = can('rh')
  const qc = useQueryClient()
  const [query, setQuery] = useState('')
  const [showInactive, setShowInactive] = useState(false)
  const [filter, setFilter] = useState(config.filter?.options[0]?.value ?? '')
  const [editing, setEditing] = useState<Row | 'new' | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const q = useQuery({
    queryKey: ['ref', config.table, filter],
    queryFn: async () => {
      let req = db.from(config.table).select('*').order(config.orderBy)
      if (config.filter && filter) req = req.eq(config.filter.field, filter)
      return unwrap(await req) as Row[]
    },
  })
  const editors = useQuery({
    queryKey: ['user-emails', (q.data ?? []).map((r) => r.updated_by).filter(Boolean).sort().join(',')],
    enabled: !!q.data?.length,
    queryFn: async () => {
      const ids = [...new Set((q.data ?? []).map((r) => r.updated_by).filter(Boolean))] as string[]
      if (!ids.length) return new Map<string, string>()
      const rows = unwrap(await dataApi.rpc('user_emails', { p_ids: ids })) as { id: string; email: string }[]
      return new Map(rows.map((r) => [r.id, r.email]))
    },
  })

  const rows = useMemo(() => {
    const t = query.trim().toLowerCase()
    return (q.data ?? []).filter((r) => (showInactive || r.is_active)
      && (!t || config.fields.some((f) => String(r[f.key] ?? '').toLowerCase().includes(t))))
  }, [q.data, query, showInactive, config.fields])
  const inactiveCount = (q.data ?? []).filter((r) => !r.is_active).length

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['ref', config.table] })
    // listes déroulantes des formulaires
    qc.invalidateQueries({ queryKey: [config.table] })
    qc.invalidateQueries({ queryKey: ['designations'] })
    qc.invalidateQueries({ queryKey: ['agreements'] })
    qc.invalidateQueries({ queryKey: ['grades'] })
    qc.invalidateQueries({ queryKey: ['audit-log'] })
  }

  const toggle = useMutation({
    mutationFn: async (r: Row) => unwrap(await db.from(config.table).update({ is_active: !r.is_active }).eq(config.keyField, r[config.keyField] as string).select()),
    onSuccess: (_d, r) => { setNotice(`« ${String(r[config.labelField])} » ${r.is_active ? 'désactivé(e) : n’est plus proposé(e) à la saisie' : 'réactivé(e)'}.`); invalidate() },
  })
  const remove = useMutation({
    mutationFn: async (r: Row) => {
      const key = String(r[config.keyField])
      const usage = unwrap(await dataApi.rpc('reference_usage', { p_table: config.table, p_key: key })) as { employees: number; slips: number; entries: number; total: number }
      if (usage.total > 0) {
        throw new Error(`« ${String(r[config.labelField])} » est utilisé(e) par ${usage.employees} salarié(s), ${usage.slips} bulletin(s) ou rattachement(s)${usage.entries ? ` et ${usage.entries} traitement(s)` : ''}. Désactivez-le(la) plutôt que de le(la) supprimer.`)
      }
      return unwrap(await db.from(config.table).delete().eq(config.keyField, key).select())
    },
    onSuccess: (_d, r) => { setNotice(`« ${String(r[config.labelField])} » supprimé(e).`); invalidate() },
  })

  const listFields = config.fields.filter((f) => f.list !== false)
  const cell = (f: Field, v: unknown) => {
    if (f.type === 'checkbox') return v ? 'Oui' : 'Non'
    if (f.type === 'select') return f.options?.find((o) => o.value === v)?.label.split(' (')[0] ?? String(v ?? '')
    if (f.type === 'number') return f.key.includes('salary') ? fcfa(v as number) : num(v as number, 4)
    return String(v ?? '')
  }

  return (
    <section className="panel">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-4 py-3">
        <div>
          <h2 className="text-base">{config.title}</h2>
          <p className="text-xs text-ink-muted">{config.description}</p>
        </div>
        {editable && <Button size="sm" variant="primary" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => { setNotice(null); setEditing('new') }}>Ajouter</Button>}
      </div>
      <div className="flex flex-wrap items-end gap-3 border-b border-line px-4 py-2">
        <label className="relative min-w-[12rem] max-w-xs flex-1">
          <span className="sr-only">Rechercher dans {config.title}</span>
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-ink-muted" aria-hidden />
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Rechercher…" className="field pl-8" />
        </label>
        {config.filter && (
          <SelectField label={config.filter.label} value={filter} onChange={(e) => setFilter(e.target.value)} className="max-w-sm">
            {config.filter.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </SelectField>
        )}
        <label className="mb-2 inline-flex items-center gap-2 text-sm">
          <input type="checkbox" className="h-4 w-4 accent-[#0F6E6A]" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
          Afficher les valeurs désactivées ({inactiveCount})
        </label>
        <span className="mb-2 ml-auto text-xs text-ink-muted">{rows.length} valeur(s)</span>
      </div>
      <div className="px-4 pt-2">
        <ErrorNote error={frError(q.error || toggle.error || remove.error)} />
        {notice && !toggle.error && !remove.error && <p className="rounded border border-river/30 bg-river-light px-3 py-2 text-sm text-river-dark" role="status">{notice}</p>}
      </div>
      {q.isLoading ? <div className="px-4"><Spinner /></div> : (
        <div className="max-h-[28rem] overflow-auto">
          <table className="w-full border-separate border-spacing-0 text-sm">
            <thead>
              <tr className="text-left text-xs font-semibold text-ink-soft">
                {listFields.map((f) => <th key={f.key} title={f.label} className={clsx('sticky top-0 z-10 border-b border-line bg-paper px-3 py-2', f.type === 'number' && 'text-right')}>{f.short ?? f.label}</th>)}
                <th className="sticky top-0 z-10 border-b border-line bg-paper px-3 py-2">État</th>
                <th className="sticky top-0 z-10 border-b border-line bg-paper px-3 py-2">Dernière modification</th>
                <th className="sticky top-0 z-10 border-b border-line bg-paper px-3 py-2"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={String(r[config.keyField])} className={clsx('hover:bg-[#F1F7F6]', !r.is_active && 'text-ink-muted')}>
                  {listFields.map((f) => <td key={f.key} className={clsx('border-b border-line/70 px-3 py-1.5', f.type === 'number' && 'num text-right')}>{cell(f, r[f.key])}</td>)}
                  <td className="border-b border-line/70 px-3 py-1.5">
                    <span className={clsx('rounded border px-1.5 py-0.5 text-xs', r.is_active ? 'border-river/30 bg-river-light text-river-dark' : 'border-line bg-paper text-ink-muted')}>{r.is_active ? 'Actif' : 'Désactivé'}</span>
                  </td>
                  <td className="whitespace-nowrap border-b border-line/70 px-3 py-1.5 text-xs text-ink-soft">
                    {new Date(r.updated_at).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}
                    <span className="block text-ink-muted">{r.updated_by ? (editors.data?.get(r.updated_by) ?? 'utilisateur') : 'reprise initiale'}</span>
                  </td>
                  <td className="whitespace-nowrap border-b border-line/70 px-3 py-1.5 text-right">
                    {editable && (
                      <div className="inline-flex gap-1">
                        <button type="button" className="rounded p-1 text-ink-soft hover:bg-paper hover:text-river" aria-label={`Modifier ${String(r[config.labelField])}`} onClick={() => { setNotice(null); setEditing(r) }}><Pencil className="h-4 w-4" /></button>
                        <button type="button" className="rounded p-1 text-ink-soft hover:bg-paper hover:text-ink" aria-label={`${r.is_active ? 'Désactiver' : 'Réactiver'} ${String(r[config.labelField])}`} title={r.is_active ? 'Désactiver' : 'Réactiver'} onClick={() => toggle.mutate(r)}><Power className="h-4 w-4" /></button>
                        <button type="button" className="rounded p-1 text-ink-soft hover:bg-signal-light hover:text-signal" aria-label={`Supprimer ${String(r[config.labelField])}`} title="Supprimer (seulement si inutilisé)" onClick={() => remove.mutate(r)}><Trash2 className="h-4 w-4" /></button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={listFields.length + 3} className="px-3 py-6 text-center text-ink-muted">Aucune valeur.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
      {editing && (
        <RefForm config={config} row={editing === 'new' ? null : editing} existing={q.data ?? []} defaultFilter={filter}
          onClose={() => setEditing(null)}
          onSaved={(label, created) => { setEditing(null); setNotice(`« ${label} » ${created ? 'créé(e)' : 'enregistré(e)'}.`); invalidate() }} />
      )}
    </section>
  )
}

function RefForm({ config, row, existing, defaultFilter, onClose, onSaved }: {
  config: RefConfig; row: Row | null; existing: Row[]; defaultFilter: string
  onClose: () => void; onSaved: (label: string, created: boolean) => void
}) {
  const isNew = !row
  const [f, setF] = useState<Record<string, unknown>>(() => {
    if (row) return { ...row }
    const init: Record<string, unknown> = {}
    for (const fd of config.fields) init[fd.key] = fd.type === 'checkbox' ? false : ''
    if (config.filter) init[config.filter.field] = defaultFilter
    return init
  })
  const norm = (v: unknown) => String(v ?? '').trim().toLowerCase()
  const dup = existing.find((r) => r !== row && norm(r[config.labelField]) === norm(f[config.labelField]) && norm(f[config.labelField]) !== ''
    && (!config.filter || r[config.filter.field] === f[config.filter.field]))
  const missing = config.fields.filter((fd) => fd.required && String(f[fd.key] ?? '').trim() === '')

  const save = useMutation({
    mutationFn: async () => {
      const payload: Record<string, unknown> = {}
      for (const fd of config.fields) {
        if (!isNew && fd.createOnly) continue
        let v = f[fd.key]
        if (typeof v === 'string') v = fd.upper ? v.trim().toUpperCase() : v.trim()
        if (fd.type === 'number' || fd.type === 'date') v = v === '' || v === null ? null : fd.type === 'number' ? Number(v) : v
        payload[fd.key] = v
      }
      if (isNew) return unwrap(await db.from(config.table).insert(payload).select().single())
      return unwrap(await db.from(config.table).update(payload).eq(config.keyField, row![config.keyField] as string).select().single())
    },
    onSuccess: () => onSaved(String(f[config.labelField]).trim(), isNew),
  })

  return (
    <Modal open onClose={onClose} title={isNew ? `Ajouter — ${config.title}` : `Modifier — ${String(row![config.labelField])}`}
      footer={<>
        <Button variant="ghost" onClick={onClose}>Annuler</Button>
        <Button variant="primary" loading={save.isPending} disabled={!!dup || missing.length > 0} onClick={() => save.mutate()}>{isNew ? 'Créer' : 'Enregistrer'}</Button>
      </>}>
      <div className="grid gap-3 sm:grid-cols-2">
        {config.fields.map((fd) => {
          const disabled = !isNew && fd.createOnly
          const common = { label: `${fd.label}${fd.required ? ' *' : ''}`, disabled, hint: disabled ? 'Non modifiable : la valeur est référencée par les fiches et bulletins.' : fd.hint }
          if (fd.type === 'checkbox') {
            return (
              <label key={fd.key} className="inline-flex items-center gap-2 text-sm sm:col-span-2">
                <input type="checkbox" className="h-4 w-4 accent-[#0F6E6A]" checked={!!f[fd.key]} onChange={(e) => setF({ ...f, [fd.key]: e.target.checked })} />
                {fd.label}{fd.hint && <span className="text-xs text-ink-muted"> — {fd.hint}</span>}
              </label>
            )
          }
          if (fd.type === 'select') {
            return (
              <SelectField key={fd.key} {...common} value={String(f[fd.key] ?? '')} onChange={(e) => setF({ ...f, [fd.key]: e.target.value })}>
                <option value="">Choisir…</option>
                {fd.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </SelectField>
            )
          }
          return (
            <div key={fd.key}>
              <TextField {...common} type={fd.type === 'number' ? 'number' : fd.type === 'date' ? 'date' : 'text'} step="any"
                list={fd.suggestions ? `${config.table}-${fd.key}` : undefined}
                value={String(f[fd.key] ?? '')} onChange={(e) => setF({ ...f, [fd.key]: e.target.value })} />
              {fd.suggestions && <datalist id={`${config.table}-${fd.key}`}>{fd.suggestions.map((s) => <option key={s} value={s} />)}</datalist>}
            </div>
          )
        })}
      </div>
      {dup && <p className="mt-3 text-sm font-medium text-signal" role="alert">« {String(f[config.labelField])} » existe déjà{!dup.is_active ? ' (désactivé : réactivez-le plutôt que de le recréer)' : ''}.</p>}
      <div className="mt-3"><ErrorNote error={frError(save.error)} /></div>
    </Modal>
  )
}

/* ------------------------------------------------------------- journal */
type AuditRow = { id: number; occurred_at: string; actor: string | null; table_name: string; record_key: string | null; action: string; old_data: Record<string, unknown> | null; new_data: Record<string, unknown> | null; reason: string | null }
const TABLE_LABEL: Record<string, string> = {
  designations: 'Emploi', contract_types: 'Type de contrat', collective_agreements: 'Convention collective',
  employee_grades: 'Catégorie', payment_modes: 'Mode de paiement', employees: 'Salarié',
  salary_structure_assignments: 'Affectation de structure', payroll_inputs: 'Variables du mois',
  additional_salaries: 'Salaire additionnel', attendance: 'Présence', leave_applications: 'Congé',
  salary_slips: 'Bulletin', payroll_entries: 'Traitement de paie', payroll_settings: 'Paramètre de paie',
  user_roles: 'Rôle utilisateur', salary_payments: 'Paiement de salaire', employee_requests: 'Demande de salarié',
}
const HIDDEN = new Set(['updated_at', 'updated_by', 'created_at', 'id'])

function changes(r: AuditRow): string {
  if (r.action === 'changement de matricule') return `${String(r.old_data?.employee_number)} → ${String(r.new_data?.employee_number)}${r.reason ? ` (motif : ${r.reason})` : ''}`
  if (!r.old_data || !r.new_data) return ''
  return Object.keys(r.new_data).filter((k) => !HIDDEN.has(k) && JSON.stringify(r.old_data![k]) !== JSON.stringify(r.new_data![k]))
    .map((k) => `${k} : ${String(r.old_data![k] ?? '—')} → ${String(r.new_data![k] ?? '—')}`).join(' ; ')
}

export function AuditLogView() {
  const [tableF, setTableF] = useState('')
  const [text, setText] = useState('')
  const q = useQuery({
    queryKey: ['audit-log', tableF],
    queryFn: async () => {
      let req = db.from('audit_log').select('*').order('occurred_at', { ascending: false }).limit(500)
      if (tableF) req = req.eq('table_name', tableF)
      return unwrap(await req) as AuditRow[]
    },
  })
  const rows = (q.data ?? []).filter((r) => {
    if (!text.trim()) return true
    const hay = `${r.record_key ?? ''} ${r.action} ${changes(r)}`.toLowerCase()
    return hay.includes(text.trim().toLowerCase())
  })
  const emails = useQuery({
    queryKey: ['user-emails-audit', (q.data ?? []).length],
    enabled: !!q.data?.length,
    queryFn: async () => {
      const ids = [...new Set((q.data ?? []).map((r) => r.actor).filter(Boolean))] as string[]
      if (!ids.length) return new Map<string, string>()
      const rows = unwrap(await dataApi.rpc('user_emails', { p_ids: ids })) as { id: string; email: string }[]
      return new Map(rows.map((r) => [r.id, r.email]))
    },
  })
  return (
    <section className="panel">
      <div className="border-b border-line px-4 py-3">
        <h2 className="text-base">Journal des modifications</h2>
        <p className="text-xs text-ink-muted">500 dernières opérations (salariés, variables, présences, congés, bulletins, traitements, paramètres, rôles, référentiels), enregistrées automatiquement par la base.</p>
      </div>
      <div className="flex flex-wrap gap-2 px-4 pt-3">
        <select className="field w-56" aria-label="Filtrer par objet" value={tableF} onChange={(e) => setTableF(e.target.value)}>
          <option value="">Tous les objets</option>
          {Object.entries(TABLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <input className="field w-64" type="search" placeholder="Rechercher (matricule, champ, valeur)…" aria-label="Rechercher" value={text} onChange={(e) => setText(e.target.value)} />
      </div>
      <div className="px-4 pt-2"><ErrorNote error={q.error} /></div>
      {q.isLoading ? <div className="px-4"><Spinner /></div> : rows.length === 0 ? <p className="px-4 py-6 text-sm text-ink-muted">Aucune modification enregistrée pour l’instant.</p> : (
        <div className="max-h-[32rem] overflow-auto">
          <table className="w-full border-separate border-spacing-0 text-sm">
            <thead><tr className="text-left text-xs font-semibold text-ink-soft">
              {['Date', 'Utilisateur', 'Référentiel', 'Valeur', 'Opération', 'Détail'].map((h) => <th key={h} className="sticky top-0 border-b border-line bg-paper px-3 py-2">{h}</th>)}
            </tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.id} className="align-top">
                <td className="whitespace-nowrap border-b border-line/70 px-3 py-1.5 text-xs">{new Date(r.occurred_at).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}</td>
                <td className="border-b border-line/70 px-3 py-1.5 text-xs">{r.actor ? (emails.data?.get(r.actor) ?? 'utilisateur') : 'système'}</td>
                <td className="border-b border-line/70 px-3 py-1.5">{TABLE_LABEL[r.table_name] ?? r.table_name}</td>
                <td className="border-b border-line/70 px-3 py-1.5 font-medium">{r.record_key ?? String(r.new_data?.employee_number ?? '')}</td>
                <td className="border-b border-line/70 px-3 py-1.5">{r.action}</td>
                <td className="border-b border-line/70 px-3 py-1.5 text-xs text-ink-soft">{changes(r)}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </section>
  )
}
