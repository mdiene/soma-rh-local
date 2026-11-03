import dagre from '@dagrejs/dagre'

/** Organigramme : types, construction de l'arbre et disposition. Logique pure, sans React. */

export type OrgStatus = 'actif' | 'en_conge' | 'interim'
export type OrgNode = {
  id: string; matricule: string; prenom: string; nom: string; poste: string; departement: string | null
  email: string | null; statut: OrgStatus; sortie: string | null; subordonnes: number; equipes: number
}
export type LinkType = 'direct' | 'dotted' | 'interim' | 'functional'
export type OrgLink = { id: string; type: LinkType; source: string; target: string; debut: string; fin: string | null; quote_part?: number | null; note?: string | null }
export type OrgTeam = { id: string; nom: string; type: string; responsable: string | null; debut: string; fin: string | null; membres: { employe: string; role: string; quote_part: number }[] }
export type OrgAnomaly = { code: string; employe: string; message: string }
export type OrgData = { date: string; noeuds: OrgNode[]; liens: OrgLink[]; equipes: OrgTeam[]; anomalies: OrgAnomaly[] }

export const ROOT_ID = 'soma-root'
export const GROUP_ID = 'soma-unattached'
export const CARD_W = 236
export const CARD_H = 88

export type ViewKind = 'person' | 'root' | 'group'
export type ViewNode = { id: string; kind: ViewKind; person?: OrgNode; label?: string; parent: string | null; children: string[] }

export const STATUS_LABEL: Record<OrgStatus, string> = { actif: 'Actif', en_conge: 'En congé', interim: 'Intérim' }
export const LINK_LABEL: Record<Exclude<LinkType, 'direct'>, string> = { dotted: 'Rattachement pointillé', interim: 'Intérim', functional: 'Responsable fonctionnel' }

export const fullName = (p: OrgNode) => `${p.prenom} ${p.nom}`
export const initials = (p: OrgNode) => `${p.prenom[0] ?? ''}${p.nom[0] ?? ''}`.toUpperCase()

/** Hiérarchie directe seulement : parent de chaque salarié, têtes de branche, salariés non rattachés. */
export function buildTree(data: OrgData): { nodes: Map<string, ViewNode>; unattached: string[] } {
  const parent = new Map<string, string>()
  for (const l of data.liens) if (l.type === 'direct') parent.set(l.target, l.source)
  const hasChildren = new Set(parent.values())
  const nodes = new Map<string, ViewNode>()
  nodes.set(ROOT_ID, { id: ROOT_ID, kind: 'root', label: 'SOMA', parent: null, children: [] })
  nodes.set(GROUP_ID, { id: GROUP_ID, kind: 'group', label: 'Non rattachés', parent: ROOT_ID, children: [] })
  const unattached: string[] = []
  for (const p of data.noeuds) nodes.set(p.id, { id: p.id, kind: 'person', person: p, parent: null, children: [] })
  for (const p of data.noeuds) {
    const v = nodes.get(p.id)!
    const par = parent.get(p.id)
    if (par && nodes.has(par)) v.parent = par
    else if (hasChildren.has(p.id)) v.parent = ROOT_ID
    else { v.parent = GROUP_ID; unattached.push(p.id) }
    nodes.get(v.parent)!.children.push(p.id)
  }
  const root = nodes.get(ROOT_ID)!
  root.children = root.children.filter((c) => c !== GROUP_ID)
  if (unattached.length) root.children.push(GROUP_ID)
  else nodes.delete(GROUP_ID)
  return { nodes, unattached }
}

/** Nœuds visibles : on ne descend pas sous un nœud replié. */
export function visibleIds(nodes: Map<string, ViewNode>, collapsed: Set<string>): Set<string> {
  const out = new Set<string>()
  const walk = (id: string) => { out.add(id); if (!collapsed.has(id)) for (const c of nodes.get(id)?.children ?? []) walk(c) }
  walk(ROOT_ID)
  return out
}

export function descendantsCount(nodes: Map<string, ViewNode>, id: string): number {
  let n = 0
  const walk = (x: string) => { for (const c of nodes.get(x)?.children ?? []) { n += 1; walk(c) } }
  walk(id)
  return n
}

export function ancestorsOf(nodes: Map<string, ViewNode>, id: string): string[] {
  const out: string[] = []
  let cur = nodes.get(id)?.parent
  while (cur) { out.push(cur); cur = nodes.get(cur)?.parent ?? null }
  return out
}

/** Disposition calculée UNIQUEMENT sur la hiérarchie : les liens hors hiérarchie ne déplacent rien. */
export function layout(nodes: Map<string, ViewNode>, visible: Set<string>): Map<string, { x: number; y: number }> {
  const g = new dagre.graphlib.Graph()
  g.setDefaultEdgeLabel(() => ({}))
  g.setGraph({ rankdir: 'TB', nodesep: 36, ranksep: 84, marginx: 24, marginy: 24 })
  for (const id of visible) g.setNode(id, { width: CARD_W, height: CARD_H })
  for (const id of visible) { const p = nodes.get(id)?.parent; if (p && visible.has(p)) g.setEdge(p, id) }
  dagre.layout(g)
  const pos = new Map<string, { x: number; y: number }>()
  for (const id of visible) { const n = g.node(id); pos.set(id, { x: n.x - CARD_W / 2, y: n.y - CARD_H / 2 }) }
  return pos
}

/** Chaîne hiérarchique d'un nœud (ancêtres + descendants) : sert à la mise en évidence au survol. */
export function chainOf(nodes: Map<string, ViewNode>, id: string): Set<string> {
  const out = new Set<string>([id, ...ancestorsOf(nodes, id)])
  const walk = (x: string) => { for (const c of nodes.get(x)?.children ?? []) { out.add(c); walk(c) } }
  walk(id)
  return out
}

export const fmtDate = (d: string | null) => (d ? new Date(d + 'T00:00:00').toLocaleDateString('fr-FR') : '')
