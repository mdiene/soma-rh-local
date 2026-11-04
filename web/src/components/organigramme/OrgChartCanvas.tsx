import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { Background, BackgroundVariant, Controls, MiniMap, ReactFlow, ReactFlowProvider, useReactFlow, type Edge, type FinalConnectionState, type Node } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import './organigramme.css'
import './organigramme-actions.css'
import { CARD_H, CARD_W, GROUP_ID, LINK_LABEL, ROOT_ID, unitNodeId, chainOf, descendantsCount, layout, visibleIds, type LinkType, type OrgData, type ViewNode } from '../../lib/org'
import { GroupNode, OrgEdge, PersonNode, RootNode, UnitNode, VacantNode } from './OrgNodes'
import { OrgContext, type CardData, type EdgeData, type OrgCtx } from './orgContext'

const nodeTypes = { person: PersonNode, root: RootNode, unit: UnitNode, vacant: VacantNode, unattached: GroupNode } // « group » est un type réservé de React Flow
const edgeTypes = { org: OrgEdge }

/** Canevas React Flow : disposition sur la hiérarchie seulement, liens hors hiérarchie dessinés par-dessus. */

export type CanvasProps = {
  data: OrgData
  tree: Map<string, ViewNode>
  collapsed: Set<string>
  onToggle: (id: string) => void
  selectedId: string | null
  onSelect: (id: string | null) => void
  matches: Set<string> | null
  showLinks: Record<Exclude<LinkType, 'direct'>, boolean>
  focus: { id: string; n: number } | null
  fitSignal: number
  onMenu: (id: string, anchor: DOMRect) => void
  /** « managers » : liens hors hiérarchie visibles ; « structure » : seulement la structure (directions, secteurs, sections) */
  mode: 'managers' | 'structure'
  canEdit: boolean
  /** liaison tirée à la souris : `from` = carte de départ, `handle` = poignée utilisée (dn = bas, t = haut, side = côté), `to` = carte d'arrivée */
  onLink: (from: string, handle: 'dn' | 't' | 'side', to: string) => void
  /** clic sur une ligne : menu d'actions (détacher, changer, terminer…) */
  onEdge: (edge: EdgeData, x: number, y: number) => void
}

function Inner({ data, tree, collapsed, onToggle, selectedId, onSelect, matches, showLinks, focus, fitSignal, onMenu, mode, canEdit, onLink, onEdge }: CanvasProps) {
  const rf = useReactFlow()
  const lastSignal = useRef(fitSignal)
  const [hover, setHover] = useState<string | null>(null)
  const visible = useMemo(() => visibleIds(tree, collapsed), [tree, collapsed])
  const pos = useMemo(() => layout(tree, visible), [tree, visible])
  const chain = useMemo(() => (hover ? chainOf(tree, hover) : null), [tree, hover])

  const nodes = useMemo<Node[]>(() => [...visible].map((id) => {
    const view = tree.get(id)!
    return { id, type: view.kind === 'group' ? 'unattached' : view.kind, position: pos.get(id)!, data: { view } as CardData, draggable: false, selectable: false, focusable: true, initialWidth: CARD_W, initialHeight: CARD_H }
  }), [visible, tree, pos])

  const edges = useMemo<Edge[]>(() => {
    const out: Edge[] = []
    for (const id of visible) {
      const parent = tree.get(id)?.parent
      if (!parent || !visible.has(parent)) continue
      const on = !!chain && chain.has(id) && chain.has(parent)
      const d: EdgeData = { kind: 'tree', source: parent, target: id, hot: on, dim: !!chain && !on }
      out.push({ id: `t-${parent}-${id}`, source: parent, target: id, sourceHandle: 'b', targetHandle: 't', type: 'org', data: d, focusable: false })
    }
    for (const l of data.liens) {
      if (mode === 'structure' || l.type === 'direct' || !showLinks[l.type]) continue
      if (!visible.has(l.source) || !visible.has(l.target)) continue
      const left = (pos.get(l.source)?.x ?? 0) <= (pos.get(l.target)?.x ?? 0)
      const label = l.type === 'dotted' && l.quote_part ? `${LINK_LABEL.dotted} · ${l.quote_part} %` : LINK_LABEL[l.type]
      const d: EdgeData = { kind: l.type, source: l.source, target: l.target, linkId: l.id, label, dim: !!chain && !(chain.has(l.source) && chain.has(l.target)) }
      out.push({ id: `x-${l.id}`, source: l.source, target: l.target, sourceHandle: left ? 'r-s' : 'l-s', targetHandle: left ? 'l-t' : 'r-t', type: 'org', data: d, focusable: false })
    }
    return out
  }, [visible, tree, data.liens, showLinks, chain, pos, mode])

  const goTo = useCallback((id: string, then?: () => void) => {
    rf.fitView({ nodes: [{ id }], duration: 380, maxZoom: 1, padding: 0.8 })
    window.setTimeout(() => {
      (document.querySelector(`.react-flow__node[data-id="${CSS.escape(id)}"] .org-card`) as HTMLElement | null)?.focus()
      then?.()
    }, 120)
  }, [rf])

  // replier / déplier : la disposition change, on recentre sur la carte cliquée sans toucher au zoom
  const anchor = useRef<string | null>(null)
  const toggleKeep = useCallback((id: string) => { anchor.current = id; onToggle(id) }, [onToggle])
  useEffect(() => {
    const id = anchor.current
    const p = id ? pos.get(id) : undefined
    anchor.current = null
    if (p) { const t = window.setTimeout(() => rf.setCenter(p.x + CARD_W / 2, p.y + CARD_H / 2, { zoom: rf.getZoom(), duration: 300 }), 30); return () => window.clearTimeout(t) }
  }, [pos, rf])

  const onKey = useCallback((id: string, e: KeyboardEvent) => {
    const v = tree.get(id)
    if (!v) return
    const siblings = (tree.get(v.parent ?? '')?.children ?? []).filter((c) => visible.has(c))
    const idx = siblings.indexOf(id)
    let next: string | undefined
    switch (e.key) {
      case 'ArrowDown': next = collapsed.has(id) ? undefined : v.children.find((c) => visible.has(c)); break
      case 'ArrowUp': next = v.parent ?? undefined; break
      case 'ArrowRight': next = siblings[idx + 1]; break
      case 'ArrowLeft': next = idx > 0 ? siblings[idx - 1] : undefined; break
      case 'Enter': if (v.kind === 'person' || v.kind === 'unit') onSelect(id); else if (v.kind === 'vacant') onSelect(unitNodeId(v.vacancy!.unite)); e.preventDefault(); return
      case ' ': if (v.children.length) toggleKeep(id); e.preventDefault(); return
      case 'Escape': onSelect(null); return
      default: return
    }
    e.preventDefault()
    if (next) goTo(next)
  }, [tree, visible, collapsed, onSelect, toggleKeep, goTo])

  const personNames = useMemo(() => new Map(data.noeuds.map((p) => [p.id, `${p.prenom} ${p.nom}`])), [data.noeuds])
  const personName = useCallback((id: string | null) => (id ? personNames.get(id) ?? null : null), [personNames])

  const ctx = useMemo<OrgCtx>(() => ({
    selectedId, chain, matches, collapsed, personName,
    hidden: (id) => descendantsCount(tree, id),
    canEdit, onToggle: toggleKeep, onSelect: (id) => { const v = tree.get(id); onSelect(v?.kind === 'vacant' ? unitNodeId(v.vacancy!.unite) : id) }, onHover: setHover, onKey, onMenu,
  }), [selectedId, chain, matches, collapsed, personName, tree, canEdit, toggleKeep, onSelect, onKey, onMenu])

  // fin d'un glisser depuis une poignée : la carte visée est celle qui se trouve sous le pointeur (poignée ou corps de carte)
  const onConnectEnd = useCallback((event: MouseEvent | TouchEvent, state: FinalConnectionState) => {
    const from = state.fromNode?.id
    const handle = state.fromHandle?.id
    if (!from || !handle) return
    const pt = 'changedTouches' in event ? event.changedTouches[0] : event
    const el = document.elementFromPoint(pt.clientX, pt.clientY)?.closest('.react-flow__node') as HTMLElement | null
    const to = state.toNode?.id ?? el?.dataset.id
    if (!to || to === from) return
    onLink(from, handle === 'dn' || handle === 't' ? handle : 'side', to)
  }, [onLink])

  // recentrage animé sur un résultat de recherche (après que les branches utiles ont été dépliées)
  useEffect(() => { if (focus) { const t = window.setTimeout(() => goTo(focus.id), 80); return () => window.clearTimeout(t) } }, [focus, goTo])
  // vue d'ensemble au premier affichage et sur demande (fitSignal) ; un simple changement de données (rattachement, création…) conserve le zoom et la position
  const fitted = useRef(false)
  useEffect(() => {
    if (fitted.current && fitSignal === lastSignal.current) return
    if (tree.size === 0) return
    fitted.current = true; lastSignal.current = fitSignal
    const t = window.setTimeout(() => rf.fitView({ duration: 420, padding: 0.22, maxZoom: 1 }), 60)
    return () => window.clearTimeout(t)
  }, [fitSignal, tree, rf])

  const minimapColor = useCallback((n: Node) => (n.id === ROOT_ID ? '#7c6cff' : n.id === GROUP_ID ? '#64748b' : n.type === 'unit' ? '#3fe0a5' : '#55a3ff'), [])

  return (
    <OrgContext.Provider value={ctx}>
      <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes}
        nodesDraggable={false} nodesConnectable={canEdit} connectionRadius={36} onConnectEnd={onConnectEnd} onEdgeClick={(e, edge) => onEdge(edge.data as EdgeData, e.clientX, e.clientY)} elementsSelectable={false} onlyRenderVisibleElements={visible.size > 150}
        minZoom={0.08} maxZoom={1.8} proOptions={{ hideAttribution: true }} onPaneClick={() => onSelect(null)}
        aria-label="Organigramme interactif">
        <Background variant={BackgroundVariant.Dots} gap={22} size={1.3} color="var(--o-grid)" />
        <MiniMap pannable zoomable nodeColor={minimapColor} nodeStrokeColor={minimapColor} nodeStrokeWidth={4} nodeBorderRadius={4} maskColor="rgba(8, 12, 24, .35)" style={{ width: 170, height: 105 }} ariaLabel="Mini-carte de l'organigramme" />
        <Controls showInteractive={false} position="bottom-left" aria-label="Contrôles de zoom" />
      </ReactFlow>
    </OrgContext.Provider>
  )
}

export function OrgChartCanvas(props: CanvasProps) {
  return <ReactFlowProvider><Inner {...props} /></ReactFlowProvider>
}

