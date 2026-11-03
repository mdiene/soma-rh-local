import { memo } from 'react'
import { BaseEdge, EdgeLabelRenderer, Handle, Position, getBezierPath, getSmoothStepPath, type EdgeProps, type Node, type NodeProps } from '@xyflow/react'
import { Building2, CheckCircle2, ChevronDown, ChevronRight, Plane, Repeat, Users } from 'lucide-react'
import { STATUS_LABEL, fullName, initials } from '../../lib/org'
import { useOrg, type CardData, type EdgeData } from './orgContext'

/** Cartes de l'organigramme (salarié, société, groupe « non rattachés ») et arêtes (direct, pointillé, intérim, fonctionnel). */

type CardNode = Node<CardData, 'person' | 'root' | 'group'>

const hue = (s: string) => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) % 360; return h }

function Handles() {
  return (
    <>
      <Handle id="t" type="target" position={Position.Top} className="org-handle" />
      <Handle id="b" type="source" position={Position.Bottom} className="org-handle" />
      <Handle id="l-s" type="source" position={Position.Left} className="org-handle org-handle-side" />
      <Handle id="l-t" type="target" position={Position.Left} className="org-handle org-handle-side" />
      <Handle id="r-s" type="source" position={Position.Right} className="org-handle org-handle-side" />
      <Handle id="r-t" type="target" position={Position.Right} className="org-handle org-handle-side" />
    </>
  )
}

function Toggle({ id, count }: { id: string; count: number }) {
  const o = useOrg()
  const closed = o.collapsed.has(id)
  if (count === 0) return null
  return (
    <button type="button" className="org-toggle nodrag nopan" aria-expanded={!closed}
      aria-label={closed ? `Développer (${o.hidden(id)} masqués)` : 'Réduire'}
      onClick={(e) => { e.stopPropagation(); o.onToggle(id) }}>
      {closed ? <><ChevronRight className="h-3 w-3" aria-hidden />+{o.hidden(id)}</> : <ChevronDown className="h-3 w-3" aria-hidden />}
    </button>
  )
}

const STATUS_ICON = { actif: CheckCircle2, en_conge: Plane, interim: Repeat } as const

export const PersonNode = memo(function PersonNode({ data, id }: NodeProps<CardNode>) {
  const o = useOrg()
  const p = data.view.person!
  const dim = (o.chain && !o.chain.has(id)) || (o.matches && !o.matches.has(id))
  const Icon = STATUS_ICON[p.statut]
  const label = `${fullName(p)}, ${p.poste}${p.departement ? `, ${p.departement}` : ''}, ${STATUS_LABEL[p.statut]}, ${p.subordonnes} subordonné${p.subordonnes > 1 ? 's' : ''}`
  return (
    <div className="org-card" data-status={p.statut} data-selected={o.selectedId === id} data-dim={dim ? 'true' : 'false'}
      role="button" tabIndex={0} aria-label={label} aria-pressed={o.selectedId === id}
      onClick={() => o.onSelect(id)} onMouseEnter={() => o.onHover(id)} onMouseLeave={() => o.onHover(null)}
      onKeyDown={(e) => o.onKey(id, e)}>
      <Handles />
      <span className="org-avatar" style={{ background: `linear-gradient(135deg, hsl(${hue(p.id)} 62% 46%), hsl(${(hue(p.id) + 48) % 360} 62% 36%))` }} aria-hidden>{initials(p)}</span>
      <div className="min-w-0 flex-1">
        <p className="org-name truncate">{fullName(p)}</p>
        <p className="org-role truncate">{p.poste}</p>
        <div className="mt-1 flex flex-wrap items-center gap-1">
          <span className="org-chip" data-tone={p.statut}><Icon className="h-3 w-3" aria-hidden />{STATUS_LABEL[p.statut]}</span>
          {p.equipes > 0 && <span className="org-chip" data-tone="team"><Users className="h-3 w-3" aria-hidden />{p.equipes}</span>}
        </div>
      </div>
      <Toggle id={id} count={data.view.children.length} />
    </div>
  )
})

export const RootNode = memo(function RootNode({ data, id }: NodeProps<CardNode>) {
  const o = useOrg()
  const dim = (o.chain && !o.chain.has(id)) || o.matches
  return (
    <div className="org-card org-root-card" data-dim={dim ? 'true' : 'false'} role="group" aria-label={`${data.view.label}, ${data.view.children.length} branches`} tabIndex={0} onKeyDown={(e) => o.onKey(id, e)}>
      <Handles />
      <span className="org-avatar org-avatar-root" aria-hidden><Building2 className="h-5 w-5" /></span>
      <div className="min-w-0 flex-1"><p className="org-name">{data.view.label}</p><p className="org-role">Société Minière Africaine</p></div>
      <Toggle id={id} count={data.view.children.length} />
    </div>
  )
})

export const GroupNode = memo(function GroupNode({ data, id }: NodeProps<CardNode>) {
  const o = useOrg()
  return (
    <div className="org-card org-group-card" data-dim={o.matches ? 'true' : 'false'} role="group" aria-label={`${data.view.label}, ${data.view.children.length} salariés sans manager direct`} tabIndex={0} onKeyDown={(e) => o.onKey(id, e)}>
      <Handles />
      <span className="org-avatar org-avatar-group" aria-hidden><Users className="h-5 w-5" /></span>
      <div className="min-w-0 flex-1"><p className="org-name">{data.view.label}</p><p className="org-role">{data.view.children.length} salarié(s) sans manager direct</p></div>
      <Toggle id={id} count={data.view.children.length} />
    </div>
  )
})


export const OrgEdge = memo(function OrgEdge(props: EdgeProps) {
  const d = (props.data ?? { kind: 'tree' }) as EdgeData
  const { sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition } = props
  const [path, lx, ly] = d.kind === 'tree'
    ? getSmoothStepPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, borderRadius: 16 })
    : getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, curvature: 0.35 })
  return (
    <>
      <BaseEdge id={props.id} path={path} className="org-edge" data-kind={d.kind} data-hot={d.hot ? 'true' : 'false'} data-dim={d.dim ? 'true' : 'false'} />
      {d.label && (
        <EdgeLabelRenderer>
          <span className="org-edge-label nodrag nopan" data-kind={d.kind} data-dim={d.dim ? 'true' : 'false'}
            style={{ transform: `translate(-50%, -50%) translate(${lx}px, ${ly}px)` }}>{d.label}</span>
        </EdgeLabelRenderer>
      )}
    </>
  )
})
