import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { useNavigate } from 'react-router-dom'
import { getMe, login as apiLogin, register as apiRegister, STORAGE_TOKEN, STORAGE_USER } from '../api'
import { useUiPreferences } from './UiPreferencesContext.jsx'

const AuthContext = createContext(null)

function readStoredUser() {
  try {
    const raw = localStorage.getItem(STORAGE_USER)
    if (!raw) return null
    const u = JSON.parse(raw)
    return u && typeof u === 'object' ? u : null
  } catch {
    return null
  }
}

function AuthLoadingScreen() {
  const { t } = useUiPreferences()
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-white dark:bg-zinc-950">
      <p className="animate-pulse text-[22px] font-extrabold tracking-tight text-[#1A1A1A] dark:text-white">
        {t('authLoading.title')}
      </p>
    </div>
  )
}

export function AuthProvider({ children }) {
  const navigate = useNavigate()
  const [token, setToken] = useState(() => localStorage.getItem(STORAGE_TOKEN))
  const [user, setUser] = useState(() => readStoredUser())
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      const t = localStorage.getItem(STORAGE_TOKEN)
      if (!t) {
        if (!cancelled) {
          setToken(null)
          setUser(null)
          setIsLoading(false)
        }
        return
      }
      try {
        const me = await getMe()
        if (cancelled) return
        setToken(t)
        setUser(me)
        localStorage.setItem(STORAGE_USER, JSON.stringify(me))
      } catch {
        if (cancelled) return
        localStorage.removeItem(STORAGE_TOKEN)
        localStorage.removeItem(STORAGE_USER)
        setToken(null)
        setUser(null)
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }
    run()
    return () => {
      cancelled = true
    }
  }, [])

  const login = useCallback(
    async (email, password) => {
      const data = await apiLogin(email, password)
      const t = data.token
      const u = data.user
      localStorage.setItem(STORAGE_TOKEN, t)
      localStorage.setItem(STORAGE_USER, JSON.stringify(u))
      setToken(t)
      setUser(u)
      navigate('/', { replace: true })
    },
    [navigate],
  )

  const register = useCallback(
    async (email, password, nickname) => {
      const data = await apiRegister(email, password, nickname)
      const t = data.token
      const u = data.user
      localStorage.setItem(STORAGE_TOKEN, t)
      localStorage.setItem(STORAGE_USER, JSON.stringify(u))
      setToken(t)
      setUser(u)
      navigate('/', { replace: true })
    },
    [navigate],
  )

  const logout = useCallback(() => {
    localStorage.removeItem(STORAGE_TOKEN)
    localStorage.removeItem(STORAGE_USER)
    setToken(null)
    setUser(null)
    navigate('/login', { replace: true })
  }, [navigate])

  const isAuthenticated = Boolean(token && user)

  const value = useMemo(
    () => ({
      user,
      token,
      isAuthenticated,
      isLoading,
      login,
      register,
      logout,
    }),
    [user, token, isAuthenticated, isLoading, login, register, logout],
  )

  if (isLoading) {
    return <AuthLoadingScreen />
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return ctx
}
