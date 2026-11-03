import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { ApiSession as Session } from './api'
import { dataApi } from './api'

export type Role = 'admin' | 'rh' | 'paie' | 'manager' | 'salarie'

type AuthState = {
  session: Session | null
  roles: Role[]
  loading: boolean
  can: (...roles: Role[]) => boolean
  refreshRoles: () => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [roles, setRoles] = useState<Role[]>([])
  const [loading, setLoading] = useState(true)

  const loadRoles = useCallback(async (s: Session | null) => {
    if (!s) { setRoles([]); return }
    const { data } = await dataApi.from('user_roles').select('role').eq('user_id', s.user.id)
    setRoles((data ?? []).map((r) => r.role as Role))
  }, [])

  useEffect(() => {
    dataApi.auth.getSession().then(async ({ data }) => {
      setSession(data.session)
      await loadRoles(data.session)
      setLoading(false)
    })
    const { data: sub } = dataApi.auth.onAuthStateChange((_event, s) => {
      setSession(s)
      void loadRoles(s)
    })
    return () => sub.subscription.unsubscribe()
  }, [loadRoles])

  const value = useMemo<AuthState>(() => ({
    session,
    roles,
    loading,
    can: (...wanted) => roles.includes('admin') || wanted.some((r) => roles.includes(r)),
    refreshRoles: () => loadRoles(session),
    signOut: async () => { await dataApi.auth.signOut() },
  }), [session, roles, loading, loadRoles])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth doit être utilisé dans <AuthProvider>')
  return ctx
}
