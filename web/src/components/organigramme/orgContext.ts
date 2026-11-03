import { createContext, useContext, type KeyboardEvent } from 'react'
import type { ViewNode } from '../../lib/org'

/** État partagé entre le canevas et les cartes (survol, sélection, repli) : évite de reconstruire les nœuds à chaque survol. */
export type OrgCtx = {
  selectedId: string | null
  chain: Set<string> | null          // chaîne hiérarchique survolée : le reste est estompé
  matches: Set<string> | null        // résultat de recherche / filtre : le reste est estompé
  collapsed: Set<string>
  hidden: (id: string) => number     // nombre de salariés masqués sous un nœud replié
  onToggle: (id: string) => void
  onSelect: (id: string) => void
  onHover: (id: string | null) => void
  onKey: (id: string, e: KeyboardEvent) => void
}
export const OrgContext = createContext<OrgCtx | null>(null)
export const useOrg = () => useContext(OrgContext)!

export type CardData = { view: ViewNode; [key: string]: unknown }
export type EdgeData = { kind: 'tree' | 'dotted' | 'interim' | 'functional'; label?: string; hot?: boolean; dim?: boolean; [key: string]: unknown }
