import { useCallback, useEffect, useMemo, useState, type KeyboardEvent } from 'react'
import { Background, BackgroundVariant, Controls, MiniMap, ReactFlow, ReactFlowProvider, useReactFlow, type Edge, type Node } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import './organigramme.css'
import { GROUP_ID, LINK_LABEL, ROOT_ID, chainOf, descendantsCount, layout, visibleIds, type LinkType, type OrgData, type ViewNode } from '../../lib/org'
import { GroupNode, OrgEdge, PersonNode, RootNode } from './OrgNodes'
import { OrgContext, type CardData, type EdgeData, type OrgCtx } from './orgContext'

const nodeTypes = { person: PersonNode, root: RootNode, group: GroupNode }
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
}

function Inner({ data, tree, collapsed, onToggle, selectedId, onSelect, matches, showLinks, focus, fitSignal }: CanvasProps) {
  const rf = useReactFlow()
  const [hover, setHover] = useState<string | null>(null)
  const visible = useMemo(() => visibleIds(tree, collapsed), [tree, collapsed])
  const pos = useMemo(() => layout(tree, visible), [tree, visible])
  const chain = useMemo(() => (hover ? chainOf(tree, hover) : null), [tree, hover])

  const nodes = useMemo<Node[]>(() => [...visible].map((id) => {
    const view = tree.get(id)!
    return { id, type: view.kind, position: pos.get(id)!, data: { view } as CardData, draggable: false, selectable: false, focusable: true }
  }), [visible, tree, pos])

  const edges = useMemo<Edge[]>(() => {
    const out: Edge[] = []
    for (const id of visible) {
      const parent = tree.get(id)?.parent
      if (!parent || !visible.has(parent)) continue
      const on = !!chain && chain.has(id) && chain.has(parent)
      const d: EdgeData = { kind: 'tree', hot: on, dim: !!chain && !on }
      out.push({ id: `t-${parent}-${id}`, source: parent, target: id, sourceHandle: 'b', targetHandle: 't', type: 'org', data: d, focusable: false })
    }
    for (const l of data.liens) {
      if (l.type === 'direct' || !showLinks[l.type]) continue
      if (!visible.has(l.source) || !visible.has(l.target)) continue
      const left = (pos.get(l.source)?.x ?? 0) <= (pos.get(l.target)?.x ?? 0)
      const label = l.type === 'dotted' && l.quote_part ? `${LINK_LABEL.dotted} · ${l.quote_part} %` : LINK_LABEL[l.type]
      const d: EdgeData = { kind: l.type, label, dim: !!chain && !(chain.has(l.source) && chain.has(l.target)) }
      out.push({ id: `x-${l.id}`, source: l.source, target: l.target, sourceHandle: left ? 'r-s' : 'l-s', targetHandle: left ? 'l-t' : 'r-t', type: 'org', data: d, focusable: false })
    }
    return out
  }, [visible, tree, data.liens, showLinks, chain, pos])

  const goTo = useCallback((id: string, then?: () => void) => {
    rf.fitView({ nodes: [{ id }], duration: 380, maxZoom: 1, padding: 0.8 })
    window.setTimeout(() => {
      (document.querySelector(`.react-flow__node[data-id="${CSS.escape(id)}"] .org-card`) as HTMLElement | null)?.focus()
      then?.()
    }, 120)
  }, [rf])

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
      case 'Enter': if (v.kind === 'person') onSelect(id); e.preventDefault(); return
      case ' ': if (v.children.length) onToggle(id); e.preventDefault(); return
      case 'Escape': onSelect(null); return
      default: return
    }
    e.preventDefault()
    if (next) goTo(next)
  }, [tree, visible, collapsed, onSelect, onToggle, goTo])

  const ctx = useMemo<OrgCtx>(() => ({
    selectedId, chain, matches, collapsed,
    hidden: (id) => descendantsCount(tree, id),
    onToggle, onSelect: (id) => onSelect(id), onHover: setHover, onKey,
  }), [selectedId, chain, matches, collapsed, tree, onToggle, onSelect, onKey])

  // recentrage animé sur un résultat de recherche (après que les branches utiles ont été dépliées)
  useEffect(() => { if (focus) { const t = window.setTimeout(() => goTo(focus.id), 80); return () => window.clearTimeout(t) } }, [focus, goTo])
  // vue d'ensemble au chargement, à chaque changement de date et sur demande
  useEffect(() => { const t = window.setTimeout(() => rf.fitView({ duration: 420, padding: 0.18, maxZoom: 1 }), 60); return () => window.clearTimeout(t) }, [fitSignal, tree, rf])

  const minimapColor = useCallback((n: Node) => (n.id === ROOT_ID ? '#7c6cff' : n.id === GROUP_ID ? '#64748b' : '#55a3ff'), [])

  return (
    <OrgContext.Provider value={ctx}>
      <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes}
        nodesDraggable={false} nodesConnectable={false} elementsSelectable={false} onlyRenderVisibleElements
        minZoom={0.08} maxZoom={1.8} proOptions={{ hideAttribution: true }} onPaneClick={() => onSelect(null)}
        aria-label="Organigramme interactif">
        <Background variant={BackgroundVariant.Dots} gap={22} size={1.3} color="var(--o-grid)" />
        <MiniMap pannable zoomable nodeColor={minimapColor} maskColor="rgba(8, 12, 24, .55)" ariaLabel="Mini-carte de l'organigramme" />
        <Controls showInteractive={false} position="bottom-left" aria-label="Contrôles de zoom" />
      </ReactFlow>
    </OrgContext.Provider>
  )
}

export function OrgChartCanvas(props: CanvasProps) {
  return <ReactFlowProvider><Inner {...props} /></ReactFlowProvider>
}

