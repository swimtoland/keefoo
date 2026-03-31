import { useCallback, useEffect, useState } from 'react'
import { Navigate, NavLink, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import {
  Eye,
  CalendarDays,
  LayoutDashboard,
  FileText,
  CandlestickChart,
  GitBranch,
  BookOpen,
  ClipboardList,
  LogOut,
  Newspaper,
  User,
} from 'lucide-react'
import { getPendingQuestions } from './api'
import { AuthProvider, useAuth } from './contexts/AuthContext.jsx'
import { useUiPreferences } from './contexts/UiPreferencesContext.jsx'
import { UiChromeBar } from './components/UiChromeBar.jsx'
import { TradeWizard } from './components/TradeWizard.jsx'
import Feed from './pages/Feed.jsx'
import Positions from './pages/Positions.jsx'
import TradeForm from './pages/TradeForm.jsx'
import Shadow from './pages/Shadow.jsx'
import AssetDetail from './pages/AssetDetail.jsx'
import Report from './pages/Report.jsx'
import Profile from './pages/Profile.jsx'
import Graph from './pages/Graph.jsx'
import Chart from './pages/Chart.jsx'
import Notebook from './pages/Notebook.jsx'
import Calendar from './pages/Calendar.jsx'
import Login from './pages/Login.jsx'

const navInput = [
  { to: '/positions', navKey: 'positions', icon: LayoutDashboard },
  { to: '/', navKey: 'feed', icon: Newspaper, end: true },
  { to: '/shadow', navKey: 'shadow', icon: Eye },
]

const navAnalysis = [
  { to: '/report', navKey: 'report', icon: FileText },
  { to: '/profile', navKey: 'profile', icon: User },
  { to: '/graph', navKey: 'graph', icon: GitBranch },
  { to: '/calendar', navKey: 'calendar', icon: CalendarDays },
]

const navTools = [
  { to: '/chart', navKey: 'chart', icon: CandlestickChart },
  { to: '/notebook', navKey: 'notebook', icon: BookOpen },
  { to: '/trade', navKey: 'trade', icon: ClipboardList },
]

function NavItem({ item, pendingAgent, t }) {
  const Icon = item.icon
  const label = t(`nav.${item.navKey}`)
  return (
    <NavLink
      to={item.to}
      end={item.end}
      className={({ isActive }) =>
        [
          'flex items-center gap-3 rounded-md border-l-2 py-2.5 pl-4 pr-3 text-[14px] transition-colors duration-200 ease-out',
          isActive
            ? 'border-black font-semibold text-black dark:border-white dark:text-white'
            : 'border-transparent font-normal text-[#999] hover:text-[#333] dark:text-zinc-500 dark:hover:text-zinc-300',
        ].join(' ')
      }
    >
      <Icon className="h-[18px] w-[18px] shrink-0 stroke-[1.75]" aria-hidden />
      <span className="flex-1">{label}</span>
      {item.to === '/trade' && pendingAgent > 0 && (
        <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-black px-1.5 text-[10px] font-bold leading-none text-white dark:bg-white dark:text-zinc-900">
          {pendingAgent > 9 ? '9+' : pendingAgent}
        </span>
      )}
    </NavLink>
  )
}

function ProtectedRoute({ children }) {
  const { isAuthenticated } = useAuth()
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }
  return children
}

function Layout() {
  const location = useLocation()
  const { t } = useUiPreferences()
  const { user, logout } = useAuth()
  const nickname = user?.nickname || t('layout.defaultUser')
  const userId = user?.id
  const [pendingAgent, setPendingAgent] = useState(0)
  const [tradeWizardOpen, setTradeWizardOpen] = useState(false)

  const refreshPending = useCallback(() => {
    if (!userId) {
      setPendingAgent(0)
      return
    }
    getPendingQuestions(userId)
      .then((list) => setPendingAgent(Array.isArray(list) ? list.length : 0))
      .catch(() => setPendingAgent(0))
  }, [userId])

  useEffect(() => {
    refreshPending()
  }, [location.pathname, refreshPending])

  useEffect(() => {
    window.addEventListener('keefoo-pending-refresh', refreshPending)
    return () => window.removeEventListener('keefoo-pending-refresh', refreshPending)
  }, [refreshPending])

  return (
    <div className="flex h-screen w-full max-w-full overflow-hidden bg-[#FAFAFA] dark:bg-[#0a0a0a]">
      <aside className="flex h-screen w-[220px] flex-shrink-0 flex-col border-r border-[#F0F0F0] bg-white shadow-[1px_0_0_0_#F0F0F0] dark:border-zinc-800 dark:bg-zinc-950 dark:shadow-none">
        <div className="px-6 pb-4 pt-6">
          <div className="text-xl font-extrabold tracking-tight text-black dark:text-white">
            {t('brand.name')}
          </div>
          <div className="mt-1 text-[12px] font-normal text-[#999] dark:text-zinc-500">
            {t('brand.tagline')}
          </div>
        </div>

        <nav className="flex flex-1 flex-col gap-0.5 px-3">
          {navInput.map((item) => (
            <NavItem key={item.to} item={item} pendingAgent={pendingAgent} t={t} />
          ))}

          <div className="my-3 px-1">
            <div className="flex items-center gap-2">
              <div className="h-px flex-1 bg-[#F0F0F0] dark:bg-zinc-800" />
              <span className="text-[10px] text-[#BBB] dark:text-zinc-600">{t('layout.analysis')}</span>
              <div className="h-px flex-1 bg-[#F0F0F0] dark:bg-zinc-800" />
            </div>
          </div>

          {navAnalysis.map((item) => (
            <NavItem key={item.to} item={item} pendingAgent={pendingAgent} t={t} />
          ))}

          <div className="my-3 px-1">
            <div className="flex items-center gap-2">
              <div className="h-px flex-1 bg-[#F0F0F0] dark:bg-zinc-800" />
              <span className="text-[10px] text-[#BBB] dark:text-zinc-600">{t('layout.tools')}</span>
              <div className="h-px flex-1 bg-[#F0F0F0] dark:bg-zinc-800" />
            </div>
          </div>

          {navTools.map((item) => (
            <NavItem key={item.to} item={item} pendingAgent={pendingAgent} t={t} />
          ))}
        </nav>

        <div className="border-t border-[#F0F0F0] px-6 py-4 dark:border-zinc-800">
          <p className="text-[11px] leading-relaxed text-[#999] dark:text-zinc-500">
            <span className="block text-[#BBB] dark:text-zinc-600">{t('layout.currentUser')}</span>
            <span className="mt-0.5 block truncate font-medium text-[#666] dark:text-zinc-300" title={nickname}>
              {nickname}
            </span>
          </p>
          <div className="mt-3">
            <UiChromeBar variant="sidebar" />
          </div>
          <button
            type="button"
            onClick={() => logout()}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-[#E5E5E5] bg-white py-2 text-[12px] font-medium text-[#555] transition-colors hover:border-[#CCC] hover:bg-[#FAFAFA] hover:text-[#1A1A1A] dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-white"
          >
            <LogOut className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
            {t('layout.logout')}
          </button>
          <p className="mt-3 text-[11px] text-[#BBB] dark:text-zinc-600">{t('layout.version')}</p>
        </div>
      </aside>

      <main
        style={{ width: 'calc(100vw - 220px)', maxWidth: 'calc(100vw - 220px)' }}
        className="h-screen overflow-x-hidden overflow-y-auto"
      >
        <div className="w-full max-w-full overflow-x-hidden px-5 py-6 md:px-6 md:py-7">
          <Outlet context={{ openTradeWizard: () => setTradeWizardOpen(true) }} />
        </div>
      </main>

      <TradeWizard open={tradeWizardOpen} onClose={() => setTradeWizardOpen(false)} />
    </div>
  )
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Feed />} />
        <Route path="positions" element={<Positions />} />
        <Route path="trade" element={<TradeForm />} />
        <Route path="shadow" element={<Shadow />} />
        <Route path="report" element={<Report />} />
        <Route path="profile" element={<Profile />} />
        <Route path="graph" element={<Graph />} />
        <Route path="calendar" element={<Calendar />} />
        <Route path="chart" element={<Chart />} />
        <Route path="notebook" element={<Notebook />} />
        <Route path="asset/:assetId" element={<AssetDetail />} />
      </Route>
    </Routes>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  )
}
