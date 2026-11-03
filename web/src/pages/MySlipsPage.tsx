import { useQuery } from '@tanstack/react-query'
import clsx from 'clsx'
import { ChevronDown, ChevronLeft, ChevronRight, Download, Printer, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { dataApi, unwrap } from '../lib/api'
import { useAuth } from '../lib/auth'
import { fcfa, monthLabel } from '../lib/format'
import { Button, Empty, ErrorNote, PageHeader, Spinner } from '../components/ui'

/**
 * Bulletins validés : un salarié ne voit que les siens (RLS) ; les rôles RH et paie
 * voient tous les salariés. Filtres salarié / matricule / période, regroupement par
 * salarié (pagination par groupes, jamais coupés), tri, export CSV et impression groupée.
 */

type Slip = {
  id: string; period_start: string; employee_id: string; employee_number: string | null; employee_name: string | null
  designation: string | null; gross_pay: number; net_pay: number
  employee: { first_name: string; last_name: string } | null
}
type Sort = 'salarie' | 'periode-desc' | 'periode-asc'

const PAGE_GROUPS = 10
const PAGE_ROWS = 25

/** « NOM Prénom » depuis la fiche, sinon l'instantané figé sur le bulletin. */
const fullName = (s: Slip) => s.employee ? `${s.employee.last_name.toUpperCase()} ${s.employee.first_name}` : (s.employee_name ?? '')
const ident = (s: Slip) => `${s.employee_number ?? ''} — ${fullName(s)}`

export default function MySlipsPage() {
  const { can } = useAuth()
  const navigate = useNavigate()
  const staff = can('rh') || can('paie')
  const [query, setQuery] = useState('')
  const [employee, setEmployee] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  // regroupement par salarié : utile à la gestion ; un salarié ne voit que ses bulletins, en liste simple
  const [groupedPref, setGrouped] = useState(true)
  const grouped = staff && groupedPref
  const [sort, setSort] = useState<Sort>('salarie')
  const [page, setPage] = useState(0)
  // groupes repliés par défaut : on déplie le salarié voulu (ou tout, d'un clic)
  const [opened, setOpened] = useState<Set<string>>(new Set())
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const q = useQuery({
    queryKey: ['validated-slips'],
    queryFn: async () => unwrap(await dataApi.from('salary_slips')
      .select('id, period_start, employee_id, employee_number, employee_name, designation, gross_pay, net_pay, employee:employees(first_name, last_name)')
      .eq('status', 'Validé')
      .order('period_start', { ascending: false })) as unknown as Slip[],
  })

  const people = useMemo(() => {
    const m = new Map<string, string>()
    for (const s of q.data ?? []) m.set(s.employee_id, ident(s))
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1], 'fr'))
  }, [q.data])

  const rows = useMemo(() => {
    const t = query.trim().toLowerCase()
    const out = (q.data ?? []).filter((s) =>
      (!employee || s.employee_id === employee)
      && (!t || `${s.employee_number} ${fullName(s)}`.toLowerCase().includes(t))
      && (!from || s.period_start.slice(0, 7) >= from)
      && (!to || s.period_start.slice(0, 7) <= to))
    const byPeriod = (a: Slip, b: Slip) => (sort === 'periode-asc' ? a.period_start.localeCompare(b.period_start) : b.period_start.localeCompare(a.period_start))
    return out.sort((a, b) => sort === 'salarie'
      ? (a.employee_number ?? '').localeCompare(b.employee_number ?? '') || byPeriod(a, b)
      : byPeriod(a, b) || (a.employee_number ?? '').localeCompare(b.employee_number ?? ''))
  }, [q.data, query, employee, from, to, sort])

  const groups = useMemo(() => {
    const m = new Map<string, Slip[]>()
    for (const s of rows) m.set(s.employee_id, [...(m.get(s.employee_id) ?? []), s])
    // en tri par période, les groupes suivent leur bulletin le plus récent (ou le plus ancien)
    return [...m.entries()].map(([id, slips]) => ({ id, slips, label: ident(slips[0]) }))
  }, [rows])

  const pageCount = Math.max(1, Math.ceil((grouped ? groups.length : rows.length) / (grouped ? PAGE_GROUPS : PAGE_ROWS)))
  const current = Math.min(page, pageCount - 1)
  const pageGroups = groups.slice(current * PAGE_GROUPS, (current + 1) * PAGE_GROUPS)
  const pageRows = rows.slice(current * PAGE_ROWS, (current + 1) * PAGE_ROWS)
  const reset = () => setPage(0)

  function toggle(id: string) {
    setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  }
  function toggleMany(ids: string[], on: boolean) {
    setSelected((s) => { const n = new Set(s); ids.forEach((i) => (on ? n.add(i) : n.delete(i))); return n })
  }

  function exportCsv() {
    const head = ['Matricule', 'Nom et prénom', 'Emploi', 'Période', 'Brut', 'Net à payer']
    const lines = rows.map((s) => [s.employee_number ?? '', fullName(s), s.designation ?? '', monthLabel(s.period_start), String(s.gross_pay).replace('.', ','), String(s.net_pay).replace('.', ',')]
      .map((v, i) => (i >= 4 ? v : JSON.stringify(v))).join(';'))
    const blob = new Blob(['﻿' + [head.join(';'), ...lines].join('\r\n')], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `bulletins-valides${from ? `-${from}` : ''}${to ? `-${to}` : ''}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const SlipLine = ({ s, showIdent, indent }: { s: Slip; showIdent: boolean; indent?: boolean }) => (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 hover:bg-[#F1F7F6]">
      <input type="checkbox" className={clsx('h-4 w-4 accent-[#0F6E6A]', indent && 'ml-6')} checked={selected.has(s.id)} onChange={() => toggle(s.id)}
        aria-label={`Sélectionner ${monthLabel(s.period_start)} — ${ident(s)}`} />
      <Link to={`/bulletins/${s.id}`} className="min-w-[16rem] flex-1 font-medium text-river hover:underline">
        {monthLabel(s.period_start)}{showIdent && <span className="font-normal text-ink"> — {ident(s)}</span>}
      </Link>
      <span className="num w-36 text-right text-sm text-ink-soft">Brut {fcfa(s.gross_pay)} F</span>
      <span className="num w-36 text-right text-sm font-semibold">Net {fcfa(s.net_pay)} F</span>
      <Link to={`/bulletins/imprimer?ids=${s.id}`} className="inline-flex items-center gap-1 text-sm text-ink-soft hover:text-river" aria-label={`Imprimer ${monthLabel(s.period_start)} — ${ident(s)}`}>
        <Printer className="h-4 w-4" aria-hidden /> Imprimer
      </Link>
    </li>
  )

  return (
    <>
      <PageHeader
        title={staff ? 'Bulletins de paie' : 'Mes bulletins'}
        description={staff ? 'Bulletins validés de tous les salariés, regroupés par salarié.' : 'Vos bulletins de paie validés, à consulter et imprimer.'}
      />
      <ErrorNote error={q.error} />
      {q.isLoading ? <Spinner /> : (q.data ?? []).length === 0 ? (
        <Empty title="Aucun bulletin disponible">Les bulletins apparaissent ici dès que la paie du mois est validée. Si rien n'apparaît, demandez au service RH de relier votre compte à votre fiche.</Empty>
      ) : (
        <div className="panel overflow-hidden">
          <div className="no-print flex flex-wrap items-end gap-2 border-b border-line px-3 py-2">
            <label className="relative min-w-[12rem] max-w-xs flex-1">
              <span className="label">Nom ou matricule</span>
              <Search className="pointer-events-none absolute bottom-2.5 left-2.5 h-4 w-4 text-ink-muted" aria-hidden />
              <input type="search" value={query} onChange={(e) => { setQuery(e.target.value); reset() }} placeholder="ex. S0012 ou DIOP" className="field pl-8" />
            </label>
            {staff && (
              <label>
                <span className="label">Salarié</span>
                <select value={employee} onChange={(e) => { setEmployee(e.target.value); reset() }} className="field w-64">
                  <option value="">Tous les salariés</option>
                  {people.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
                </select>
              </label>
            )}
            <label><span className="label">Du mois</span><input type="month" value={from} onChange={(e) => { setFrom(e.target.value); reset() }} className="field w-40" /></label>
            <label><span className="label">Au mois</span><input type="month" value={to} onChange={(e) => { setTo(e.target.value); reset() }} className="field w-40" /></label>
            <label>
              <span className="label">Tri</span>
              <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="field w-48">
                <option value="salarie">Par salarié</option>
                <option value="periode-desc">Période, plus récente d'abord</option>
                <option value="periode-asc">Période, plus ancienne d'abord</option>
              </select>
            </label>
            {staff && (
              <label className="mb-2 inline-flex items-center gap-2 text-sm">
                <input type="checkbox" className="h-4 w-4 accent-[#0F6E6A]" checked={groupedPref} onChange={(e) => { setGrouped(e.target.checked); reset() }} />
                Regrouper par salarié
              </label>
            )}
            <div className="ml-auto flex items-center gap-2">
              <Button size="sm" icon={<Printer className="h-3.5 w-3.5" />} disabled={selected.size === 0}
                onClick={() => navigate(`/bulletins/imprimer?ids=${[...selected].join(',')}`)}>
                Imprimer la sélection{selected.size ? ` (${selected.size})` : ''}
              </Button>
              <Button size="sm" icon={<Download className="h-3.5 w-3.5" />} onClick={exportCsv}>Exporter CSV</Button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-2 text-xs text-ink-muted">
            <p className="flex-1">{rows.length} bulletin(s){grouped && ` · ${groups.length} salarié(s)`} · net total {fcfa(rows.reduce((s, r) => s + Number(r.net_pay), 0))} F</p>
            {grouped && groups.length > 0 && (
              <span className="no-print flex gap-3">
                <button type="button" className="text-river hover:underline" onClick={() => setOpened(new Set(groups.map((g) => g.id)))}>Tout déplier</button>
                <button type="button" className="text-river hover:underline" onClick={() => setOpened(new Set())}>Tout replier</button>
              </span>
            )}
          </div>

          {rows.length === 0 ? <p className="px-4 py-6 text-sm text-ink-muted">Aucun bulletin ne correspond aux filtres.</p> : grouped ? (
            <div className="divide-y divide-line">
              {pageGroups.map((g) => {
                const open = opened.has(g.id) || groups.length === 1
                const allOn = g.slips.every((s) => selected.has(s.id))
                return (
                  <section key={g.id} aria-label={`Salarié ${g.label}`}>
                    <header className="flex flex-wrap items-center gap-x-4 gap-y-1 bg-paper px-4 py-2">
                      <input type="checkbox" className="h-4 w-4 accent-[#0F6E6A]" checked={allOn} onChange={() => toggleMany(g.slips.map((s) => s.id), !allOn)}
                        aria-label={`Sélectionner tous les bulletins de ${g.label}`} />
                      <button type="button" aria-expanded={open} onClick={() => setOpened((c) => { const n = new Set(c); if (open) n.delete(g.id); else n.add(g.id); return n })}
                        className="flex min-w-[16rem] flex-1 items-center gap-2 text-left font-semibold">
                        <ChevronDown className={clsx('h-4 w-4 transition-transform', !open && '-rotate-90')} aria-hidden />
                        Salarié : {g.label}
                      </button>
                      <span className="text-xs text-ink-muted">{g.slips.length} bulletin(s)</span>
                      <span className="num w-36 text-right text-sm text-ink-soft">Brut {fcfa(g.slips.reduce((s, r) => s + Number(r.gross_pay), 0))} F</span>
                      <span className="num w-36 text-right text-sm font-semibold">Net {fcfa(g.slips.reduce((s, r) => s + Number(r.net_pay), 0))} F</span>
                      <span className="w-[4.75rem]" aria-hidden />
                    </header>
                    {open && <ul className="divide-y divide-line/70">{g.slips.map((s) => <SlipLine key={s.id} s={s} showIdent indent />)}</ul>}
                  </section>
                )
              })}
            </div>
          ) : (
            <ul className="divide-y divide-line/70">{pageRows.map((s) => <SlipLine key={s.id} s={s} showIdent />)}</ul>
          )}

          {pageCount > 1 && (
            <nav className="no-print flex items-center justify-end gap-2 border-t border-line px-3 py-2 text-sm" aria-label="Pagination">
              <Button size="sm" variant="ghost" icon={<ChevronLeft className="h-4 w-4" />} disabled={current === 0} onClick={() => setPage(current - 1)}>Précédent</Button>
              <span className="text-ink-soft">Page {current + 1} / {pageCount}</span>
              <Button size="sm" variant="ghost" disabled={current >= pageCount - 1} onClick={() => setPage(current + 1)}>Suivant <ChevronRight className="h-4 w-4" /></Button>
            </nav>
          )}
        </div>
      )}
    </>
  )
}
