import { AlertTriangle, ArrowRightLeft, GitBranch, Link2, Mail, Users, X } from 'lucide-react'
import { LINK_LABEL, STATUS_LABEL, fmtDate, fullName, initials, type OrgAnomaly, type OrgData, type OrgLink, type OrgNode } from '../../lib/org'

/** Fiche du salarié sélectionné : manager, subordonnés, liens hors hiérarchie, équipes, anomalies, actions (RH). */

type Props = {
  person: OrgNode
  data: OrgData
  canEdit: boolean
  onClose: () => void
  onSelect: (id: string) => void
  onEditManager: () => void
  onAddRelation: () => void
  onEndLink: (l: OrgLink) => void
}

export function DetailPanel({ person, data, canEdit, onClose, onSelect, onEditManager, onAddRelation, onEndLink }: Props) {
  const byId = new Map(data.noeuds.map((n) => [n.id, n]))
  const manager = data.liens.find((l) => l.type === 'direct' && l.target === person.id)
  const reports = data.liens.filter((l) => l.type === 'direct' && l.source === person.id).map((l) => byId.get(l.target)).filter(Boolean) as OrgNode[]
  const others = data.liens.filter((l) => l.type !== 'direct' && (l.source === person.id || l.target === person.id))
  const teams = data.equipes.filter((t) => t.responsable === person.id || t.membres.some((m) => m.employe === person.id))
  const anomalies = data.anomalies.filter((a: OrgAnomaly) => a.employe === person.id)
  const Btn = ({ p, label }: { p: OrgNode; label?: string }) => (
    <button type="button" className="org-btn w-full justify-start text-left" onClick={() => onSelect(p.id)}>
      <span className="truncate">{label ?? fullName(p)}</span><span className="ml-auto truncate text-xs font-normal" style={{ color: 'var(--o-muted)' }}>{p.poste}</span>
    </button>
  )
  return (
    <aside className="org-sheet org-glass p-4" role="complementary" aria-label={`Fiche de ${fullName(person)}`} onKeyDown={(e) => e.key === 'Escape' && onClose()}>
      <div className="flex items-start gap-3">
        <span className="org-avatar" style={{ width: 52, height: 52, background: 'linear-gradient(135deg, var(--o-accent), var(--o-accent-2))' }} aria-hidden>{initials(person)}</span>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold leading-tight">{fullName(person)}</h2>
          <p className="text-sm" style={{ color: 'var(--o-muted)' }}>{person.poste}{person.departement ? ` · ${person.departement}` : ''}</p>
          <p className="mt-1 text-xs" style={{ color: 'var(--o-muted)' }}>Matricule {person.matricule} · {STATUS_LABEL[person.statut]}</p>
        </div>
        <button type="button" className="org-btn" onClick={onClose} aria-label="Fermer la fiche"><X className="h-4 w-4" /></button>
      </div>
      {person.email && <p className="mt-3 flex items-center gap-2 text-sm"><Mail className="h-4 w-4" aria-hidden />{person.email}</p>}

      {anomalies.length > 0 && (
        <ul className="mt-3 space-y-1 rounded-xl border p-3 text-xs" style={{ borderColor: 'var(--o-amber)', color: 'var(--o-amber)' }} role="status">
          {anomalies.map((a, i) => <li key={i} className="flex gap-2"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-none" aria-hidden />{a.message}</li>)}
        </ul>
      )}

      <section className="mt-4">
        <h3 className="mb-1.5 flex items-center gap-2 text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--o-muted)' }}><GitBranch className="h-3.5 w-3.5" aria-hidden />Manager direct</h3>
        {manager && byId.get(manager.source) ? <Btn p={byId.get(manager.source)!} /> : <p className="text-sm" style={{ color: 'var(--o-muted)' }}>Aucun manager direct à cette date.</p>}
      </section>

      <section className="mt-4">
        <h3 className="mb-1.5 flex items-center gap-2 text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--o-muted)' }}><Users className="h-3.5 w-3.5" aria-hidden />Subordonnés directs ({reports.length})</h3>
        <div className="space-y-1">{reports.map((p) => <Btn key={p.id} p={p} />)}{reports.length === 0 && <p className="text-sm" style={{ color: 'var(--o-muted)' }}>Aucun.</p>}</div>
      </section>

      <section className="mt-4">
        <h3 className="mb-1.5 flex items-center gap-2 text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--o-muted)' }}><Link2 className="h-3.5 w-3.5" aria-hidden />Liens hors hiérarchie ({others.length})</h3>
        <ul className="space-y-2">
          {others.map((l) => {
            const other = byId.get(l.source === person.id ? l.target : l.source)
            const incoming = l.target === person.id
            return (
              <li key={l.id} className="rounded-xl border p-2.5 text-sm" style={{ borderColor: 'var(--o-border)' }}>
                <p className="font-semibold">{LINK_LABEL[l.type as keyof typeof LINK_LABEL]}{l.quote_part ? ` · ${l.quote_part} %` : ''}</p>
                <p style={{ color: 'var(--o-muted)' }}>{incoming ? 'avec' : 'pour'} {other ? fullName(other) : '—'} · depuis le {fmtDate(l.debut)}{l.fin ? ` jusqu’au ${fmtDate(l.fin)}` : ''}</p>
                {l.note && <p className="text-xs" style={{ color: 'var(--o-muted)' }}>{l.note}</p>}
                {canEdit && <button type="button" className="org-btn mt-2" onClick={() => onEndLink(l)}>Terminer ce lien</button>}
              </li>
            )
          })}
          {others.length === 0 && <li className="text-sm" style={{ color: 'var(--o-muted)' }}>Aucun lien actif.</li>}
        </ul>
      </section>

      {teams.length > 0 && (
        <section className="mt-4">
          <h3 className="mb-1.5 text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--o-muted)' }}>Équipes ({teams.length})</h3>
          <ul className="space-y-1 text-sm">
            {teams.map((t) => { const m = t.membres.find((x) => x.employe === person.id); return <li key={t.id}>{t.nom}{t.responsable === person.id ? ' · responsable' : m ? ` · ${m.role}${m.quote_part ? ` (${m.quote_part} %)` : ''}` : ''}</li> })}
          </ul>
        </section>
      )}

      {canEdit && (
        <div className="mt-5 flex flex-wrap gap-2 border-t pt-4" style={{ borderColor: 'var(--o-border)' }}>
          <button type="button" className="org-btn" data-primary="true" onClick={onEditManager}><ArrowRightLeft className="h-4 w-4" aria-hidden />Changer de manager</button>
          <button type="button" className="org-btn" onClick={onAddRelation}><Link2 className="h-4 w-4" aria-hidden />Ajouter un lien</button>
        </div>
      )}
    </aside>
  )
}
