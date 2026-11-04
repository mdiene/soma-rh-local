import { fullName, type OrgNode } from '../../lib/org'

/** Liste de salariés : ceux déjà affectés (manager, équipe, direction…) sont en ambre ET portent un texte explicite ; les libres sont en vert. */
export function PersonSelect({ people, value, onChange, hint, exclude, emptyLabel = '— choisir —', autoFocus, required = true }: {
  people: OrgNode[]
  value: string
  onChange: (id: string) => void
  /** texte à ajouter pour un salarié déjà affecté (ex. « sous Jean Dupont »), ou null s'il est libre */
  hint: (p: OrgNode) => string | null
  exclude?: Set<string>
  emptyLabel?: string
  autoFocus?: boolean
  required?: boolean
}) {
  const list = people.filter((p) => !exclude?.has(p.id)).sort((a, b) => fullName(a).localeCompare(fullName(b), 'fr'))
  return (
    <>
      <select className="org-input" value={value} onChange={(e) => onChange(e.target.value)} required={required} autoFocus={autoFocus}>
        <option value="">{emptyLabel}</option>
        {list.map((p) => {
          const h = hint(p)
          return <option key={p.id} value={p.id} data-assigned={h ? 'true' : 'false'}>{fullName(p)}{p.poste ? ` — ${p.poste}` : ''}{h ? ` · ${h}` : ''}</option>
        })}
      </select>
      <span className="mt-1 block text-[11px] font-normal" style={{ color: 'var(--o-muted)' }}>
        <span style={{ color: 'var(--o-amber)' }}>● Orange : déjà affecté</span> · <span style={{ color: 'var(--o-green)' }}>● Vert : libre</span>
      </span>
    </>
  )
}
