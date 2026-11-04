import { memo } from 'react'
import { BaseEdge, EdgeLabelRenderer, Handle, Position, getBezierPath, getSmoothStepPath, type EdgeProps, type Node, type NodeProps } from '@xyflow/react'
import { Building2, CheckCircle2, UserPlus, ChevronDown, ChevronRight, Cog, Landmark, Layers, LayoutGrid, Plane, Plus, Repeat, UserCog, Users } from 'lucide-react'
import { STATUS_LABEL, UNIT_LABEL, fullName, initials, isManager, type UnitKind } from '../../lib/org'
import { useOrg, type CardData, type EdgeData } from './orgContext'

/** Cartes de l'organigramme (salarié, société, groupe « non rattachés ») et arêtes (direct, pointillé, intérim, fonctionnel). */

type CardNode = Node<CardData, 'person' | 'root' | 'group' | 'unit' | 'vacant'>

const hue = (s: string) => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) % 360; return h }

/** Poignées : « t » (haut) et « dn » (bas, à droite) servent à tirer un lien hiérarchique ; les poignées latérales, un lien hors hiérarchie.
 *  « b », « l-t » et « r-t » ne servent qu'à ancrer les lignes existantes. */
function Handles({ side = true }: { side?: boolean }) {
  const { canEdit } = useOrg()
  const link = (kind: 'hier' | 'side') => `org-handle org-handle-link${canEdit ? '' : ' org-handle-off'}`.concat(kind === 'side' ? ' org-handle-side' : '')
  return (
    <>
      <Handle id="t" type="target" position={Position.Top} isConnectable={canEdit} className={link('hier')} title="Tirer vers le haut pour rattacher à un manager ou une direction" />
      <Handle id="b" type="source" position={Position.Bottom} isConnectable={false} className="org-handle" />
      <Handle id="dn" type="source" position={Position.Bottom} isConnectable={canEdit} style={{ left: '82%' }} className={link('hier')} title="Tirer vers un salarié pour le rattacher sous cette carte" />
      {side && <Handle id="l-s" type="source" position={Position.Left} isConnectable={canEdit} className={link('side')} title="Tirer vers un salarié pour créer un lien hors hiérarchie" />}
      <Handle id="l-t" type="target" position={Position.Left} isConnectable={false} className="org-handle" />
      {side && <Handle id="r-s" type="source" position={Position.Right} isConnectable={canEdit} className={link('side')} title="Tirer vers un salarié pour créer un lien hors hiérarchie" />}
      <Handle id="r-t" type="target" position={Position.Right} isConnectable={false} className="org-handle" />
    </>
  )
}

function PlusButton({ id, label }: { id: string; label: string }) {
  const o = useOrg()
  return (
    <button type="button" className="org-plus nodrag nopan" aria-haspopup="menu" aria-label={label}
      onClick={(e) => { e.stopPropagation(); o.onMenu(id, e.currentTarget.getBoundingClientRect()) }}>
      <Plus className="h-3.5 w-3.5" aria-hidden />
    </button>
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
  const label = `${fullName(p)}${p.poste ? `, ${p.poste}` : ''}${p.departement ? `, ${p.departement}` : ''}, ${STATUS_LABEL[p.statut]}, ${p.subordonnes} subordonné${p.subordonnes > 1 ? 's' : ''}`
  return (
    <div className="org-card" data-status={p.statut} data-selected={o.selectedId === id} data-dim={dim ? 'true' : 'false'}
      role="button" tabIndex={0} aria-label={label} aria-pressed={o.selectedId === id}
      onClick={() => o.onSelect(id)} onMouseEnter={() => o.onHover(id)} onMouseLeave={() => o.onHover(null)}
      onKeyDown={(e) => o.onKey(id, e)}>
      <Handles />
      <span className="org-avatar" style={{ background: `linear-gradient(135deg, hsl(${hue(p.id)} 62% 46%), hsl(${(hue(p.id) + 48) % 360} 62% 36%))` }} aria-hidden>{initials(p)}</span>
      <div className="min-w-0 flex-1">
        <p className="org-name truncate">{fullName(p)}</p>
        <p className="org-role truncate">{[p.poste, p.departement].filter(Boolean).join(' · ')}</p>
        <div className="mt-1 flex flex-wrap items-center gap-1">
          <span className="org-chip" data-tone={p.statut}><Icon className="h-3 w-3" aria-hidden />{STATUS_LABEL[p.statut]}</span>
          {isManager(p) && <span className="org-chip" data-tone="manager" title={p.responsable_de.length ? `Responsable de : ${p.responsable_de.join(', ')}` : 'Manager direct'}><UserCog className="h-3 w-3" aria-hidden />Manager</span>}
          {p.equipes > 0 && <span className="org-chip" data-tone="team"><Users className="h-3 w-3" aria-hidden />{p.equipes}</span>}
        </div>
      </div>
      <PlusButton id={id} label={`Actions pour ${fullName(p)}`} />
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
      <PlusButton id={id} label="Créer une direction, un poste ou une équipe" />
      <Toggle id={id} count={data.view.children.length} />
    </div>
  )
})

export const GroupNode = memo(function GroupNode({ data, id }: NodeProps<CardNode>) {
  const o = useOrg()
  return (
    <div className="org-card org-group-card" data-dim={o.matches ? 'true' : 'false'} role="group" aria-label={`${data.view.label}, ${data.view.children.length} salariés`} tabIndex={0} onKeyDown={(e) => o.onKey(id, e)}>
      <Handles />
      <span className="org-avatar org-avatar-group" aria-hidden><Users className="h-5 w-5" /></span>
      <div className="min-w-0 flex-1"><p className="org-name">{data.view.label}</p><p className="org-role">{data.view.children.length} {data.view.sub ?? 'salarié(s)'}</p></div>
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

/** Poste ouvert : carte en pointillé sous son unité ; un clic ouvre la fiche de l'unité où l'on peut le pourvoir. */
export const VacantNode = memo(function VacantNode({ data, id }: NodeProps<CardNode>) {
  const o = useOrg()
  const v = data.view.vacancy!
  return (
    <div className="org-card org-vacant-card" data-selected={o.selectedId === id} data-dim={o.matches ? 'true' : 'false'}
      role="button" tabIndex={0} aria-label={`Poste ouvert : ${v.poste}, ${v.vacants} à pourvoir sur ${v.prevus} prévu${v.prevus > 1 ? 's' : ''}`}
      onClick={() => o.onSelect(id)} onKeyDown={(e) => o.onKey(id, e)}>
      <Handle id="t" type="target" position={Position.Top} isConnectable={false} className="org-handle" />
      <span className="org-avatar org-avatar-vacant" aria-hidden><UserPlus className="h-5 w-5" /></span>
      <div className="min-w-0 flex-1">
        <p className="org-name truncate">{v.poste}</p>
        <p className="org-role truncate">Poste ouvert · {v.vacants} à pourvoir</p>
        <p className="org-role truncate">{v.pourvus} pourvu{v.pourvus > 1 ? 's' : ''} sur {v.prevus} prévu{v.prevus > 1 ? 's' : ''}</p>
      </div>
    </div>
  )
})

const UNIT_ICON: Record<UnitKind, typeof Landmark> = { direction: Landmark, secteur: Layers, section: LayoutGrid, service: Cog }

/** Direction, secteur, section ou service : porte les salariés qui y sont rattachés. */
export const UnitNode = memo(function UnitNode({ data, id }: NodeProps<CardNode>) {
  const o = useOrg()
  const u = data.view.unit!
  const Icon = UNIT_ICON[u.type]
  const dim = (o.chain && !o.chain.has(id)) || o.matches
  return (
    <div className="org-card org-unit-card" data-unit={u.type} data-selected={o.selectedId === id} data-dim={dim ? 'true' : 'false'}
      role="button" tabIndex={0} aria-label={`${UNIT_LABEL[u.type]} ${u.nom}, ${u.membres} salarié(s)`} aria-pressed={o.selectedId === id}
      onClick={() => o.onSelect(id)} onMouseEnter={() => o.onHover(id)} onMouseLeave={() => o.onHover(null)} onKeyDown={(e) => o.onKey(id, e)}>
      <Handles />
      <span className="org-avatar org-avatar-unit" data-unit={u.type} aria-hidden><Icon className="h-5 w-5" /></span>
      <div className="min-w-0 flex-1">
        <p className="org-name truncate">{u.nom}</p>
        <p className="org-role truncate">{UNIT_LABEL[u.type]} · {u.membres} salarié(s)</p>
        <p className="org-role truncate" style={{ fontWeight: 600 }}>Responsable : {o.personName(u.responsable) ?? 'non désigné'}</p>
        {data.view.sub && <p className="org-role truncate" style={{ color: 'var(--o-amber)', fontWeight: 600 }}>{data.view.sub}</p>}
      </div>
      <PlusButton id={id} label={`Actions pour ${u.nom}`} />
      <Toggle id={id} count={data.view.children.length} />
    </div>
  )
})
