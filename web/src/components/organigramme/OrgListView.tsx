import { AlertTriangle } from 'lucide-react'
import { GROUP_ID, ROOT_ID, STATUS_LABEL, UNIT_LABEL, fullName, type OrgData, type ViewNode } from '../../lib/org'

/** Vue « liste hiérarchique » : alternative accessible au graphique (arbre dépliable, lisible à l'écran-lecteur). */

export function OrgListView({ tree, data, matches, onSelect }: { tree: Map<string, ViewNode>; data: OrgData; matches: Set<string> | null; onSelect: (id: string) => void }) {
  const anomalies = new Map<string, number>()
  for (const a of data.anomalies) anomalies.set(a.employe, (anomalies.get(a.employe) ?? 0) + 1)

  const render = (id: string, depth: number) => {
    const v = tree.get(id)
    if (!v) return null
    const kids = v.children
    const label = v.kind === 'person' ? fullName(v.person!) : v.label!
    const detail = v.kind === 'person'
      ? [v.person!.poste, STATUS_LABEL[v.person!.statut], v.person!.departement].filter(Boolean).join(' · ')
      : v.kind === 'group' ? `${kids.length} ${v.sub ?? 'salarié(s)'}`
      : v.kind === 'unit' ? `${UNIT_LABEL[v.unit!.type]} · ${v.unit!.membres} salarié(s)` : 'Société Minière Africaine'
    const dim = matches && v.kind === 'person' && !matches.has(id)
    const row = (
      <span className={`flex flex-wrap items-center gap-x-3 gap-y-0.5 ${dim ? 'opacity-40' : ''}`}>
        {v.kind === 'person'
          ? <button type="button" className="org-btn" style={{ minHeight: 32 }} onClick={() => onSelect(id)}>{label}</button>
          : <strong>{label}</strong>}
        <span className="text-sm" style={{ color: 'var(--o-muted)' }}>{detail}{kids.length ? ` · ${kids.length} direct(s)` : ''}</span>
        {anomalies.get(id) ? <span className="inline-flex items-center gap-1 text-xs" style={{ color: 'var(--o-amber)' }}><AlertTriangle className="h-3 w-3" aria-hidden />{anomalies.get(id)} anomalie(s)</span> : null}
      </span>
    )
    if (kids.length === 0) return <li key={id} className="py-1" style={{ paddingLeft: depth ? 8 : 0 }}>{row}</li>
    return (
      <li key={id} className="py-1">
        <details open={depth < 2 && id !== GROUP_ID}>
          <summary className="cursor-pointer list-none rounded-lg px-2 py-1 hover:bg-[var(--o-card-2)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--o-accent)]">{row}</summary>
          <ul className="ml-4 border-l pl-3" style={{ borderColor: 'var(--o-border)' }}>{kids.map((c) => render(c, depth + 1))}</ul>
        </details>
      </li>
    )
  }
  return (
    <nav className="h-full overflow-auto p-4 md:p-6" aria-label="Organigramme sous forme de liste hiérarchique">
      <ul>{render(ROOT_ID, 0)}</ul>
    </nav>
  )
}
