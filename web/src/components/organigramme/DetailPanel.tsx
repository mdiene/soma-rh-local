import { AlertTriangle, Briefcase, GitBranch, Landmark, Link2, Mail, Pencil, Plus, Trash2, UserCog, Users, X } from 'lucide-react'
import type { ReactNode } from 'react'
import { LINK_LABEL, STATUS_LABEL, UNIT_LABEL, fmtDate, fullName, initials, isManager, unitNodeId, type OrgData, type OrgNode, type OrgUnit } from '../../lib/org'
import type { Dialog } from './OrgDialogs'

/** Fiche affichée au clic sur n'importe quel élément : salarié ou unité. Actions de rattachement / détachement pour la RH. */

type Common = { data: OrgData; canEdit: boolean; onClose: () => void; onSelect: (id: string) => void; onAction: (d: Dialog) => void }
const muted = { color: 'var(--o-muted)' } as const

function Section({ icon, title, children, actions }: { icon: ReactNode; title: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <section className="mt-4">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide" style={muted}>{icon}{title}</h3>
        <div className="flex flex-wrap gap-1.5">{actions}</div>
      </div>
      {children}
    </section>
  )
}
const Act = ({ onClick, children, danger, label }: { onClick: () => void; children: ReactNode; danger?: boolean; label?: string }) => (
  <button type="button" className="org-btn" style={{ minHeight: 30, fontSize: 12, padding: '0 8px', ...(danger ? { color: 'var(--o-amber)' } : {}) }} onClick={onClick} aria-label={label}>{children}</button>
)

export function DetailPanel({ person, data, canEdit, onClose, onSelect, onAction }: Common & { person: OrgNode }) {
  const byId = new Map(data.noeuds.map((n) => [n.id, n]))
  const manager = data.liens.find((l) => l.type === 'direct' && l.target === person.id)
  const mgr = manager ? byId.get(manager.source) : undefined
  const reports = data.liens.filter((l) => l.type === 'direct' && l.source === person.id).map((l) => byId.get(l.target)).filter(Boolean) as OrgNode[]
  const others = data.liens.filter((l) => l.type !== 'direct' && (l.source === person.id || l.target === person.id))
  const teams = data.equipes.filter((t) => t.responsable === person.id || t.membres.some((m) => m.employe === person.id))
  const anomalies = data.anomalies.filter((a) => a.employe === person.id)
  const unit = data.unites.find((u) => u.id === person.unite)
  const Btn = ({ p }: { p: OrgNode }) => (
    <button type="button" className="org-btn w-full justify-start text-left" onClick={() => onSelect(p.id)}>
      <span className="truncate">{fullName(p)}</span><span className="ml-auto truncate text-xs font-normal" style={muted}>{p.poste}</span>
    </button>
  )
  return (
    <aside className="org-sheet org-glass p-4" role="complementary" aria-label={`Fiche de ${fullName(person)}`} onKeyDown={(e) => e.key === 'Escape' && onClose()}>
      <div className="flex items-start gap-3">
        <span className="org-avatar" style={{ width: 52, height: 52, background: 'linear-gradient(135deg, var(--o-accent), var(--o-accent-2))' }} aria-hidden>{initials(person)}</span>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold leading-tight">{fullName(person)}</h2>
          {person.poste && <p className="text-sm" style={muted}>{person.poste}</p>}
          <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs" style={muted}>
            Matricule {person.matricule} · {STATUS_LABEL[person.statut]}
            {isManager(person) && <span className="org-chip" data-tone="manager"><UserCog className="h-3 w-3" aria-hidden />Manager</span>}
          </p>
          {person.responsable_de.length > 0 && <p className="mt-1 text-xs" style={muted}>Responsable de : {person.responsable_de.join(', ')}</p>}
        </div>
        <button type="button" className="org-btn" onClick={onClose} aria-label="Fermer la fiche"><X className="h-4 w-4" /></button>
      </div>
      {person.email && <p className="mt-3 flex items-center gap-2 text-sm"><Mail className="h-4 w-4" aria-hidden />{person.email}</p>}

      {anomalies.length > 0 && (
        <ul className="mt-3 space-y-1 rounded-xl border p-3 text-xs" style={{ borderColor: 'var(--o-amber)', color: 'var(--o-amber)' }} role="status">
          {anomalies.map((a, i) => <li key={i} className="flex gap-2"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-none" aria-hidden />{a.message}</li>)}
        </ul>
      )}

      <Section icon={<Briefcase className="h-3.5 w-3.5" aria-hidden />} title="Poste et direction"
        actions={canEdit && <><Act onClick={() => onAction({ kind: 'post', employeeId: person.id })}>Poste</Act><Act onClick={() => onAction({ kind: 'employee-unit', employeeId: person.id })}>{unit ? 'Changer d’unité' : 'Affecter'}</Act></>}>
        {person.poste ? <p className="text-sm">{person.poste}</p> : <p className="text-sm" style={muted}>Aucun poste attribué.</p>}
        {unit ? <button type="button" className="org-btn mt-1.5 w-full justify-start" onClick={() => onSelect(unitNodeId(unit.id))}><Landmark className="h-4 w-4" aria-hidden />{unit.nom}<span className="ml-auto text-xs font-normal" style={muted}>{UNIT_LABEL[unit.type]}</span></button>
          : <p className="mt-1 text-sm" style={muted}>Non rattaché à une direction, un secteur ou une section.</p>}
      </Section>

      <Section icon={<GitBranch className="h-3.5 w-3.5" aria-hidden />} title="Manager direct"
        actions={canEdit && <><Act onClick={() => onAction({ kind: 'manager', employeeId: person.id })}>{mgr ? 'Changer' : 'Rattacher'}</Act>{mgr && <Act danger onClick={() => onAction({ kind: 'detach', employeeId: person.id })}>Détacher</Act>}</>}>
        {mgr ? <Btn p={mgr} /> : <p className="text-sm" style={muted}>Aucun manager direct à cette date.</p>}
      </Section>

      <Section icon={<Users className="h-3.5 w-3.5" aria-hidden />} title={`Subordonnés directs (${reports.length})`}
        actions={canEdit && <Act onClick={() => onAction({ kind: 'attach', managerId: person.id })}><Plus className="h-3 w-3" aria-hidden />Rattacher un salarié</Act>}>
        <div className="space-y-1">{reports.map((p) => <Btn key={p.id} p={p} />)}{reports.length === 0 && <p className="text-sm" style={muted}>Aucun.</p>}</div>
      </Section>

      <Section icon={<Link2 className="h-3.5 w-3.5" aria-hidden />} title={`Liens hors hiérarchie (${others.length})`}
        actions={canEdit && <Act onClick={() => onAction({ kind: 'relation', employeeId: person.id })}><Plus className="h-3 w-3" aria-hidden />Lien</Act>}>
        <ul className="space-y-2">
          {others.map((l) => {
            const other = byId.get(l.source === person.id ? l.target : l.source)
            return (
              <li key={l.id} className="rounded-xl border p-2.5 text-sm" style={{ borderColor: 'var(--o-border)' }}>
                <p className="font-semibold">{LINK_LABEL[l.type as keyof typeof LINK_LABEL]}{l.quote_part ? ` · ${l.quote_part} %` : ''}</p>
                <p style={muted}>{l.target === person.id ? 'avec' : 'pour'} {other ? fullName(other) : '—'} · depuis le {fmtDate(l.debut)}{l.fin ? ` jusqu’au ${fmtDate(l.fin)}` : ''}</p>
                {l.note && <p className="text-xs" style={muted}>{l.note}</p>}
                {canEdit && <div className="mt-2"><Act danger onClick={() => onAction({ kind: 'end', link: l })}>Terminer ce lien</Act></div>}
              </li>
            )
          })}
          {others.length === 0 && <li className="text-sm" style={muted}>Aucun lien actif.</li>}
        </ul>
      </Section>

      <Section icon={<Users className="h-3.5 w-3.5" aria-hidden />} title={`Équipes (${teams.length})`}
        actions={canEdit && <Act onClick={() => onAction({ kind: 'team-add', employeeId: person.id })}><Plus className="h-3 w-3" aria-hidden />Équipe</Act>}>
        <ul className="space-y-1 text-sm">
          {teams.map((t) => { const m = t.membres.find((x) => x.employe === person.id); return (
            <li key={t.id} className="flex items-center justify-between gap-2">
              <span>{t.nom}{t.responsable === person.id ? ' · responsable' : m ? ` · ${m.role}${m.quote_part ? ` (${m.quote_part} %)` : ''}` : ''}</span>
              {canEdit && m && <Act danger onClick={() => onAction({ kind: 'team-remove', teamId: t.id, employeeId: person.id })}>Retirer</Act>}
            </li>) })}
          {teams.length === 0 && <li style={muted}>Aucune équipe.</li>}
        </ul>
      </Section>
    </aside>
  )
}

export function UnitPanel({ unit, data, canEdit, onClose, onSelect, onAction }: Common & { unit: OrgUnit }) {
  const byId = new Map(data.noeuds.map((n) => [n.id, n]))
  const head = unit.responsable ? byId.get(unit.responsable) : undefined
  const parent = data.unites.find((u) => u.id === unit.parent)
  const children = data.unites.filter((u) => u.parent === unit.id)
  const members = data.noeuds.filter((p) => p.unite === unit.id)
  return (
    <aside className="org-sheet org-glass p-4" role="complementary" aria-label={`Fiche de ${unit.nom}`} onKeyDown={(e) => e.key === 'Escape' && onClose()}>
      <div className="flex items-start gap-3">
        <span className="org-avatar org-avatar-unit" data-unit={unit.type} style={{ width: 52, height: 52 }} aria-hidden><Landmark className="h-6 w-6" /></span>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold leading-tight">{unit.nom}</h2>
          <p className="text-sm" style={muted}>{UNIT_LABEL[unit.type]}{parent ? ` · dépend de ${parent.nom}` : ' · niveau le plus haut'}</p>
          <p className="mt-1 text-xs" style={muted}>{unit.membres} salarié(s)</p>
        </div>
        <button type="button" className="org-btn" onClick={onClose} aria-label="Fermer la fiche"><X className="h-4 w-4" /></button>
      </div>

      <Section icon={<UserCog className="h-3.5 w-3.5" aria-hidden />} title="Responsable" actions={canEdit && <Act onClick={() => onAction({ kind: 'unit', unit })}><Pencil className="h-3 w-3" aria-hidden />Modifier</Act>}>
        {head ? <button type="button" className="org-btn w-full justify-start" onClick={() => onSelect(head.id)}>{fullName(head)}<span className="ml-auto text-xs font-normal" style={muted}>{head.poste}</span></button>
          : <p className="text-sm" style={muted}>Aucun responsable défini.</p>}
      </Section>

      <Section icon={<Landmark className="h-3.5 w-3.5" aria-hidden />} title={`Sous-unités (${children.length})`}
        actions={canEdit && <Act onClick={() => onAction({ kind: 'unit', parentId: unit.id })}><Plus className="h-3 w-3" aria-hidden />Sous-unité</Act>}>
        <div className="space-y-1">{children.map((u) => <button key={u.id} type="button" className="org-btn w-full justify-start" onClick={() => onSelect(unitNodeId(u.id))}>{u.nom}<span className="ml-auto text-xs font-normal" style={muted}>{UNIT_LABEL[u.type]}</span></button>)}
          {children.length === 0 && <p className="text-sm" style={muted}>Aucune.</p>}</div>
      </Section>

      <Section icon={<Users className="h-3.5 w-3.5" aria-hidden />} title={`Salariés (${members.length})`}
        actions={canEdit && <Act onClick={() => onAction({ kind: 'unit-attach', unitId: unit.id })}><Plus className="h-3 w-3" aria-hidden />Rattacher un salarié</Act>}>
        <div className="space-y-1">{members.map((p) => <button key={p.id} type="button" className="org-btn w-full justify-start" onClick={() => onSelect(p.id)}>{fullName(p)}<span className="ml-auto truncate text-xs font-normal" style={muted}>{p.poste}</span></button>)}
          {members.length === 0 && <p className="text-sm" style={muted}>Aucun salarié rattaché.</p>}</div>
      </Section>

      {canEdit && (
        <div className="mt-5 flex flex-wrap gap-2 border-t pt-4" style={{ borderColor: 'var(--o-border)' }}>
          <Act onClick={() => onAction({ kind: 'unit', unit })}><Pencil className="h-3 w-3" aria-hidden />Modifier</Act>
          <Act danger onClick={() => onAction({ kind: 'unit-delete', unit })}><Trash2 className="h-3 w-3" aria-hidden />Supprimer l’unité</Act>
        </div>
      )}
    </aside>
  )
}
