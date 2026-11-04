import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { dataApi, unwrap, type ApiClient } from '../../lib/api'
import { LINK_LABEL, UNIT_LABEL, assignmentInfo, fullName, type LinkType, type OrgData, type OrgLink, type OrgNode, type OrgUnit, type UnitKind } from '../../lib/org'
import { PersonSelect } from './PersonSelect'

/** Formulaires d'action de l'organigramme (RH/admin) : rattacher, détacher, créer direction / secteur / section / poste / équipe. */

const db = dataApi as unknown as ApiClient
const today = () => new Date().toISOString().slice(0, 10)

export type Dialog =
  | { kind: 'attach'; managerId: string }
  | { kind: 'manager'; employeeId: string }
  | { kind: 'detach'; employeeId: string }
  | { kind: 'relation'; employeeId: string }
  | { kind: 'end'; link: OrgLink }
  | { kind: 'unit'; unit?: OrgUnit; parentId?: string | null; unitKind?: UnitKind }
  | { kind: 'unit-delete'; unit: OrgUnit }
  | { kind: 'employee-unit'; employeeId: string }
  | { kind: 'unit-attach'; unitId: string }
  | { kind: 'post'; employeeId?: string }
  | { kind: 'team-add'; employeeId: string }
  | { kind: 'team-remove'; teamId: string; employeeId: string }
  | { kind: 'team-new' }

type Env = { data: OrgData; asOf: string; close: () => void }

function useAction(fn: () => Promise<unknown>, close: () => void) {
  const qc = useQueryClient()
  return useMutation({ mutationFn: fn, onSuccess: () => { void qc.invalidateQueries({ queryKey: ['org_chart'] }); close() } })
}

function L({ t, hint, children }: { t: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block text-xs font-semibold" style={{ color: 'var(--o-muted)' }}>
      {t}
      <div className="mt-1 font-normal [&>*]:w-full">{children}</div>
      {hint && <span className="mt-1 block font-normal">{hint}</span>}
    </label>
  )
}

/** Motif : obligatoire seulement quand on remplace ou retire un manager direct ; sinon information complémentaire facultative. */
function Note({ value, onChange, required }: { value: string; onChange: (v: string) => void; required?: boolean }) {
  return (
    <L t={required ? 'Motif (obligatoire, 5 caractères minimum)' : 'Information complémentaire (facultative)'}>
      <input className="org-input" value={value} onChange={(e) => onChange(e.target.value)} placeholder={required ? 'Ex. réorganisation du service' : 'Vous pouvez laisser ce champ vide'} />
    </L>
  )
}

function Shell({ title, subtitle, close, onSubmit, pending, error, canSubmit, label = 'Enregistrer', danger, children }: {
  title: string; subtitle?: string; close: () => void; onSubmit: () => void; pending: boolean; error: unknown; canSubmit: boolean
  label?: string; danger?: boolean; children: ReactNode
}) {
  const submit = (e: FormEvent) => { e.preventDefault(); if (canSubmit && !pending) onSubmit() }
  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-auto p-4" style={{ background: 'rgba(3, 7, 18, .6)' }} role="presentation" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="org-glass w-full max-w-md rounded-2xl p-5" role="dialog" aria-modal="true" aria-label={title} onKeyDown={(e) => e.key === 'Escape' && close()}>
        <h2 className="text-base font-semibold">{title}</h2>
        {subtitle && <p className="mb-3 text-sm" style={{ color: 'var(--o-muted)' }}>{subtitle}</p>}
        <form className="mt-3 space-y-3" onSubmit={submit}>
          {children}
          {error != null && <p role="alert" className="rounded-lg border px-3 py-2 text-sm" style={{ borderColor: 'var(--o-amber)', color: 'var(--o-amber)' }}>{(error as Error).message}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" className="org-btn" onClick={close}>Annuler</button>
            <button type="submit" className="org-btn" data-primary={danger ? 'false' : 'true'} style={danger ? { borderColor: 'var(--o-amber)', color: 'var(--o-amber)' } : undefined} disabled={!canSubmit || pending}>{pending ? 'Enregistrement…' : label}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

const unitPath = (units: OrgUnit[], id: string) => {
  const m = new Map(units.map((u) => [u.id, u]))
  const parts: string[] = []
  let cur = m.get(id)
  for (let n = 0; cur && n < 10; n++) { parts.unshift(cur.nom); cur = cur.parent ? m.get(cur.parent) : undefined }
  return parts.join(' › ')
}
const nextKind = (k?: UnitKind): UnitKind => (k === 'direction' ? 'secteur' : k === 'secteur' ? 'section' : k === 'section' ? 'service' : 'direction')
const person = (data: OrgData, id: string) => data.noeuds.find((p) => p.id === id)

// ------------------------------------------------------------ manager direct
function ManagerBase({ env, employeeId, managerId, mode }: { env: Env; employeeId: string; managerId?: string; mode: 'attach' | 'change' | 'detach' }) {
  const { data, asOf, close } = env
  const info = useMemo(() => assignmentInfo(data), [data])
  const [emp, setEmp] = useState(mode === 'attach' ? '' : employeeId)
  const [mgr, setMgr] = useState(managerId ?? '')
  const [from, setFrom] = useState(asOf > today() ? asOf : today())
  const [note, setNote] = useState('')
  const target = person(data, mode === 'attach' ? managerId! : employeeId)
  const subject = mode === 'attach' ? emp : employeeId
  const replacing = mode === 'detach' || !!(subject && info.get(subject)?.manager)
  const save = useAction(async () => unwrap(await db.rpc('org_set_manager', { p_employee: subject, p_manager: mode === 'detach' ? null : mode === 'attach' ? managerId : mgr || null, p_from: from, p_reason: note.trim() || null })), close)
  const title = mode === 'attach' ? `Rattacher un salarié sous ${target ? fullName(target) : ''}` : mode === 'detach' ? 'Détacher de son manager' : 'Changer de manager direct'
  const ok = !!from && (mode === 'attach' ? !!emp : true) && (!replacing || note.trim().length >= 5)
  return (
    <Shell title={title} subtitle={mode === 'attach' ? 'Le salarié n’a pas besoin d’un compte pour être rattaché.' : target ? `${fullName(target)} · ${target.poste}` : undefined} close={close}
      onSubmit={() => save.mutate()} pending={save.isPending} error={save.error} canSubmit={ok} label={mode === 'detach' ? 'Détacher' : 'Enregistrer'} danger={mode === 'detach'}>
      {mode === 'attach' && (
        <L t="Salarié à rattacher">
          <PersonSelect people={data.noeuds} value={emp} onChange={setEmp} exclude={new Set([managerId!])} autoFocus
            hint={(p) => (info.get(p.id)?.manager ? `déjà sous ${info.get(p.id)!.manager}` : null)} />
        </L>
      )}
      {mode === 'change' && (
        <L t="Nouveau manager direct" hint="Le rattachement actuel est clos la veille de la date d'effet.">
          <PersonSelect people={data.noeuds} value={mgr} onChange={setMgr} exclude={new Set([employeeId])} emptyLabel="Aucun manager (tête de branche)" required={false} autoFocus
            hint={(p) => (p.subordonnes > 0 ? `gère ${p.subordonnes} personne(s)` : null)} />
        </L>
      )}
      {mode === 'detach' && <p className="text-sm">Le salarié ne sera plus rattaché à un manager direct à partir de la date d’effet. Son historique est conservé.</p>}
      <L t="Date d'effet"><input className="org-input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} required /></L>
      <Note value={note} onChange={setNote} required={replacing} />
    </Shell>
  )
}

// ------------------------------------------------------------ lien hors hiérarchie
function RelationForm({ env, employeeId }: { env: Env; employeeId: string }) {
  const { data, close } = env
  const [f, setF] = useState({ related: '', type: 'dotted' as Exclude<LinkType, 'direct'>, start: today(), end: '', pct: '', note: '' })
  const subject = person(data, employeeId)
  const save = useAction(async () => unwrap(await db.rpc('org_save_relation', {
    p_id: null, p_employee: employeeId, p_related: f.related, p_type: f.type, p_start: f.start, p_end: f.end || null,
    p_pct: f.type === 'dotted' && f.pct !== '' ? Number(f.pct) : null, p_note: null, p_reason: f.note.trim() || null })), close)
  return (
    <Shell title="Ajouter un lien hors hiérarchie" subtitle={subject ? `${fullName(subject)} · ${subject.poste}` : undefined} close={close}
      onSubmit={() => save.mutate()} pending={save.isPending} error={save.error} canSubmit={!!f.related && !!f.start}>
      <L t="Type de lien">
        <select className="org-input" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value as typeof f.type })} autoFocus>
          {(Object.keys(LINK_LABEL) as (keyof typeof LINK_LABEL)[]).map((t) => <option key={t} value={t}>{LINK_LABEL[t]}</option>)}
        </select>
      </L>
      <L t={f.type === 'interim' ? 'Intérim de (personne remplacée)' : 'Rapporte aussi à'}>
        <PersonSelect people={data.noeuds} value={f.related} onChange={(related) => setF({ ...f, related })} exclude={new Set([employeeId])} hint={() => null} />
      </L>
      <div className="grid grid-cols-2 gap-3">
        <L t="Début"><input className="org-input" type="date" value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} required /></L>
        <L t="Fin (facultatif)"><input className="org-input" type="date" value={f.end} onChange={(e) => setF({ ...f, end: e.target.value })} /></L>
      </div>
      {f.type === 'dotted' && <L t="Quote-part (%)" hint="Total des quotes-parts d'un salarié : 100 % maximum (anomalie signalée au-delà)."><input className="org-input" type="number" min={0} max={100} value={f.pct} onChange={(e) => setF({ ...f, pct: e.target.value })} /></L>}
      <Note value={f.note} onChange={(note) => setF({ ...f, note })} />
    </Shell>
  )
}

function EndForm({ env, link }: { env: Env; link: OrgLink }) {
  const { data, close } = env
  const [stop, setStop] = useState(today())
  const [note, setNote] = useState('')
  const subject = person(data, link.target)
  const save = useAction(async () => unwrap(await db.rpc('org_end_relation', { p_id: link.id, p_end: stop, p_reason: note.trim() || null })), close)
  return (
    <Shell title="Terminer un lien" subtitle={subject ? `${fullName(subject)} · ${LINK_LABEL[link.type as keyof typeof LINK_LABEL] ?? ''}` : undefined} close={close}
      onSubmit={() => save.mutate()} pending={save.isPending} error={save.error} canSubmit={!!stop} label="Terminer le lien" danger>
      <L t="Date de fin"><input className="org-input" type="date" value={stop} min={link.debut} onChange={(e) => setStop(e.target.value)} required autoFocus /></L>
      <Note value={note} onChange={setNote} />
    </Shell>
  )
}

// ------------------------------------------------------------ unités : direction, secteur, section, service
function UnitForm({ env, unit, parentId, unitKind }: { env: Env; unit?: OrgUnit; parentId?: string | null; unitKind?: UnitKind }) {
  const { data, close } = env
  const parent = data.unites.find((u) => u.id === (unit?.parent ?? parentId))
  const [f, setF] = useState({ name: unit?.nom ?? '', kind: unit?.type ?? unitKind ?? (parent ? nextKind(parent.type) : 'direction'), parent: unit?.parent ?? parentId ?? '', head: unit?.responsable ?? '', note: '' })
  const heads = useMemo(() => new Map(data.unites.filter((u) => u.responsable && u.id !== unit?.id).map((u) => [u.responsable!, u.nom])), [data, unit])
  const save = useAction(async () => unwrap(await db.rpc('org_save_unit', { p_id: unit?.id ?? null, p_name: f.name, p_kind: f.kind, p_parent: f.parent || null, p_head: f.head || null, p_note: f.note.trim() || null })), close)
  const options = [...data.unites].filter((u) => u.id !== unit?.id).sort((a, b) => unitPath(data.unites, a.id).localeCompare(unitPath(data.unites, b.id), 'fr'))
  return (
    <Shell title={unit ? `Modifier ${unit.nom}` : `Créer ${f.kind === 'direction' ? 'une direction' : f.kind === 'secteur' ? 'un secteur' : f.kind === 'section' ? 'une section' : 'un service'}`}
      subtitle="Les salariés y sont rattachés, avec ou sans compte utilisateur." close={close} onSubmit={() => save.mutate()} pending={save.isPending} error={save.error} canSubmit={!!f.name.trim()}>
      <L t="Nom"><input className="org-input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoFocus required /></L>
      <div className="grid grid-cols-2 gap-3">
        <L t="Type"><select className="org-input" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as UnitKind })}>{(Object.keys(UNIT_LABEL) as UnitKind[]).map((k) => <option key={k} value={k}>{UNIT_LABEL[k]}</option>)}</select></L>
        <L t="Dépend de"><select className="org-input" value={f.parent} onChange={(e) => setF({ ...f, parent: e.target.value })}><option value="">Société (niveau le plus haut)</option>{options.map((u) => <option key={u.id} value={u.id}>{unitPath(data.unites, u.id)}</option>)}</select></L>
      </div>
      <L t="Responsable (chef de service, directeur…)" hint="Il s'affichera « Manager » dans l'organigramme, même sans compte.">
        <PersonSelect people={data.noeuds} value={f.head} onChange={(head) => setF({ ...f, head })} required={false} emptyLabel="— aucun —" hint={(p) => (heads.has(p.id) ? `déjà responsable de ${heads.get(p.id)}` : null)} />
      </L>
      <Note value={f.note} onChange={(note) => setF({ ...f, note })} />
    </Shell>
  )
}

function UnitDeleteForm({ env, unit }: { env: Env; unit: OrgUnit }) {
  const { close } = env
  const save = useAction(async () => unwrap(await db.rpc('org_delete_unit', { p_id: unit.id })), close)
  return (
    <Shell title={`Supprimer ${unit.nom}`} close={close} onSubmit={() => save.mutate()} pending={save.isPending} error={save.error} canSubmit label="Supprimer" danger>
      <p className="text-sm">{unit.membres > 0 ? `${unit.membres} salarié(s) seront détachés de cette unité (ils ne sont pas supprimés). ` : ''}Une unité qui contient des sous-unités ne peut pas être supprimée.</p>
    </Shell>
  )
}

function EmployeeUnitForm({ env, employeeId }: { env: Env; employeeId: string }) {
  const { data, close } = env
  const emp = person(data, employeeId)
  const [unit, setUnit] = useState(emp?.unite ?? '')
  const [note, setNote] = useState('')
  const save = useAction(async () => unwrap(await db.rpc('org_set_employee_unit', { p_employee: employeeId, p_unit: unit || null, p_note: note.trim() || null })), close)
  const options = [...data.unites].sort((a, b) => unitPath(data.unites, a.id).localeCompare(unitPath(data.unites, b.id), 'fr'))
  return (
    <Shell title="Affecter à une direction ou un secteur" subtitle={emp ? `${fullName(emp)} · ${emp.poste}` : undefined} close={close} onSubmit={() => save.mutate()} pending={save.isPending} error={save.error} canSubmit>
      <L t="Direction, secteur ou section" hint={options.length ? undefined : 'Aucune unité : créez d’abord une direction depuis le bouton « Créer ».'}>
        <select className="org-input" value={unit} onChange={(e) => setUnit(e.target.value)} autoFocus>
          <option value="">Aucune (détacher de toute unité)</option>
          {options.map((u) => <option key={u.id} value={u.id}>{unitPath(data.unites, u.id)} ({UNIT_LABEL[u.type]})</option>)}
        </select>
      </L>
      <Note value={note} onChange={setNote} />
    </Shell>
  )
}

function UnitAttachForm({ env, unitId }: { env: Env; unitId: string }) {
  const { data, close } = env
  const unit = data.unites.find((u) => u.id === unitId)
  const names = useMemo(() => new Map(data.unites.map((u) => [u.id, u.nom])), [data])
  const [emp, setEmp] = useState('')
  const [note, setNote] = useState('')
  const save = useAction(async () => unwrap(await db.rpc('org_set_employee_unit', { p_employee: emp, p_unit: unitId, p_note: note.trim() || null })), close)
  return (
    <Shell title={`Rattacher un salarié à ${unit?.nom ?? ''}`} subtitle="Le salarié n’a pas besoin d’un compte pour être rattaché." close={close} onSubmit={() => save.mutate()} pending={save.isPending} error={save.error} canSubmit={!!emp}>
      <L t="Salarié">
        <PersonSelect people={data.noeuds} value={emp} onChange={setEmp} exclude={new Set(data.noeuds.filter((p) => p.unite === unitId).map((p) => p.id))} autoFocus
          hint={(p) => (p.unite ? `déjà dans ${names.get(p.unite) ?? 'une unité'}` : null)} />
      </L>
      <Note value={note} onChange={setNote} />
    </Shell>
  )
}

// ------------------------------------------------------------ postes
function PostForm({ env, employeeId }: { env: Env; employeeId?: string }) {
  const { data, close } = env
  const emp = employeeId ? person(data, employeeId) : undefined
  const [existing, setExisting] = useState(emp?.poste_id ?? '')
  const [name, setName] = useState('')
  const save = useAction(async () => {
    const id = name.trim() ? (unwrap(await db.rpc('org_save_post', { p_name: name })) as unknown as string) : existing
    if (employeeId) return unwrap(await db.rpc('org_set_employee_post', { p_employee: employeeId, p_post: id || null }))
    return id
  }, close)
  return (
    <Shell title={employeeId ? 'Changer de poste' : 'Créer un poste'} subtitle={emp ? `${fullName(emp)} · poste actuel : ${emp.poste}` : 'Le poste pourra ensuite être attribué aux salariés.'} close={close}
      onSubmit={() => save.mutate()} pending={save.isPending} error={save.error} canSubmit={!!name.trim() || (!!employeeId && !!existing)}>
      {employeeId && (
        <L t="Poste existant">
          <select className="org-input" value={existing} onChange={(e) => { setExisting(e.target.value); setName('') }} autoFocus>
            <option value="">— choisir —</option>
            {data.postes.map((p) => <option key={p.id} value={p.id}>{p.nom}</option>)}
          </select>
        </L>
      )}
      <L t={employeeId ? 'ou créer un nouveau poste' : 'Intitulé du poste'}><input className="org-input" value={name} onChange={(e) => { setName(e.target.value); if (e.target.value) setExisting('') }} autoFocus={!employeeId} placeholder="Ex. Responsable qualité" /></L>
    </Shell>
  )
}

// ------------------------------------------------------------ équipes
const TEAM_KIND: Record<string, string> = { project: 'Projet', committee: 'Comité', cross_functional: 'Équipe transverse' }

function TeamAddForm({ env, employeeId }: { env: Env; employeeId: string }) {
  const { data, close } = env
  const emp = person(data, employeeId)
  const mine = useMemo(() => new Set(data.equipes.filter((t) => t.membres.some((m) => m.employe === employeeId)).map((t) => t.id)), [data, employeeId])
  const [f, setF] = useState({ team: '', name: '', kind: 'project', role: 'membre', pct: '', start: today(), note: '' })
  const save = useAction(async () => {
    const note = f.note.trim() || null
    const tid = f.team === '__new__' ? (unwrap(await db.rpc('org_save_team', { p_id: null, p_name: f.name, p_kind: f.kind, p_lead: null, p_start: f.start, p_end: null, p_reason: note })) as unknown as string) : f.team
    return unwrap(await db.rpc('org_set_team_member', { p_team: tid, p_employee: employeeId, p_role: f.role, p_pct: f.pct === '' ? 0 : Number(f.pct), p_start: f.start, p_end: null, p_reason: note }))
  }, close)
  return (
    <Shell title="Ajouter à une équipe" subtitle={emp ? `${fullName(emp)} · ${emp.poste}` : undefined} close={close} onSubmit={() => save.mutate()} pending={save.isPending} error={save.error}
      canSubmit={!!f.team && (f.team !== '__new__' || !!f.name.trim())}>
      <L t="Équipe" hint="Orange : le salarié en est déjà membre.">
        <select className="org-input" value={f.team} onChange={(e) => setF({ ...f, team: e.target.value })} autoFocus required>
          <option value="">— choisir —</option>
          {data.equipes.map((t) => <option key={t.id} value={t.id} data-assigned={mine.has(t.id) ? 'true' : 'false'}>{t.nom}{mine.has(t.id) ? ' · déjà membre' : ''}</option>)}
          <option value="__new__">+ Nouvelle équipe…</option>
        </select>
      </L>
      {f.team === '__new__' && (
        <div className="grid grid-cols-2 gap-3">
          <L t="Nom de l'équipe"><input className="org-input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required /></L>
          <L t="Type"><select className="org-input" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>{Object.keys(TEAM_KIND).map((k) => <option key={k} value={k}>{TEAM_KIND[k]}</option>)}</select></L>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <L t="Rôle"><input className="org-input" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })} /></L>
        <L t="Quote-part (%)"><input className="org-input" type="number" min={0} max={100} value={f.pct} onChange={(e) => setF({ ...f, pct: e.target.value })} /></L>
      </div>
      <L t="Début"><input className="org-input" type="date" value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} required /></L>
      <Note value={f.note} onChange={(note) => setF({ ...f, note })} />
    </Shell>
  )
}

function TeamRemoveForm({ env, teamId, employeeId }: { env: Env; teamId: string; employeeId: string }) {
  const { data, close } = env
  const team = data.equipes.find((t) => t.id === teamId)
  const emp = person(data, employeeId)
  const [note, setNote] = useState('')
  const save = useAction(async () => unwrap(await db.rpc('org_remove_team_member', { p_team: teamId, p_employee: employeeId, p_note: note.trim() || null })), close)
  return (
    <Shell title="Retirer d'une équipe" subtitle={`${emp ? fullName(emp) : ''} · ${team?.nom ?? ''}`} close={close} onSubmit={() => save.mutate()} pending={save.isPending} error={save.error} canSubmit label="Retirer" danger>
      <p className="text-sm">La participation prend fin aujourd’hui ; l’historique est conservé.</p>
      <Note value={note} onChange={setNote} />
    </Shell>
  )
}

function TeamNewForm({ env }: { env: Env }) {
  const { data, close } = env
  const [f, setF] = useState({ name: '', kind: 'project', lead: '', start: today(), note: '' })
  const save = useAction(async () => unwrap(await db.rpc('org_save_team', { p_id: null, p_name: f.name, p_kind: f.kind, p_lead: f.lead || null, p_start: f.start, p_end: null, p_reason: f.note.trim() || null })), close)
  return (
    <Shell title="Créer une équipe" subtitle="Projet, comité ou équipe transverse : elle ne modifie pas la hiérarchie directe." close={close} onSubmit={() => save.mutate()} pending={save.isPending} error={save.error} canSubmit={!!f.name.trim()}>
      <L t="Nom"><input className="org-input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoFocus required /></L>
      <L t="Type"><select className="org-input" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>{Object.keys(TEAM_KIND).map((k) => <option key={k} value={k}>{TEAM_KIND[k]}</option>)}</select></L>
      <L t="Responsable d'équipe" hint="Il s'affichera « Manager », même sans compte utilisateur.">
        <PersonSelect people={data.noeuds} value={f.lead} onChange={(lead) => setF({ ...f, lead })} required={false} emptyLabel="— aucun —"
          hint={(p: OrgNode) => (p.responsable_de.length ? `responsable de ${p.responsable_de.join(', ')}` : null)} />
      </L>
      <L t="Début"><input className="org-input" type="date" value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} required /></L>
      <Note value={f.note} onChange={(note) => setF({ ...f, note })} />
    </Shell>
  )
}

export function OrgDialogs({ dialog, data, asOf, onClose }: { dialog: Dialog; data: OrgData; asOf: string; onClose: () => void }) {
  const env: Env = { data, asOf, close: onClose }
  switch (dialog.kind) {
    case 'attach': return <ManagerBase env={env} employeeId="" managerId={dialog.managerId} mode="attach" />
    case 'manager': return <ManagerBase env={env} employeeId={dialog.employeeId} mode="change" />
    case 'detach': return <ManagerBase env={env} employeeId={dialog.employeeId} mode="detach" />
    case 'relation': return <RelationForm env={env} employeeId={dialog.employeeId} />
    case 'end': return <EndForm env={env} link={dialog.link} />
    case 'unit': return <UnitForm env={env} unit={dialog.unit} parentId={dialog.parentId} unitKind={dialog.unitKind} />
    case 'unit-delete': return <UnitDeleteForm env={env} unit={dialog.unit} />
    case 'employee-unit': return <EmployeeUnitForm env={env} employeeId={dialog.employeeId} />
    case 'unit-attach': return <UnitAttachForm env={env} unitId={dialog.unitId} />
    case 'post': return <PostForm env={env} employeeId={dialog.employeeId} />
    case 'team-add': return <TeamAddForm env={env} employeeId={dialog.employeeId} />
    case 'team-remove': return <TeamRemoveForm env={env} teamId={dialog.teamId} employeeId={dialog.employeeId} />
    case 'team-new': return <TeamNewForm env={env} />
  }
}
