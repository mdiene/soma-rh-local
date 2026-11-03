import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { dataApi, unwrap, type ApiClient } from '../../lib/api'
import { LINK_LABEL, fullName, type LinkType, type OrgLink, type OrgNode } from '../../lib/org'

/** Formulaires d'édition de l'organigramme (RH/admin) : changement de manager, lien hors hiérarchie, fin de lien. */

const db = dataApi as unknown as ApiClient
export type EditMode =
  | { kind: 'manager'; employeeId: string }
  | { kind: 'relation'; employeeId: string }
  | { kind: 'end'; link: OrgLink }

const today = () => new Date().toISOString().slice(0, 10)

function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block text-xs font-semibold" style={{ color: 'var(--o-muted)' }}>
      {label}
      <div className="mt-1 font-normal [&>*]:w-full">{children}</div>
      {hint && <span className="mt-1 block font-normal">{hint}</span>}
    </label>
  )
}

export function LinkEditorDialog({ mode, people, onClose, asOf }: { mode: EditMode; people: OrgNode[]; onClose: () => void; asOf: string }) {
  const qc = useQueryClient()
  const person = (id: string) => people.find((p) => p.id === id)
  const subject = mode.kind === 'end' ? person(mode.link.target) : person(mode.employeeId)
  const [f, setF] = useState({
    manager: '', from: asOf > today() ? asOf : today(), related: '', type: 'dotted' as Exclude<LinkType, 'direct'>,
    start: today(), end: '', pct: '', note: '', reason: '', stop: today(),
  })
  const save = useMutation({
    mutationFn: async () => {
      if (mode.kind === 'manager') {
        return unwrap(await db.rpc('org_set_manager', { p_employee: mode.employeeId, p_manager: f.manager || null, p_from: f.from, p_reason: f.reason }))
      }
      if (mode.kind === 'relation') {
        return unwrap(await db.rpc('org_save_relation', {
          p_id: null, p_employee: mode.employeeId, p_related: f.related, p_type: f.type, p_start: f.start, p_end: f.end || null,
          p_pct: f.type === 'dotted' && f.pct !== '' ? Number(f.pct) : null, p_note: f.note || null, p_reason: f.reason,
        }))
      }
      return unwrap(await db.rpc('org_end_relation', { p_id: mode.link.id, p_end: f.stop, p_reason: f.reason }))
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['org_chart'] }); onClose() },
  })
  const title = mode.kind === 'manager' ? 'Changer de manager direct' : mode.kind === 'relation' ? 'Ajouter un lien hors hiérarchie' : 'Terminer un lien'
  const others = people.filter((p) => p.id !== subject?.id)
  const invalid = f.reason.trim().length < 5 || (mode.kind === 'relation' && !f.related)

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4" style={{ background: 'rgba(3, 7, 18, .6)' }} role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="org-glass w-full max-w-md rounded-2xl p-5" role="dialog" aria-modal="true" aria-label={title}
        onKeyDown={(e) => e.key === 'Escape' && onClose()}>
        <h2 className="text-base font-semibold">{title}</h2>
        {subject && <p className="mb-4 text-sm" style={{ color: 'var(--o-muted)' }}>{fullName(subject)} · {subject.poste}</p>}
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); save.mutate() }}>
          {mode.kind === 'manager' && (
            <>
              <Field label="Nouveau manager direct" hint="Le rattachement actuel est clos la veille de la date d'effet.">
                <select className="org-input" value={f.manager} onChange={(e) => setF({ ...f, manager: e.target.value })} autoFocus>
                  <option value="">Aucun manager (tête de branche)</option>
                  {others.map((p) => <option key={p.id} value={p.id}>{fullName(p)} — {p.poste}</option>)}
                </select>
              </Field>
              <Field label="Date d'effet"><input className="org-input" type="date" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} required /></Field>
            </>
          )}
          {mode.kind === 'relation' && (
            <>
              <Field label="Type de lien">
                <select className="org-input" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value as typeof f.type })} autoFocus>
                  {(Object.keys(LINK_LABEL) as (keyof typeof LINK_LABEL)[]).map((t) => <option key={t} value={t}>{LINK_LABEL[t]}</option>)}
                </select>
              </Field>
              <Field label={f.type === 'interim' ? 'Intérim de (personne remplacée)' : 'Rapporte aussi à'}>
                <select className="org-input" value={f.related} onChange={(e) => setF({ ...f, related: e.target.value })} required>
                  <option value="">— choisir —</option>
                  {others.map((p) => <option key={p.id} value={p.id}>{fullName(p)} — {p.poste}</option>)}
                </select>
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Début"><input className="org-input" type="date" value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} required /></Field>
                <Field label="Fin (facultatif)"><input className="org-input" type="date" value={f.end} onChange={(e) => setF({ ...f, end: e.target.value })} /></Field>
              </div>
              {f.type === 'dotted' && (
                <Field label="Quote-part (%)" hint="Total des quotes-parts d'un salarié : 100 % maximum (anomalie signalée au-delà).">
                  <input className="org-input" type="number" min={0} max={100} value={f.pct} onChange={(e) => setF({ ...f, pct: e.target.value })} />
                </Field>
              )}
              <Field label="Note"><input className="org-input" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
            </>
          )}
          {mode.kind === 'end' && (
            <Field label="Date de fin"><input className="org-input" type="date" value={f.stop} min={mode.link.debut} onChange={(e) => setF({ ...f, stop: e.target.value })} required autoFocus /></Field>
          )}
          <Field label="Motif (obligatoire, 5 caractères minimum)">
            <input className="org-input" value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} placeholder="Ex. réorganisation du service" />
          </Field>
          {save.error && <p role="alert" className="rounded-lg border px-3 py-2 text-sm" style={{ borderColor: 'var(--o-amber)', color: 'var(--o-amber)' }}>{(save.error as Error).message}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" className="org-btn" onClick={onClose}>Annuler</button>
            <button type="submit" className="org-btn" data-primary="true" disabled={invalid || save.isPending}>{save.isPending ? 'Enregistrement…' : 'Enregistrer'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}
