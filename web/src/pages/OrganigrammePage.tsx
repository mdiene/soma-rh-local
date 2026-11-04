import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, ChevronsDownUp, ChevronsUpDown, Download, Image as ImageIcon, Landmark, List, Maximize2, Moon, Network, Plus, Search, Sun, UserCog, Users } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { dataApi, unwrap, type ApiClient } from '../lib/api'
import { useAuth } from '../lib/auth'
import { GROUP_ID, LINK_LABEL, ROOT_ID, STATUS_LABEL, ancestorsOf, buildStructureTree, buildTree, fmtDate, fullName, isUnitNode, unitNodeId, type LinkType, type OrgData, type OrgStatus } from '../lib/org'
import { OrgChartCanvas } from '../components/organigramme/OrgChartCanvas'
import { exportPng } from '../components/organigramme/exportPng'
import { DetailPanel, UnitPanel } from '../components/organigramme/DetailPanel'
import { OrgDialogs, type Dialog, type DoneOpts } from '../components/organigramme/OrgDialogs'
import type { EdgeData } from '../components/organigramme/orgContext'
import { OrgMenu, type MenuItem } from '../components/organigramme/OrgMenu'
import { OrgListView } from '../components/organigramme/OrgListView'
import { TeamsView } from '../components/organigramme/TeamsView'

/** Équipes et managers › Organigramme : hiérarchie directe + liens hors hiérarchie (pointillé, intérim, fonctionnel) et équipes. */

const db = dataApi as unknown as ApiClient
type View = 'graph' | 'teams' | 'list'
const today = () => new Date().toISOString().slice(0, 10)

// stockage du navigateur : jamais bloquant s'il est indisponible
const store = {
  get<T>(k: string, d: T): T { try { const v = window.localStorage.getItem(k); return v ? (JSON.parse(v) as T) : d } catch { return d } },
  set(k: string, v: unknown) { try { window.localStorage.setItem(k, JSON.stringify(v)) } catch { /* ignoré */ } },
}

export default function OrganigrammePage() {
  const { can } = useAuth()
  const canEdit = can('rh')
  const wrapRef = useRef<HTMLDivElement>(null)
  const [asOf, setAsOf] = useState(today())
  const [view, setView] = useState<View>('graph')
  const [theme, setTheme] = useState<'dark' | 'light'>(() => store.get('soma.org.theme', 'dark'))
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<'all' | OrgStatus>('all')
  const [showLinks, setShowLinks] = useState<Record<Exclude<LinkType, 'direct'>, boolean>>({ dotted: true, interim: true, functional: true })
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set(store.get<string[]>('soma.org.collapsed', [GROUP_ID])))
  const [focus, setFocus] = useState<{ id: string; n: number } | null>(null)
  const [fitSignal, setFitSignal] = useState(0)
  const [dialog, setDialog] = useState<Dialog | null>(null)
  const [menu, setMenu] = useState<{ id: string; anchor: DOMRect } | null>(null)
  const [createAnchor, setCreateAnchor] = useState<DOMRect | null>(null)
  const [mode, setMode] = useState<'managers' | 'structure'>('managers')
  const [showAnomalies, setShowAnomalies] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [edgeMenu, setEdgeMenu] = useState<{ items: MenuItem[]; anchor: DOMRect } | null>(null)

  // message de confirmation (ex. notification de rattachement) : disparaît seul
  useEffect(() => { if (!notice) return; const t = window.setTimeout(() => setNotice(null), 12000); return () => window.clearTimeout(t) }, [notice])
  const dialogDone = (message: string | null, opts?: DoneOpts) => {
    setDialog(null)
    if (message) setNotice(message)
    if (opts?.structure) { setMode('structure'); setFitSignal((n) => n + 1) }
  }

  const chart = useQuery({
    queryKey: ['org_chart', asOf],
    queryFn: async () => unwrap(await db.rpc('org_chart', { p_on: asOf })) as unknown as OrgData,
  })
  const data = chart.data
  const tree = useMemo(() => (data ? (mode === 'structure' ? buildStructureTree(data) : buildTree(data)) : null), [data, mode])

  useEffect(() => { store.set('soma.org.theme', theme) }, [theme])
  useEffect(() => { store.set('soma.org.collapsed', [...collapsed]) }, [collapsed])

  const persons = useMemo(() => data?.noeuds ?? [], [data])
  const byId = useMemo(() => new Map(persons.map((p) => [p.id, p])), [persons])
  const selected = selectedId ? byId.get(selectedId) ?? null : null
  const selectedUnit = selectedId && isUnitNode(selectedId) ? data?.unites.find((u) => unitNodeId(u.id) === selectedId) ?? null : null
  const nameOf = (id: string) => (byId.get(id) ? fullName(byId.get(id)!) : data?.unites.find((u) => unitNodeId(u.id) === id)?.nom ?? id)

  const matches = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('fr')
    if (!q && status === 'all') return null
    return new Set(persons.filter((p) =>
      (status === 'all' || p.statut === status) &&
      (!q || `${fullName(p)} ${p.poste} ${p.matricule} ${p.departement ?? ''}`.toLocaleLowerCase('fr').includes(q))).map((p) => p.id))
  }, [persons, query, status])
  const suggestions = query.trim() ? persons.filter((p) => matches?.has(p.id)).slice(0, 8) : []

  const toggle = useCallback((id: string) => setCollapsed((c) => { const n = new Set(c); if (n.has(id)) n.delete(id); else n.add(id); return n }), [])
  const reveal = useCallback((id: string) => {
    if (!tree) return
    setCollapsed((c) => { const n = new Set(c); for (const a of ancestorsOf(tree.nodes, id)) n.delete(a); return n })
  }, [tree])
  const pick = useCallback((id: string) => {
    if (isUnitNode(id)) setMode('structure')
    reveal(id); setSelectedId(id); setView('graph'); setQuery(''); setFocus({ id, n: Date.now() })
  }, [reveal])

  const collapseAll = () => tree && setCollapsed(new Set([...tree.nodes.values()].filter((v) => v.children.length && v.id !== ROOT_ID).map((v) => v.id)))
  const expandAll = () => { setCollapsed(new Set()); setFitSignal((n) => n + 1) }

  const managerName = useCallback((id: string) => {
    const l = data?.liens.find((x) => x.type === 'direct' && x.target === id)
    return l && byId.get(l.source) ? fullName(byId.get(l.source)!) : ''
  }, [data, byId])

  const log = (format: string, rows: number) => { void db.rpc('org_log_export', { p_format: format, p_rows: rows }) }
  const exportCsv = () => {
    if (!data) return
    const hasEmail = persons.some((p) => p.email)
    const head = ['Matricule', 'Nom', 'Prénom', 'Poste', 'Département', 'Statut', 'Manager direct', 'Subordonnés', ...(hasEmail ? ['E-mail'] : [])]
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const rows = persons.filter((p) => !matches || matches.has(p.id)).map((p) =>
      [p.matricule, p.nom, p.prenom, p.poste, p.departement ?? '', STATUS_LABEL[p.statut], managerName(p.id), p.subordonnes, ...(hasEmail ? [p.email ?? ''] : [])].map(esc).join(';'))
    const url = URL.createObjectURL(new Blob(['﻿' + [head.map(esc).join(';'), ...rows].join('\r\n')], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a'); a.href = url; a.download = `organigramme-${asOf}.csv`; a.click(); URL.revokeObjectURL(url)
    log('csv', rows.length)
  }
  const exportImage = async () => {
    if (!wrapRef.current) return
    setBusy('Préparation de l’image…'); setNotice(null)
    try { await exportPng(wrapRef.current, theme); log('png', persons.length) } catch { setNotice('L’export de l’image a échoué : réessayez en vue « Hiérarchie ».') } finally { setBusy(null) }
  }
  const fullscreen = () => { const el = wrapRef.current; if (!el) return; if (document.fullscreenElement) void document.exitFullscreen(); else void el.requestFullscreen?.() }

  const menuItems = (id: string): MenuItem[] => {
    if (!data) return []
    const sep: MenuItem = { label: '', onClick: () => undefined, separator: true }
    const open: MenuItem = { label: 'Ouvrir la fiche', onClick: () => setSelectedId(id) }
    if (id === ROOT_ID) {
      return canEdit ? [
        { label: 'Créer une direction', onClick: () => setDialog({ kind: 'unit', unitKind: 'direction' }) },
        { label: 'Créer un poste', onClick: () => setDialog({ kind: 'post' }) },
        { label: 'Créer une équipe', onClick: () => setDialog({ kind: 'team-new' }) },
      ] : []
    }
    if (isUnitNode(id)) {
      const u = data.unites.find((x) => unitNodeId(x.id) === id)
      if (!u) return []
      return canEdit ? [
        { label: 'Rattacher un salarié à cette unité', onClick: () => setDialog({ kind: 'unit-attach', unitId: u.id }) },
        { label: 'Prévoir un poste à pourvoir…', onClick: () => setDialog({ kind: 'vacancy', unitId: u.id }) },
        { label: 'Ajouter une sous-unité', onClick: () => setDialog({ kind: 'unit', parentId: u.id }) },
        { label: 'Modifier (nom, responsable…)', onClick: () => setDialog({ kind: 'unit', unit: u }) },
        sep, open, sep,
        { label: 'Supprimer l’unité', danger: true, onClick: () => setDialog({ kind: 'unit-delete', unit: u }) },
      ] : [open]
    }
    const person = byId.get(id)
    if (!person) return []
    const hasManager = data.liens.some((l) => l.type === 'direct' && l.target === id)
    return canEdit ? [
      { label: 'Rattacher un salarié sous cette personne', onClick: () => setDialog({ kind: 'attach', managerId: id }) },
      { label: 'Ajouter à une équipe…', onClick: () => setDialog({ kind: 'team-add', employeeId: id }) },
      { label: 'Affecter à une direction ou un secteur…', onClick: () => setDialog({ kind: 'employee-unit', employeeId: id }) },
      { label: 'Changer de poste…', onClick: () => setDialog({ kind: 'post', employeeId: id }) },
      { label: hasManager ? 'Changer de manager…' : 'Rattacher à un manager…', onClick: () => setDialog({ kind: 'manager', employeeId: id }) },
      { label: 'Ajouter un lien hors hiérarchie…', onClick: () => setDialog({ kind: 'relation', employeeId: id }) },
      sep, open,
      ...(hasManager ? [sep, { label: 'Détacher de son manager', danger: true, onClick: () => setDialog({ kind: 'detach', employeeId: id }) } as MenuItem] : []),
    ] : [open]
  }
  const unitOf = (nodeId: string) => data?.unites.find((x) => unitNodeId(x.id) === nodeId)

  /** Liaison tirée à la souris depuis une poignée vers une autre carte : ouvre la fenêtre correspondante, déjà remplie. */
  const onLink = (from: string, handle: 'dn' | 't' | 'side', to: string) => {
    if (!canEdit || !data) return
    const fromU = unitOf(from); const toU = unitOf(to)
    const fromP = byId.get(from); const toP = byId.get(to)
    setNotice(null)
    if (handle === 'side') {
      if (fromP && toP) setDialog({ kind: 'relation', employeeId: from, relatedId: to })
      else setNotice('Un lien hors hiérarchie relie deux salariés.')
      return
    }
    // « dn » : on tire depuis le bas de la carte du manager / de l'unité vers le salarié ; « t » : depuis le haut du salarié vers son manager / son unité
    const head = handle === 'dn' ? { u: fromU, p: fromP, id: from } : { u: toU, p: toP, id: to }
    const sub = handle === 'dn' ? { p: toP, id: to } : { p: fromP, id: from }
    if (!sub.p) { setNotice('Déposez le lien sur la carte d’un salarié.'); return }
    if (head.u) setDialog({ kind: 'unit-attach', unitId: head.u.id, employeeId: sub.id })
    else if (head.p) setDialog({ kind: 'manager', employeeId: sub.id, managerId: head.id })
    else setNotice('Choisissez un salarié ou une direction comme point d’attache.')
  }

  /** Clic sur une ligne : détacher, changer le rattachement, terminer un lien ou ouvrir une fiche. */
  const onEdge = (e: EdgeData, x: number, y: number) => {
    if (!data) return
    const sep: MenuItem = { label: '', onClick: () => undefined, separator: true }
    const items: MenuItem[] = []
    const srcP = e.source ? byId.get(e.source) : undefined; const tgtP = e.target ? byId.get(e.target) : undefined
    const srcU = e.source ? unitOf(e.source) : undefined; const tgtU = e.target ? unitOf(e.target) : undefined
    if (canEdit) {
      if (e.kind === 'tree' && tgtP && srcP) {
        items.push({ label: `Détacher ${fullName(tgtP)} de ${fullName(srcP)}`, danger: true, onClick: () => setDialog({ kind: 'detach', employeeId: tgtP.id }) },
          { label: `Changer le manager de ${fullName(tgtP)}…`, onClick: () => setDialog({ kind: 'manager', employeeId: tgtP.id }) })
      } else if (e.kind === 'tree' && tgtP && srcU) {
        items.push({ label: `Retirer ${fullName(tgtP)} de ${srcU.nom} ou changer d’unité…`, danger: true, onClick: () => setDialog({ kind: 'employee-unit', employeeId: tgtP.id }) })
      } else if (e.kind === 'tree' && tgtU) {
        items.push({ label: `Modifier ${tgtU.nom}…`, onClick: () => setDialog({ kind: 'unit', unit: tgtU }) })
      } else if (e.kind !== 'tree') {
        const link = data.liens.find((l) => l.id === e.linkId)
        if (link) items.push({ label: 'Terminer ce lien…', danger: true, onClick: () => setDialog({ kind: 'end', link }) })
      }
    }
    if (srcP) items.push({ label: `Ouvrir la fiche de ${fullName(srcP)}`, onClick: () => setSelectedId(srcP.id) })
    if (tgtP) items.push({ label: `Ouvrir la fiche de ${fullName(tgtP)}`, onClick: () => setSelectedId(tgtP.id) })
    if (srcU && !tgtU) items.push({ label: `Ouvrir la fiche de ${srcU.nom}`, onClick: () => setSelectedId(unitNodeId(srcU.id)) })
    if (items.length) { if (items.length > 2 && canEdit) items.splice(items.findIndex((i) => !i.danger && i.label.startsWith('Ouvrir')), 0, sep); setEdgeMenu({ items, anchor: new DOMRect(x, y, 0, 0) }) }
  }

  const createItems: MenuItem[] = [
    { label: 'Une direction', onClick: () => setDialog({ kind: 'unit', unitKind: 'direction' }) },
    { label: 'Un secteur', onClick: () => setDialog({ kind: 'unit', unitKind: 'secteur' }) },
    { label: 'Une section', onClick: () => setDialog({ kind: 'unit', unitKind: 'section' }) },
    { label: 'Un service', onClick: () => setDialog({ kind: 'unit', unitKind: 'service' }) },
    { label: '', onClick: () => undefined, separator: true },
    { label: 'Un poste', onClick: () => setDialog({ kind: 'post' }) },
    { label: 'Une équipe', onClick: () => setDialog({ kind: 'team-new' }) },
  ]

  const chain = selectedId && tree ? ancestorsOf(tree.nodes, selectedId).reverse() : []
  const anomalies = data?.anomalies ?? []
  const forbidden = chart.error instanceof Error && /Droits|permission/i.test(chart.error.message)

  return (
    <div ref={wrapRef} className="org-theme -mx-4 -mb-6 -mt-2 flex min-h-[calc(100vh-7rem)] flex-col sm:-mx-6" data-theme={theme}>
      <header className="flex flex-col gap-3 px-4 pb-3 pt-4 sm:px-6">
        <nav aria-label="Fil d'Ariane" className="flex flex-wrap items-center gap-1.5 text-xs" style={{ color: 'var(--o-muted)' }}>
          <Link to={canEdit ? '/equipes' : '/'} className="hover:underline">Équipes et managers</Link><span aria-hidden>›</span>
          <button type="button" className="hover:underline" onClick={() => { setSelectedId(null); setFitSignal((n) => n + 1) }}>Organigramme</button>
          {chain.filter((id) => id !== ROOT_ID && id !== GROUP_ID).map((id) => <span key={id} className="contents"><span aria-hidden>›</span><button type="button" className="hover:underline" onClick={() => pick(id)}>{nameOf(id)}</button></span>)}
          {(selected || selectedUnit) && <><span aria-hidden>›</span><strong style={{ color: 'var(--o-text)' }}>{selected ? fullName(selected) : selectedUnit!.nom}</strong></>}
        </nav>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="mr-2 text-xl font-semibold">Organigramme</h1>
          <div className="relative min-w-[220px] flex-1 sm:max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" aria-hidden style={{ color: 'var(--o-muted)' }} />
            <input className="org-input w-full" style={{ paddingLeft: 38 }} type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Rechercher un salarié, un poste…"
              aria-label="Rechercher un salarié ou un poste" aria-controls="org-suggestions" aria-expanded={suggestions.length > 0}
              onKeyDown={(e) => { if (e.key === 'Enter' && suggestions[0]) pick(suggestions[0].id); if (e.key === 'Escape') setQuery('') }} />
            {suggestions.length > 0 && (
              <ul id="org-suggestions" role="listbox" className="org-glass absolute z-30 mt-1 w-full overflow-hidden rounded-xl">
                {suggestions.map((p) => (
                  <li key={p.id} role="option" aria-selected="false"><button type="button" className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-[var(--o-card-2)]" onClick={() => pick(p.id)}>
                    <span className="truncate font-medium">{fullName(p)}</span><span className="truncate text-xs" style={{ color: 'var(--o-muted)' }}>{p.poste}</span></button></li>
                ))}
              </ul>
            )}
          </div>
          <label className="flex items-center gap-2 text-xs" style={{ color: 'var(--o-muted)' }}>Organigramme au
            <input className="org-input" type="date" value={asOf} onChange={(e) => { if (e.target.value) { setAsOf(e.target.value); setFitSignal((n) => n + 1) } }} aria-label="Date d'effet de l'organigramme" />
          </label>
          <select className="org-input" value={status} onChange={(e) => setStatus(e.target.value as typeof status)} aria-label="Filtrer par statut">
            <option value="all">Tous les statuts</option>{(Object.keys(STATUS_LABEL) as OrgStatus[]).map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </select>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {canEdit && <button type="button" className="org-btn" data-primary="true" aria-haspopup="menu" onClick={(e) => setCreateAnchor(e.currentTarget.getBoundingClientRect())}><Plus className="h-4 w-4" aria-hidden />Créer</button>}
            <div className="flex gap-1" role="group" aria-label="Type de vue">
              <button type="button" className="org-btn" aria-pressed={view === 'graph'} onClick={() => setView('graph')}><Network className="h-4 w-4" aria-hidden />Hiérarchie</button>
              <button type="button" className="org-btn" aria-pressed={view === 'teams'} onClick={() => setView('teams')}><Users className="h-4 w-4" aria-hidden />Équipes</button>
              <button type="button" className="org-btn" aria-pressed={view === 'list'} onClick={() => setView('list')}><List className="h-4 w-4" aria-hidden />Liste</button>
            </div>
            <button type="button" className="org-btn" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} aria-label={theme === 'dark' ? 'Passer au thème clair' : 'Passer au thème sombre'}>{theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}</button>
            <button type="button" className="org-btn" onClick={fullscreen} aria-label="Plein écran"><Maximize2 className="h-4 w-4" /></button>
            <button type="button" className="org-btn" onClick={exportCsv} disabled={!data}><Download className="h-4 w-4" aria-hidden />CSV</button>
            <button type="button" className="org-btn" onClick={exportImage} disabled={!data || view !== 'graph' || !!busy}><ImageIcon className="h-4 w-4" aria-hidden />PNG</button>
          </div>
        </div>
        {view === 'graph' && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs" style={{ color: 'var(--o-muted)' }}>
            <div className="flex gap-1" role="group" aria-label="Organisation affichée">
              <button type="button" className="org-btn" style={{ minHeight: 28, fontSize: 12 }} aria-pressed={mode === 'managers'} onClick={() => { setMode('managers'); setFitSignal((n) => n + 1) }}><UserCog className="h-3.5 w-3.5" aria-hidden />Managers</button>
              <button type="button" className="org-btn" style={{ minHeight: 28, fontSize: 12 }} aria-pressed={mode === 'structure'} onClick={() => { setMode('structure'); setFitSignal((n) => n + 1) }}><Landmark className="h-3.5 w-3.5" aria-hidden />Directions</button>
            </div>
            <span className="inline-flex items-center gap-1.5"><svg width="26" height="8" aria-hidden><line x1="0" y1="4" x2="26" y2="4" stroke="var(--o-accent)" strokeWidth="2" /></svg>Hiérarchie directe</span>
            {(Object.keys(LINK_LABEL) as (keyof typeof LINK_LABEL)[]).map((t) => (
              <button key={t} type="button" className="org-btn" style={{ minHeight: 28, fontSize: 12 }} aria-pressed={showLinks[t]} onClick={() => setShowLinks((s) => ({ ...s, [t]: !s[t] }))}>
                <svg width="26" height="8" aria-hidden><line x1="0" y1="4" x2="26" y2="4" strokeWidth="2.2" strokeLinecap="round"
                  stroke={t === 'dotted' ? 'var(--o-violet)' : t === 'interim' ? 'var(--o-amber)' : 'var(--o-green)'} strokeDasharray={t === 'dotted' ? '6 4' : t === 'interim' ? '1 5' : '10 3 2 3'} /></svg>{LINK_LABEL[t]}
              </button>
            ))}
            <button type="button" className="org-btn" style={{ minHeight: 28, fontSize: 12 }} onClick={expandAll}><ChevronsUpDown className="h-3.5 w-3.5" aria-hidden />Tout développer</button>
            <button type="button" className="org-btn" style={{ minHeight: 28, fontSize: 12 }} onClick={collapseAll}><ChevronsDownUp className="h-3.5 w-3.5" aria-hidden />Tout réduire</button>
            {anomalies.length > 0 && (
              <button type="button" className="org-btn" style={{ minHeight: 28, fontSize: 12, color: 'var(--o-amber)' }} aria-expanded={showAnomalies} onClick={() => setShowAnomalies((v) => !v)}>
                <AlertTriangle className="h-3.5 w-3.5" aria-hidden />{anomalies.length} anomalie(s)</button>
            )}
          </div>
        )}
        {showAnomalies && anomalies.length > 0 && (
          <ul className="org-glass max-h-40 space-y-1 overflow-auto rounded-xl p-3 text-xs" role="status">
            {anomalies.slice(0, 60).map((a, i) => (
              <li key={i}><button type="button" className="text-left hover:underline" onClick={() => pick(a.employe)}><strong>{byId.get(a.employe) ? fullName(byId.get(a.employe)!) : '—'}</strong> · {a.message}</button></li>
            ))}
          </ul>
        )}
        {(notice || busy) && (
          <p role="status" className="org-glass flex items-start justify-between gap-3 rounded-xl px-3 py-2 text-sm" style={{ color: 'var(--o-text)', borderColor: 'var(--o-green)' }}>
            <span>{busy ?? notice}</span>
            {notice && !busy && <button type="button" className="org-btn" style={{ minHeight: 24 }} onClick={() => setNotice(null)} aria-label="Fermer le message">×</button>}
          </p>
        )}
        {canEdit && view === 'graph' && (
          <p className="org-hint">Astuce : survolez une carte puis tirez la pastille <strong>du bas</strong> vers un salarié pour le rattacher (la pastille <strong>du haut</strong> sert à choisir son manager ou sa direction, celles des <strong>côtés</strong> à créer un lien hors hiérarchie). Cliquez sur une <strong>ligne</strong> pour détacher ou changer un rattachement, sur une <strong>carte</strong> pour ouvrir sa fiche.</p>
        )}
      </header>

      <main className="relative min-h-[520px] flex-1" aria-busy={chart.isLoading}>
        {chart.isLoading ? (
          <div className="grid h-full place-items-center p-6" aria-label="Chargement de l'organigramme">
            <div className="grid w-full max-w-3xl grid-cols-3 gap-4">{Array.from({ length: 6 }, (_, i) => <div key={i} className="org-skeleton h-[88px]" />)}</div>
          </div>
        ) : chart.error ? (
          <div className="grid h-full place-items-center p-6"><div className="org-glass max-w-md rounded-2xl p-6 text-center" role="alert">
            <p className="font-semibold">{forbidden ? 'Accès à l’organigramme refusé' : 'Impossible de charger l’organigramme'}</p>
            <p className="mt-1 text-sm" style={{ color: 'var(--o-muted)' }}>{(chart.error as Error).message}</p>
            {!forbidden && <button type="button" className="org-btn mt-4" data-primary="true" onClick={() => void chart.refetch()}>Réessayer</button>}
          </div></div>
        ) : !data || !tree || persons.length === 0 ? (
          <div className="grid h-full place-items-center p-6"><div className="org-glass max-w-md rounded-2xl p-6 text-center">
            <Network className="mx-auto mb-2 h-8 w-8" aria-hidden style={{ color: 'var(--o-muted)' }} />
            <p className="font-semibold">Aucun salarié à cette date</p>
            <p className="mt-1 text-sm" style={{ color: 'var(--o-muted)' }}>{canEdit ? 'Rattachez les salariés à un manager depuis « Équipes et managers » ou choisissez une autre date.' : 'Choisissez une autre date.'}</p>
            {canEdit && <Link to="/equipes" className="org-btn mt-4 inline-flex" data-primary="true">Rattacher des salariés</Link>}
          </div></div>
        ) : (
          <>
            <div className="absolute inset-0">
              {view === 'graph' && <OrgChartCanvas data={data} tree={tree.nodes} collapsed={collapsed} onToggle={toggle} selectedId={selectedId} onSelect={setSelectedId}
                matches={matches} showLinks={showLinks} focus={focus} fitSignal={fitSignal}
                onMenu={(id, anchor) => setMenu({ id, anchor })} mode={mode} canEdit={canEdit} onLink={onLink} onEdge={onEdge} />}
              {view === 'teams' && <TeamsView data={data} canEdit={canEdit} onSelect={pick} />}
              {view === 'list' && <OrgListView tree={tree.nodes} data={data} matches={matches} onSelect={pick} />}
            </div>
            {selected && view !== 'teams' && (
              <DetailPanel person={selected} data={data} canEdit={canEdit} onClose={() => setSelectedId(null)} onSelect={pick} onAction={setDialog} />
            )}
            {selectedUnit && view !== 'teams' && (
              <UnitPanel unit={selectedUnit} data={data} canEdit={canEdit} onClose={() => setSelectedId(null)} onSelect={pick} onAction={setDialog} />
            )}
            <p className="pointer-events-none absolute bottom-2 right-3 hidden text-[11px] md:block" style={{ color: 'var(--o-muted)' }}>Organigramme au {fmtDate(data.date)} · {persons.length} salarié(s)</p>
          </>
        )}
      </main>
      {dialog && data && <OrgDialogs dialog={dialog} data={data} asOf={asOf} onClose={() => setDialog(null)} onDone={dialogDone} />}
      {edgeMenu && <OrgMenu anchor={edgeMenu.anchor} title="Lien" items={edgeMenu.items} onClose={() => setEdgeMenu(null)} />}
      {menu && <OrgMenu anchor={menu.anchor} title="Actions" items={menuItems(menu.id)} onClose={() => setMenu(null)} />}
      {createAnchor && <OrgMenu anchor={createAnchor} title="Créer" items={createItems} onClose={() => setCreateAnchor(null)} />}
    </div>
  )
}
