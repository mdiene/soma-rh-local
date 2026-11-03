import clsx from 'clsx'
import {
  BarChart3, CalendarCheck2, CalendarDays, Calculator, FileSpreadsheet, LayoutDashboard, LogOut, Menu,
  CalendarClock, History, PieChart, Inbox, UserCircle, LockKeyhole, Settings, SlidersHorizontal, Users, Wallet, FileText,
} from 'lucide-react'
import { Suspense, useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { useAuth, type Role } from '../lib/auth'
import { Spinner } from './ui'

type Item = { to: string; label: string; icon: React.ElementType; roles?: Role[]; withoutRole?: boolean }
const GROUPS: { title: string; items: Item[] }[] = [
  { title: 'Pilotage', items: [
    { to: '/', label: 'Tableau de bord', icon: LayoutDashboard, roles: ['rh', 'paie'] },
    { to: '/pilotage', label: 'Pilotage RH', icon: PieChart, roles: ['rh', 'paie'] },
    { to: '/mon-espace', label: 'Mon espace', icon: UserCircle, roles: ['salarie', 'rh', 'paie'] },
    { to: '/demandes', label: 'Demandes des salariés', icon: Inbox, roles: ['rh'] },
    { to: '/equipes', label: 'Équipes et managers', icon: Users, roles: ['rh'] },
    { to: '/mon-equipe', label: 'Mon équipe', icon: Users, roles: ['manager'] },
  ] },
  {
    title: 'Personnel',
    items: [
      { to: '/salaries', label: 'Salariés', icon: Users, roles: ['rh', 'paie'] },
      { to: '/dossiers-salaries', label: 'Dossiers administratifs', icon: FileText, roles: ['rh'] },
      { to: '/conges', label: 'Congés', icon: CalendarDays },
      { to: '/planning', label: 'Planning des postes', icon: CalendarClock, roles: ['rh', 'paie'] },
      { to: '/presences', label: 'Présences', icon: CalendarCheck2, roles: ['rh', 'paie'] },
    ],
  },
  {
    title: 'Paie',
    items: [
      { to: '/paie/variables', label: 'Variables du mois', icon: SlidersHorizontal, roles: ['paie', 'rh'] },
      { to: '/paie', label: 'Traitements de paie', icon: Wallet, roles: ['paie', 'rh'] },
      { to: '/paie/gouvernance', label: 'Contrôle et clôture', icon: LockKeyhole, roles: ['paie', 'rh'] },
      { to: '/paie/simulateur', label: 'Simulateur net / brut', icon: Calculator, roles: ['paie', 'rh'] },
      { to: '/etats', label: 'États et déclarations', icon: FileSpreadsheet, roles: ['paie', 'rh'] },
      { to: '/mes-bulletins', label: 'Mes bulletins', icon: BarChart3, roles: ['salarie', 'rh', 'paie'] },
    ],
  },
  // sans rôle : accès aux paramètres pour déclarer le premier administrateur
  { title: 'Administration', items: [{ to: '/journal', label: 'Journal des modifications', icon: History, roles: ['rh'] }, { to: '/parametres', label: 'Paramètres', icon: Settings, roles: ['rh', 'paie'], withoutRole: true }] },
]

export function Layout() {
  const { session, can, roles, signOut } = useAuth()
  const [open, setOpen] = useState(false)

  const nav = (
    <nav className="flex flex-1 flex-col gap-5 overflow-y-auto px-3 py-4" aria-label="Navigation principale">
      {GROUPS.map((g) => {
        const items = g.items.filter((i) => !i.roles || can(...i.roles) || (i.withoutRole && roles.length === 0))
        if (!items.length) return null
        return (
          <div key={g.title}>
            <p className="px-2 pb-1 text-xs text-white/45">{g.title}</p>
            <ul className="space-y-0.5">
              {items.map((i) => (
                <li key={i.to}>
                  <NavLink
                    to={i.to}
                    end={i.to === '/' || i.to === '/paie'}
                    onClick={() => setOpen(false)}
                    className={({ isActive }) => clsx(
                      'flex items-center gap-2.5 rounded px-2 py-1.5 text-sm transition-colors',
                      isActive ? 'bg-white/10 text-white' : 'text-white/70 hover:bg-white/5 hover:text-white',
                    )}
                  >
                    <i.icon className="h-4 w-4 shrink-0" aria-hidden />
                    {i.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        )
      })}
    </nav>
  )

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[15rem_1fr] lg:bg-[linear-gradient(to_right,#1D2A33_15rem,#F6F7F5_15rem)] print:block print:bg-none print:bg-white">
      {/* barre mobile */}
      <div className="no-print flex items-center justify-between bg-ink px-4 py-3 text-white lg:hidden">
        <Brand />
        <button onClick={() => setOpen((o) => !o)} className="rounded p-1.5 hover:bg-white/10" aria-label="Ouvrir le menu" aria-expanded={open}>
          <Menu className="h-5 w-5" />
        </button>
      </div>

      <aside className={clsx(
        'no-print flex-col bg-ink text-white lg:sticky lg:top-0 lg:flex lg:h-screen',
        open ? 'flex' : 'hidden',
      )}>
        <div className="hidden px-5 pb-2 pt-5 lg:block"><Brand /></div>
        {nav}
        <div className="border-t border-white/10 px-4 py-3 text-xs text-white/60">
          <p className="truncate text-white/85">{session?.user.email}</p>
          <p className="mt-0.5">{roles.length ? roles.join(', ') : 'aucun rôle attribué'}</p>
          <button onClick={signOut} className="mt-2 inline-flex items-center gap-1.5 text-white/70 hover:text-white">
            <LogOut className="h-3.5 w-3.5" aria-hidden /> Se déconnecter
          </button>
        </div>
      </aside>

      <main className="min-w-0 px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
        <Suspense fallback={<Spinner />}>
          <Outlet />
        </Suspense>
      </main>
    </div>
  )
}

function Brand() {
  return (
    <div className="flex items-center gap-2.5">
      <svg viewBox="0 0 32 32" className="h-7 w-7" aria-hidden>
        <rect width="32" height="32" rx="6" fill="#ffffff" fillOpacity="0.08" />
        <path d="M8 22 L13 10 L18 22 Z" fill="#0F6E6A" />
        <path d="M15 22 L20 13 L25 22 Z" fill="#E0B000" />
      </svg>
      <div className="leading-tight">
        <p className="text-[15px] font-bold" style={{ fontStretch: '80%' }}>SOMA-RH</p>
        <p className="text-[11px] text-white/55">Personnel et paie</p>
      </div>
    </div>
  )
}
