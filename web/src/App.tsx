import { lazy, Suspense, type ReactNode } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { Spinner } from './components/ui'
import { useAuth, type Role } from './lib/auth'
import LoginPage from './pages/LoginPage'

// Chaque écran est chargé à la demande pour alléger le premier affichage.
const DashboardPage = lazy(() => import('./pages/DashboardPage'))
const EmployeesPage = lazy(() => import('./pages/EmployeesPage'))
const EmployeeDetailPage = lazy(() => import('./pages/EmployeeDetailPage'))
const LeavesPage = lazy(() => import('./pages/LeavesPage'))
const AttendancePage = lazy(() => import('./pages/AttendancePage'))
const PayrollInputsPage = lazy(() => import('./pages/PayrollInputsPage'))
const PayrollEntriesPage = lazy(() => import('./pages/PayrollEntriesPage'))
const PayrollGovernancePage = lazy(() => import('./pages/PayrollGovernancePage'))
const PayrollEntryPage = lazy(() => import('./pages/PayrollEntryPage'))
const SalarySlipPage = lazy(() => import('./pages/SalarySlipPage'))
const PrintSlipsPage = lazy(() => import('./pages/PrintSlipsPage'))
const PayrollBookPrintPage = lazy(() => import('./pages/PayrollBookPrintPage'))
const JournalPage = lazy(() => import('./pages/JournalPage'))
const PlanningPage = lazy(() => import('./pages/PlanningPage'))
const MySpacePage = lazy(() => import('./pages/MySpacePage'))
const RequestsPage = lazy(() => import('./pages/RequestsPage'))
const PayrollPaymentsPage = lazy(() => import('./pages/PayrollPaymentsPage'))
const PilotagePage = lazy(() => import('./pages/PilotagePage'))
const SimulatorPage = lazy(() => import('./pages/SimulatorPage'))
const ReportsPage = lazy(() => import('./pages/ReportsPage'))
const SettingsPage = lazy(() => import('./pages/SettingsPage'))
const MySlipsPage = lazy(() => import('./pages/MySlipsPage'))
const ManagerPage = lazy(() => import('./pages/ManagerPage'))
const ManagerAssignmentsPage = lazy(() => import('./pages/ManagerAssignmentsPage'))
const EmployeeDocumentsPage = lazy(() => import('./pages/EmployeeDocumentsPage'))

/**
 * Accès aux écrans de gestion : réservé aux rôles RH / paie (l'administrateur a tous les droits).
 * Un salarié sans ces rôles est renvoyé vers ses propres bulletins ; la RLS protège les données
 * dans tous les cas, ce garde évite d'afficher des écrans vides ou trompeurs.
 */
function RoleGuard({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { can } = useAuth()
  return can(...roles) ? <>{children}</> : <Navigate to="/" replace />
}

/** Accueil : tableau de bord pour la gestion, bulletins personnels pour un salarié. */
function Home() {
  const { can, roles } = useAuth()
  if (!can('rh', 'paie') && roles.includes('salarie')) return <Navigate to="/mon-espace" replace />
  if (!can('rh', 'paie') && roles.includes('manager')) return <Navigate to="/mon-equipe" replace />
  return <DashboardPage />
}

const staff: Role[] = ['rh', 'paie']

export default function App() {
  const { session, loading, roles } = useAuth()
  if (loading) return <div className="p-10"><Spinner /></div>
  if (!session) {
    return (
      <Routes>
        <Route path="*" element={<LoginPage />} />
      </Routes>
    )
  }
  return (
    <Suspense fallback={<div className="p-10"><Spinner /></div>}>
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="salaries" element={<RoleGuard roles={staff}><EmployeesPage /></RoleGuard>} />
        <Route path="salaries/:id" element={<RoleGuard roles={staff}><EmployeeDetailPage /></RoleGuard>} />
        <Route path="dossiers-salaries" element={<RoleGuard roles={['rh']}><EmployeeDocumentsPage /></RoleGuard>} />
        <Route path="conges" element={<LeavesPage />} />
        <Route path="presences" element={<RoleGuard roles={staff}><AttendancePage /></RoleGuard>} />
        <Route path="pilotage" element={<RoleGuard roles={staff}><PilotagePage /></RoleGuard>} />
        <Route path="planning" element={<RoleGuard roles={staff}><PlanningPage /></RoleGuard>} />
        <Route path="paie" element={<RoleGuard roles={staff}><PayrollEntriesPage /></RoleGuard>} />
        <Route path="paie/gouvernance" element={<RoleGuard roles={staff}><PayrollGovernancePage /></RoleGuard>} />
        <Route path="paie/variables" element={<RoleGuard roles={staff}><PayrollInputsPage /></RoleGuard>} />
        <Route path="paie/simulateur" element={<RoleGuard roles={['paie', 'rh']}><SimulatorPage /></RoleGuard>} />
        <Route path="paie/:id" element={<RoleGuard roles={staff}><PayrollEntryPage /></RoleGuard>} />
        <Route path="paie/:id/imprimer" element={<RoleGuard roles={staff}><PrintSlipsPage /></RoleGuard>} />
        <Route path="paie/:id/paiements" element={<RoleGuard roles={staff}><PayrollPaymentsPage /></RoleGuard>} />
        <Route path="paie/:id/livre" element={<RoleGuard roles={staff}><PayrollBookPrintPage /></RoleGuard>} />
        {/* bulletins : la RLS ne renvoie à un salarié que ses propres bulletins validés */}
        <Route path="bulletins/imprimer" element={<PrintSlipsPage />} />
        <Route path="bulletins/:id" element={<SalarySlipPage />} />
        <Route path="etats" element={<RoleGuard roles={staff}><ReportsPage /></RoleGuard>} />
        <Route path="journal" element={<RoleGuard roles={['rh']}><JournalPage /></RoleGuard>} />
        <Route path="parametres" element={roles.length === 0 ? <SettingsPage /> : <RoleGuard roles={staff}><SettingsPage /></RoleGuard>} />
        <Route path="mon-espace" element={<MySpacePage />} />
        <Route path="mon-equipe" element={<RoleGuard roles={['manager']}><ManagerPage /></RoleGuard>} />
        <Route path="equipes" element={<RoleGuard roles={['rh']}><ManagerAssignmentsPage /></RoleGuard>} />
        <Route path="demandes" element={<RoleGuard roles={['rh']}><RequestsPage /></RoleGuard>} />
        <Route path="mes-bulletins" element={<MySlipsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
    </Suspense>
  )
}
