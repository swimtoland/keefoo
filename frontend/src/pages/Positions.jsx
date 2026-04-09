import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { Link, useNavigate, useOutletContext } from 'react-router-dom'

import {

  Bar,

  BarChart,

  CartesianGrid,

  Cell,

  Pie,

  PieChart,

  ResponsiveContainer,

  Tooltip,

  XAxis,

  YAxis,

} from 'recharts'

import {

  getPositions,

  getScenarioPushes,

  getTrades,

  getFundRealtime,

  getStockRealtime,

} from '../api'

import { useAuth } from '../contexts/AuthContext.jsx'

import { useUiPreferences } from '../contexts/UiPreferencesContext.jsx'

import { useToast } from '../components/Toast.jsx'

import {

  ChevronDown,

  Download,

  ExternalLink,

  LineChart,

  Plus,

  Wallet,

} from 'lucide-react'

const GRAY_SCALE = ['#1A1A1A', '#444444', '#666666', '#888888', '#BBBBBB', '#DDDDDD']

const GREEN = '#22C55E'

const RED = '#EF4444'

function money(n) {

  if (!Number.isFinite(n)) return '0.00'

  return n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

}

function pct(n) {

  if (!Number.isFinite(n)) return '0.0%'

  return `${(n * 100).toFixed(1)}%`

}

function whenText(iso, dateLocale) {

  if (!iso) return '—'

  try {

    return new Date(iso).toLocaleString(dateLocale, {

      year: 'numeric',

      month: '2-digit',

      day: '2-digit',

      hour: '2-digit',

      minute: '2-digit',

    })

  } catch {

    return '—'

  }

}

function emotionEmoji(score) {

  const s = Number(score)

  if (!Number.isFinite(s)) return ''

  if (s <= 2) return ''

  if (s <= 4) return ''

  if (s <= 6) return ''

  if (s === 7) return ''

  if (s === 8) return ''

  return ''

}

function assetTypeLabel(v, isEn) {
  if (v === 'fund') return isEn ? 'Fund' : '基金'
  if (v === 'bond') return isEn ? 'Bond' : '债券'
  if (v === 'futures') return isEn ? 'Futures' : '期货'
  if (v === 'gold') return isEn ? 'Precious Metal' : '贵金属'
  return isEn ? 'Stock' : '股票'
}

function directionLabel(dir, isEn) {
  return dir === 'sell' ? (isEn ? 'Sell' : '卖出') : isEn ? 'Buy' : '买入'
}

function confidenceTag(v, isEn) {
  const n = Number(v)
  if (!Number.isFinite(n)) return ''
  if (n <= 3) return isEn ? 'Probe' : '试探'
  if (n <= 6) return isEn ? 'Normal' : '一般'
  if (n <= 8) return isEn ? 'High' : '较高'
  return isEn ? 'Very High' : '很高'
}

function PositionsSkeleton() {

  return (

    <div className="animate-pulse space-y-12">

      <div className="h-8 w-40 rounded bg-[#E8E8E8] dark:bg-zinc-800" />

      <div className="grid gap-4 md:grid-cols-4">

        {[1, 2, 3, 4].map((i) => (

          <div key={i} className="h-[92px] rounded-2xl bg-white shadow-sm dark:bg-zinc-900" />

        ))}

      </div>

      <div className="grid gap-4 lg:grid-cols-2">

        <div className="h-[280px] rounded-2xl bg-white shadow-sm dark:bg-zinc-900" />

        <div className="h-[280px] rounded-2xl bg-white shadow-sm dark:bg-zinc-900" />

      </div>

      <div className="space-y-3">

        {[1, 2, 3].map((i) => (

          <div key={i} className="h-[92px] rounded-2xl bg-white shadow-sm dark:bg-zinc-900" />

        ))}

      </div>

    </div>

  )

}

export default function Positions() {

  const navigate = useNavigate()

  const { user } = useAuth()

  const { t, dateLocale, locale } = useUiPreferences()
  const isEn = locale === 'en'

  const userId = user?.id

  const showToast = useToast()

  const outlet = useOutletContext()

  const openTradeWizard = outlet?.openTradeWizard

  const [loading, setLoading] = useState(true)

  const [overview, setOverview] = useState({ real_positions: [], shadow_positions: [] })

  const [trades, setTrades] = useState([])

  const [scenarioPushes, setScenarioPushes] = useState([])

  const [statusFilter, setStatusFilter] = useState('all') // all | open | closed

  const [expandedAssetId, setExpandedAssetId] = useState(null)

  const [showAllTradesByAsset, setShowAllTradesByAsset] = useState({})

  const [rtByCode, setRtByCode] = useState({})

  const rtByCodeRef = useRef({})

  const rafRef = useRef(0)

  const [countUp, setCountUp] = useState({

    totalAsset: 0,

    todayPnl: 0,

    holdings: 0,

    winRate: 0,

  })

  useEffect(() => {

    if (!userId) return

    let cancelled = false

    setLoading(true)

    Promise.all([getPositions(userId), getTrades(userId), getScenarioPushes(userId)])

      .then(([pos, td, sp]) => {

        if (!cancelled) {

          setOverview(pos || { real_positions: [], shadow_positions: [] })

          setTrades(Array.isArray(td) ? td : [])

          setScenarioPushes(Array.isArray(sp) ? sp : [])

        }

      })

      .catch((e) => {

        if (!cancelled) {

          showToast(

            typeof e.response?.data?.detail === 'string'

              ? e.response.data.detail

              : e.message || t('positions.loadFail'),

            'error',

          )

        }

      })

      .finally(() => {

        if (!cancelled) setLoading(false)

      })

    return () => {

      cancelled = true

    }

  }, [showToast, t, userId])

  const real = overview.real_positions || []

  const shadows = overview.shadow_positions || []

  const scenarioByShadowId = useMemo(() => {

    const m = {}

    for (const p of scenarioPushes || []) {

      m[String(p.shadow_id)] = p

    }

    return m

  }, [scenarioPushes])

  const tradeByAssetId = useMemo(() => {

    const m = {}

    for (const tr of trades || []) {

      const aid = String(tr.asset?.id || tr.asset_id || '')

      if (!aid) continue

      if (!m[aid]) m[aid] = []

      m[aid].push(tr)

    }

    for (const k of Object.keys(m)) {

      m[k].sort((a, b) => new Date(b.traded_at).getTime() - new Date(a.traded_at).getTime())

    }

    return m

  }, [trades])

  const assetCards = useMemo(() => {

    const byId = {}

    // from positions (active holdings)

    for (const row of real) {

      const asset = row.asset

      if (!asset?.id) continue

      const id = String(asset.id)

      const netQty = Number(row.net_quantity)

      const avg = row.weighted_avg_buy_price != null ? Number(row.weighted_avg_buy_price) : Number.NaN

      byId[id] = {

        asset,

        netQty: Number.isFinite(netQty) ? netQty : 0,

        avgPrice: Number.isFinite(avg) ? avg : 0,

        isFromPositions: true,

      }

    }

    // from trades (closed assets may not exist in positions)

    for (const tr of trades || []) {

      const asset = tr.asset

      const id = String(asset?.id || tr.asset_id || '')

      if (!id) continue

      if (!byId[id]) {

        byId[id] = {

          asset: asset || { id, name: '—', code: '' },

          netQty: 0,

          avgPrice: 0,

          isFromPositions: false,

        }

      }

    }

    const rows = Object.values(byId)

      .map((x) => {

        const aid = String(x.asset?.id || '')

        const list = tradeByAssetId[aid] || []

        const hasOpen = list.some((t) => String(t.status) === 'open')

        const hasAny = list.length > 0

        const allClosed = hasAny && list.every((t) => String(t.status) === 'closed')

        const status = hasOpen || x.isFromPositions ? 'open' : allClosed ? 'closed' : 'open'

        // PnL: sum closed trade pnl if exists; else mock based on qty*avg

        const pnl = list.reduce((acc, t) => {

          const p = Number(t.pnl)

          return Number.isFinite(p) ? acc + p : acc

        }, 0)

        const baseValue = Math.max(0, Number(x.netQty) * Number(x.avgPrice))

        const pnlPct = baseValue > 0 ? pnl / baseValue : 0

        const code = String(x.asset?.code || '').trim()

        const rt = code ? rtByCodeRef.current[code] : null

        const rtPrice = Number(rt?.price ?? rt?.nav)

        const hasRt = Number.isFinite(rtPrice) && rtPrice > 0

        const currentValue = hasRt ? Math.max(0, Number(x.netQty) * rtPrice) : null

        const floatingPnl =

          hasRt && Number.isFinite(Number(x.avgPrice)) ? (rtPrice - Number(x.avgPrice)) * Number(x.netQty) : null

        const floatingPnlPct =

          hasRt && Number.isFinite(Number(x.avgPrice)) && Number(x.avgPrice) > 0 ? (rtPrice - Number(x.avgPrice)) / Number(x.avgPrice) : null

        return {

          ...x,

          assetId: aid,

          trades: list,

          status,

          pnl,

          pnlPct,

          baseValue,

          rt,

          rtPrice: hasRt ? rtPrice : null,

          currentValue,

          floatingPnl,

          floatingPnlPct,

        }

      })

      .filter((x) => {

        if (statusFilter === 'open') return x.status === 'open'

        if (statusFilter === 'closed') return x.status === 'closed'

        return true

      })

      .sort((a, b) => {

        // open first, then by base value desc

        if (a.status !== b.status) return a.status === 'open' ? -1 : 1

        return (b.baseValue || 0) - (a.baseValue || 0)

      })

    return rows

  }, [real, statusFilter, tradeByAssetId, trades])

  useEffect(() => {

    if (!assetCards || assetCards.length === 0) return

    let cancelled = false

    const targets = assetCards

      .map((x) => {

        const code = String(x.asset?.code || '').trim()

        const type = String(x.asset?.asset_type || 'stock')

        return code ? { code, type } : null

      })

      .filter(Boolean)

    const uniq = []

    const seen = new Set()

    for (const t of targets) {

      const k = `${t.type}:${t.code}`

      if (seen.has(k)) continue

      seen.add(k)

      uniq.push(t)

    }

    async function refresh(silent = false) {

      try {

        const settled = await Promise.all(

          uniq.map(async (t) => {

            try {

              const data = t.type === 'fund' ? await getFundRealtime(t.code) : await getStockRealtime(t.code)

              return { code: t.code, data }

            } catch {

              return { code: t.code, data: null }

            }

          }),

        )

        if (cancelled) return

        const next = { ...(rtByCodeRef.current || {}) }

        for (const s of settled) {

          if (s.data != null) next[s.code] = s.data

          else if (!(s.code in next)) next[s.code] = null

        }

        rtByCodeRef.current = next

        setRtByCode(next)

      } catch {

        // keep last

        if (!cancelled) setRtByCode(rtByCodeRef.current || {})

      }

    }

    refresh(true)

    const id = window.setInterval(() => refresh(true), 30 * 1000)

    return () => {

      cancelled = true

      window.clearInterval(id)

    }

    // eslint-disable-next-line react-hooks/exhaustive-deps

  }, [assetCards.map((x) => x.asset?.code).join('|')])

  const totals = useMemo(() => {

    const totalAsset = real.reduce((acc, row) => {

      const qty = Number(row.net_quantity)

      const avg = row.weighted_avg_buy_price != null ? Number(row.weighted_avg_buy_price) : 0

      if (!Number.isFinite(qty) || !Number.isFinite(avg)) return acc

      return acc + qty * avg

    }, 0)

    const closed = (trades || []).filter((t) => String(t.status) === 'closed')

    const closedWithPnl = closed.filter((t) => Number.isFinite(Number(t.pnl)))

    const win = closedWithPnl.filter((t) => Number(t.pnl) > 0).length

    const winRate = closedWithPnl.length > 0 ? win / closedWithPnl.length : 0

    // MVP: today pnl mocked (small % of total), deterministic-ish by day

    const day = new Date()

    const seed = day.getFullYear() * 10000 + (day.getMonth() + 1) * 100 + day.getDate()

    const r = Math.sin(seed) * 0.5 + Math.cos(seed * 0.77) * 0.5

    const todayPnl = totalAsset * (r * 0.002)

    return {

      totalAsset,

      todayPnl,

      holdings: real.length,

      winRate,

      closedTradesCount: closedWithPnl.length,

    }

  }, [real, trades])

  const pieData = useMemo(() => {

    const rows = real

      .map((row) => {

        const asset = row.asset

        if (!asset?.id) return null

        const qty = Number(row.net_quantity)

        const avg = row.weighted_avg_buy_price != null ? Number(row.weighted_avg_buy_price) : 0

        const v = Number.isFinite(qty) && Number.isFinite(avg) ? qty * avg : 0

        if (!Number.isFinite(v) || v <= 0) return null

        return { name: asset.name, assetId: String(asset.id), value: v }

      })

      .filter(Boolean)

    const sum = rows.reduce((a, b) => a + (Number(b.value) || 0), 0)

    return { rows, sum }

  }, [real])

  const barData = useMemo(() => {

    return assetCards

      .map((x) => ({

        name: x.asset?.name || '—',

        pnl: Number.isFinite(Number(x.pnl)) ? Number(x.pnl) : 0,

      }))

      .slice(0, 8)

  }, [assetCards])

  const deltaMock = useMemo(() => {

    // derive a pseudo daily delta from todayPnl

    const delta = totals.todayPnl

    const pctVal = totals.totalAsset > 0 ? delta / totals.totalAsset : 0

    return { delta, pctVal }

  }, [totals.todayPnl, totals.totalAsset])

  useEffect(() => {

    // countUp animation

    if (loading) return

    const start = performance.now()

    const dur = 720

    const from = { ...countUp }

    const to = {

      totalAsset: totals.totalAsset,

      todayPnl: totals.todayPnl,

      holdings: totals.holdings,

      winRate: totals.winRate,

    }

    const step = (ts) => {

      const p = Math.min(1, (ts - start) / dur)

      const ease = 1 - Math.pow(1 - p, 3)

      setCountUp({

        totalAsset: from.totalAsset + (to.totalAsset - from.totalAsset) * ease,

        todayPnl: from.todayPnl + (to.todayPnl - from.todayPnl) * ease,

        holdings: from.holdings + (to.holdings - from.holdings) * ease,

        winRate: from.winRate + (to.winRate - from.winRate) * ease,

      })

      if (p < 1) rafRef.current = requestAnimationFrame(step)

    }

    cancelAnimationFrame(rafRef.current)

    rafRef.current = requestAnimationFrame(step)

    return () => cancelAnimationFrame(rafRef.current)

    // eslint-disable-next-line react-hooks/exhaustive-deps

  }, [loading, totals.totalAsset, totals.todayPnl, totals.holdings, totals.winRate])

  if (loading) {

    return <PositionsSkeleton />

  }

  const winColor = countUp.winRate >= 0.5 ? GREEN : RED

  const todayColor = countUp.todayPnl >= 0 ? GREEN : RED

  const deltaColor = deltaMock.delta >= 0 ? GREEN : RED

  return (

    <div className="space-y-12 text-[#1A1A1A] dark:text-zinc-100">

      <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">

        <div>

          <h1 className="text-[28px] font-extrabold tracking-tight text-[#1A1A1A] dark:text-white">

            {isEn ? 'Asset Dashboard' : '资产仪表盘'}

          </h1>

          <p className="mt-1 text-[13px] font-normal text-[#999] dark:text-zinc-500">

            {isEn
              ? 'See your full portfolio on one page: overview → assets → trade timeline → watchlist'
              : '在一个页面查看你的资产全貌：总览 → 标的 → 交易时间线 → 观望仓'}

          </p>

        </div>

        <Link

          to="/trade"

          className="inline-flex items-center gap-2 text-[12px] font-semibold text-[#666] transition-colors hover:text-black dark:text-zinc-400 dark:hover:text-white"

        >

          {isEn ? 'View all trade history →' : '查看全部交易流水 →'}

          <ExternalLink className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />

        </Link>

      </header>

      {/* Trade entry module (top) */}

      <section className="flex flex-col gap-3 rounded-2xl bg-white p-5 shadow-sm dark:bg-zinc-900 sm:flex-row sm:items-center sm:justify-between">

        <div className="flex flex-wrap items-center gap-2">

          <button

            type="button"

            onClick={() => openTradeWizard?.()}

            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-black px-4 text-[13px] font-semibold text-white transition-colors hover:bg-[#333] dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"

          >

            <Plus className="h-4 w-4" strokeWidth={2} aria-hidden />

            {isEn ? 'Record Trade' : '录入交易'}

          </button>

          <button

            type="button"

            disabled

            title={isEn ? 'Coming soon' : '即将上线'}

            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-[#F5F5F5] px-4 text-[13px] font-semibold text-[#999] transition-colors dark:bg-zinc-800 dark:text-zinc-500"

          >

            <Download className="h-4 w-4" strokeWidth={2} aria-hidden />

            {isEn ? 'Export Data' : '导出数据'}

          </button>

        </div>

        <div className="inline-flex rounded-full bg-[#F5F5F5] p-1 dark:bg-zinc-800">

          {[

            { key: 'all', label: isEn ? 'All' : '全部' },

            { key: 'open', label: isEn ? 'Open' : '持仓中' },

            { key: 'closed', label: isEn ? 'Closed' : '已平仓' },

          ].map((x) => (

            <button

              key={x.key}

              type="button"

              onClick={() => setStatusFilter(x.key)}

              className={`rounded-full px-3 py-1.5 text-[12px] font-semibold transition-colors ${

                statusFilter === x.key

                  ? 'bg-black text-white dark:bg-white dark:text-zinc-900'

                  : 'bg-transparent text-[#666] hover:text-black dark:text-zinc-300 dark:hover:text-white'

              }`}

            >

              {x.label}

            </button>

          ))}

        </div>

      </section>

      {/* 1) Overview cards */}

      <section className="grid gap-4 md:grid-cols-4">

        <div className="card-hover rounded-2xl bg-white p-5 shadow-sm transition-all duration-200 hover:-translate-y-[2px] hover:shadow-md dark:bg-zinc-900">

          <div className="flex items-center justify-between">

            <p className="text-[12px] font-semibold text-[#999] dark:text-zinc-500">{isEn ? 'Total Assets' : '总资产'}</p>

            <Wallet className="h-4 w-4 text-[#CCC] dark:text-zinc-600" strokeWidth={1.8} aria-hidden />

          </div>

          <div className="mt-2 font-mono text-[28px] font-extrabold tabular-nums text-[#1A1A1A] dark:text-white">

            ¥ {money(countUp.totalAsset)}

          </div>

          <div className="mt-1 text-[12px] font-semibold" style={{ color: deltaColor }}>

            {deltaMock.delta >= 0 ? '↑' : '↓'} {deltaMock.delta >= 0 ? '+' : '-'}¥{money(Math.abs(deltaMock.delta))} (

            {deltaMock.pctVal >= 0 ? '+' : '-'}

            {pct(Math.abs(deltaMock.pctVal))})

          </div>

        </div>

        <div className="card-hover rounded-2xl bg-white p-5 shadow-sm transition-all duration-200 hover:-translate-y-[2px] hover:shadow-md dark:bg-zinc-900">

          <div className="flex items-center justify-between">

            <p className="text-[12px] font-semibold text-[#999] dark:text-zinc-500">{isEn ? 'Today P&L' : '今日盈亏'}</p>

            <LineChart className="h-4 w-4 text-[#CCC] dark:text-zinc-600" strokeWidth={1.8} aria-hidden />

          </div>

          <div className="mt-2 font-mono text-[28px] font-extrabold tabular-nums" style={{ color: todayColor }}>

            {countUp.todayPnl >= 0 ? '+' : '-'}¥ {money(Math.abs(countUp.todayPnl))}

          </div>

          <div className="mt-1 text-[12px] font-semibold text-[#999] dark:text-zinc-500">{isEn ? 'vs yesterday' : '较昨日'}</div>

        </div>

        <div className="card-hover rounded-2xl bg-white p-5 shadow-sm transition-all duration-200 hover:-translate-y-[2px] hover:shadow-md dark:bg-zinc-900">

          <div className="flex items-center justify-between">

            <p className="text-[12px] font-semibold text-[#999] dark:text-zinc-500">{isEn ? 'Held Assets' : '持仓标的'}</p>

            <span className="text-[10px] font-bold text-[#CCC] dark:text-zinc-600">ACTIVE</span>

          </div>

          <div className="mt-2 font-mono text-[28px] font-extrabold tabular-nums text-[#1A1A1A] dark:text-white">

            {Math.round(countUp.holdings)}

          </div>

          <div className="mt-1 text-[12px] font-semibold text-[#999] dark:text-zinc-500">{isEn ? 'active holdings' : '个活跃持仓'}</div>

        </div>

        <div className="card-hover rounded-2xl bg-white p-5 shadow-sm transition-all duration-200 hover:-translate-y-[2px] hover:shadow-md dark:bg-zinc-900">

          <div className="flex items-center justify-between">

            <p className="text-[12px] font-semibold text-[#999] dark:text-zinc-500">{isEn ? 'Win Rate' : '胜率'}</p>

            <span className="text-[10px] font-bold text-[#CCC] dark:text-zinc-600">HISTORY</span>

          </div>

          <div className="mt-2 font-mono text-[28px] font-extrabold tabular-nums" style={{ color: winColor }}>

            {pct(countUp.winRate)}

          </div>

          <div className="mt-1 text-[12px] font-semibold text-[#999] dark:text-zinc-500">

            {isEn
              ? `Based on ${totals.closedTradesCount} closed trades`
              : `基于 ${totals.closedTradesCount} 笔已平仓交易`}

          </div>

        </div>

      </section>

      {/* 2) Charts */}

      <section className="grid gap-4 lg:grid-cols-2">

        <div className="rounded-2xl bg-white p-5 shadow-sm dark:bg-zinc-900">

          <div className="mb-4 flex items-baseline justify-between gap-3">

            <h2 className="text-[14px] font-extrabold text-[#1A1A1A] dark:text-white">{isEn ? 'Asset Distribution' : '资产分布'}</h2>

            <span className="text-[12px] font-semibold text-[#999] dark:text-zinc-500">{isEn ? 'Total held' : '总持仓'} ¥ {money(pieData.sum)}</span>

          </div>

          <div className="grid gap-5 sm:grid-cols-[240px_1fr] sm:items-center">

            <div className="h-[240px] w-full">

              {pieData.rows.length > 0 ? (

                <ResponsiveContainer width="100%" height={250}>

                  <PieChart>

                    <Pie

                      data={pieData.rows}

                      dataKey="value"

                      nameKey="name"

                      cx="50%"

                      cy="50%"

                      innerRadius={72}

                      outerRadius={104}

                      paddingAngle={1}

                      stroke="none"

                    >

                      {pieData.rows.map((_, i) => (

                        <Cell key={i} fill={GRAY_SCALE[i % GRAY_SCALE.length]} />

                      ))}

                    </Pie>

                    <Tooltip

                      formatter={(value, _name, item) => [

                        `¥ ${money(Number(value))}`,

                        item?.payload?.name ?? '',

                      ]}

                      contentStyle={{

                        borderRadius: 12,

                        border: '1px solid #F0F0F0',

                        fontSize: 12,

                        boxShadow: '0 8px 24px -8px rgba(0,0,0,0.1)',

                      }}

                    />

                  </PieChart>

                </ResponsiveContainer>

              ) : (

                <div className="flex h-full items-center justify-center rounded-2xl bg-[#FAFAFA] text-[12px] text-[#999] dark:bg-zinc-950/40 dark:text-zinc-500">

                  {isEn ? 'No allocation data yet' : '暂无占比数据'}

                </div>

              )}

            </div>

            <div className="min-w-0">

              <ul className="space-y-2">

                {pieData.rows.slice(0, 6).map((r, i) => {

                  const p = pieData.sum > 0 ? r.value / pieData.sum : 0

                  return (

                    <li key={r.assetId} className="flex items-center gap-3">

                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: GRAY_SCALE[i % GRAY_SCALE.length] }} />

                      <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-[#1A1A1A] dark:text-white">

                        {r.name}

                      </span>

                      <span className="font-mono text-[12px] font-semibold tabular-nums text-[#666] dark:text-zinc-300">

                        {pct(p)}

                      </span>

                    </li>

                  )

                })}

              </ul>

              {pieData.rows.length > 6 ? (

                <div className="mt-3 text-[12px] text-[#999] dark:text-zinc-500">{isEn ? `and ${pieData.rows.length - 6} more assets…` : `还有 ${pieData.rows.length - 6} 个标的…`}</div>

              ) : null}

            </div>

          </div>

        </div>

        <div className="rounded-2xl bg-white p-5 shadow-sm dark:bg-zinc-900">

          <div className="mb-4 flex items-baseline justify-between gap-3">

            <h2 className="text-[14px] font-extrabold text-[#1A1A1A] dark:text-white">{isEn ? 'P&L by Asset' : '各标的盈亏分布'}</h2>

            <span className="text-[12px] font-semibold text-[#999] dark:text-zinc-500">{isEn ? 'Closed-trade P&L summary (MVP)' : '已平仓盈亏汇总（MVP）'}</span>

          </div>

          <div className="h-[240px] w-full">

            <ResponsiveContainer width="100%" height={250}>

              <BarChart data={barData} margin={{ top: 10, right: 10, bottom: 10, left: 10 }}>

                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />

                <XAxis

                  dataKey="name"

                  tick={{ fontSize: 11, fill: '#999' }}

                  axisLine={false}

                  tickLine={false}

                />

                <YAxis

                  tick={{ fontSize: 11, fill: '#999' }}

                  axisLine={false}

                  tickLine={false}

                  width={44}

                />

                <Tooltip

                  formatter={(value) => [`¥ ${money(Number(value))}`, isEn ? 'P&L' : '盈亏']}

                  contentStyle={{

                    borderRadius: 12,

                    border: '1px solid #F0F0F0',

                    fontSize: 12,

                    boxShadow: '0 8px 24px -8px rgba(0,0,0,0.1)',

                  }}

                />

                <Bar dataKey="pnl" radius={[8, 8, 0, 0]}>

                  {barData.map((row, i) => (

                    <Cell key={i} fill={Number(row.pnl) >= 0 ? GREEN : RED} />

                  ))}

                </Bar>

              </BarChart>

            </ResponsiveContainer>

          </div>

        </div>

      </section>

      {/* 4) Asset cards */}

      <section>

        <div className="mb-5 flex items-baseline justify-between gap-4">

          <h2 className="text-lg font-extrabold text-[#1A1A1A] dark:text-white">{isEn ? 'Held Assets' : '持仓标的'}</h2>

          <span className="text-[13px] font-normal text-[#999] dark:text-zinc-500">

            {isEn ? `Total ${assetCards.length} assets` : `共 ${assetCards.length} 个标的`}

          </span>

        </div>

        {assetCards.length === 0 ? (

          <div className="flex flex-col items-center justify-center rounded-2xl bg-white px-8 py-16 text-center shadow-sm dark:bg-zinc-900">

            <p className="text-base font-medium text-[#666] dark:text-zinc-400">{t('positions.emptyReal')}</p>

            <button

              type="button"

              onClick={() => openTradeWizard?.()}

              className="mt-6 inline-flex rounded-xl bg-black px-6 py-2.5 text-sm font-semibold text-white transition-colors duration-200 hover:bg-[#333] dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"

            >

              {t('positions.goTrade')}

            </button>

          </div>

        ) : (

          <ul className="space-y-3">

            {assetCards.map((x, i) => {

              const a = x.asset

              const aid = x.assetId

              const expanded = expandedAssetId === aid

              const isClosed = x.status === 'closed'

              const bgCls = isClosed ? 'bg-[#FAFAFA] dark:bg-zinc-900/60' : 'bg-white dark:bg-zinc-900'

              const opacityCls = isClosed ? 'opacity-85' : 'opacity-100'

              const qtyText = Number.isFinite(Number(x.netQty)) ? Number(x.netQty).toLocaleString('zh-CN') : '—'

              const avgText = x.avgPrice ? Number(x.avgPrice).toFixed(3) : '—'

              const mv = x.currentValue != null ? x.currentValue : x.baseValue

              const mvText = `¥ ${money(mv)}`

              const floatPnl = x.floatingPnl

              const floatPnlPct = x.floatingPnlPct

              const showRt = x.rtPrice != null && x.currentValue != null && floatPnl != null

              const displayPnl = !isClosed && showRt ? floatPnl : x.pnl

              const displayPnlPct = !isClosed && showRt ? floatPnlPct : x.pnlPct

              const pnlColor = Number(displayPnl) >= 0 ? GREEN : RED

              const showAll = Boolean(showAllTradesByAsset[aid])

              const list = x.trades || []

              const shownTrades = showAll ? list : list.slice(0, list.length > 5 ? 3 : 5)

              return (

                <li key={aid} className="stagger-in" style={{ animationDelay: `${i * 40}ms` }}>

                  <div

                    role="button"

                    tabIndex={0}

                    onClick={() => setExpandedAssetId(expanded ? null : aid)}

                    onKeyDown={(e) => {

                      if (e.key === 'Enter' || e.key === ' ') {

                        e.preventDefault()

                        setExpandedAssetId(expanded ? null : aid)

                      }

                    }}

                    className={[

                      'card-hover w-full cursor-pointer rounded-2xl p-5 shadow-sm transition-all duration-200 hover:-translate-y-[1px] hover:shadow-md',

                      bgCls,

                      opacityCls,

                    ].join(' ')}

                  >

                    <div className="flex items-start justify-between gap-4">

                      <div className="min-w-0">

                        <div className="flex flex-wrap items-center gap-2">

                          <span className="text-[16px] font-bold text-[#1A1A1A] dark:text-white">{a?.name || '—'}</span>

                          <span className="font-mono text-[12px] text-[#999] dark:text-zinc-500">{a?.code || ''}</span>

                          <span className="rounded-full bg-[#F5F5F5] px-2.5 py-0.5 text-[11px] font-semibold text-[#666] dark:bg-zinc-800 dark:text-zinc-300">

                            {assetTypeLabel(a?.asset_type, isEn)}

                          </span>

                          {isClosed ? (

                            <span className="rounded-full bg-[#F0F0F0] px-2.5 py-0.5 text-[11px] font-semibold text-[#777] dark:bg-zinc-800 dark:text-zinc-400">

                              {isEn ? 'Closed' : '已平仓'}

                            </span>

                          ) : null}

                        </div>

                        <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-1 text-[13px] text-[#666] dark:text-zinc-300">

                          <span className="font-mono tabular-nums">

                            {isEn ? `${qtyText} × Avg ${avgText}` : `${qtyText} × 均价 ${avgText}`}

                          </span>

                          <span className="font-mono tabular-nums">{isEn ? `Market value ${mvText}` : `市值 ${mvText}`}</span>

                          {!isClosed && (

                            <span className="font-mono tabular-nums text-[#999] dark:text-zinc-500">

                              {x.rtPrice != null ? (isEn ? `Live ${Number(x.rtPrice).toFixed(2)}` : `现价 ${Number(x.rtPrice).toFixed(2)}`) : isEn ? 'Live quote unavailable' : '行情暂不可用'}

                            </span>

                          )}

                        </div>

                      </div>

                      <div className="flex shrink-0 items-center gap-4">

                        <div className="text-right">

                          <div className="font-mono text-[14px] font-semibold tabular-nums" style={{ color: pnlColor }}>

                            {displayPnl >= 0 ? '+' : '-'}¥ {money(Math.abs(displayPnl))}

                          </div>

                          <div className="font-mono text-[12px] font-semibold tabular-nums" style={{ color: pnlColor }}>

                            {Number(displayPnlPct) >= 0 ? '+' : '-'}

                            {pct(Math.abs(Number(displayPnlPct) || 0))}

                          </div>

                        </div>

                        <div

                          className={[

                            'inline-flex h-9 w-9 items-center justify-center rounded-full bg-[#F5F5F5] transition-transform duration-300 dark:bg-zinc-800',

                            expanded ? 'rotate-180' : 'rotate-0',

                          ].join(' ')}

                        >

                          <ChevronDown className="h-4 w-4 text-[#666] dark:text-zinc-300" strokeWidth={2} aria-hidden />

                        </div>

                      </div>

                    </div>

                    {/* Expand area */}

                    <div

                      className={[

                        'overflow-hidden transition-[max-height,opacity] duration-300 ease-out',

                        expanded ? 'mt-5 max-h-[960px] opacity-100' : 'max-h-0 opacity-0',

                      ].join(' ')}

                    >

                      <div className="rounded-xl bg-white/60 p-4 dark:bg-zinc-950/20">

                        <div className="mb-3 flex items-center justify-between">

                          <p className="text-[12px] font-semibold text-[#999] dark:text-zinc-500">{isEn ? 'Trade Records' : '交易记录'}</p>

                          <p className="text-[12px] font-semibold text-[#999] dark:text-zinc-500">{isEn ? `Total ${list.length} trades` : `共 ${list.length} 笔`}</p>

                        </div>

                        {list.length === 0 ? (

                          <div className="rounded-xl bg-white p-4 text-[13px] text-[#999] dark:bg-zinc-900 dark:text-zinc-500">

                            {isEn ? 'No trade records' : '暂无交易记录'}

                          </div>

                        ) : (

                          <div className="relative pl-5">

                            <div className="absolute left-2.5 top-2 h-[calc(100%-8px)] w-[2px] rounded bg-[#E5E5E5] dark:bg-zinc-800" />

                            <div className="space-y-3">

                              {shownTrades.map((tr) => {

                                const dir = tr.direction === 'sell' ? 'sell' : 'buy'

                                const nodeCls = dir === 'buy' ? 'bg-[#22C55E]' : 'bg-[#EF4444]'

                                const tagCls =

                                  dir === 'buy'

                                    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/10 dark:text-emerald-300'

                                    : 'bg-red-50 text-red-700 dark:bg-red-900/10 dark:text-red-300'

                                const hasReply = Boolean(tr.agent_question_sent) && Boolean(tr.agent_question_text)

                                return (

                                  <div key={tr.id} className="relative">

                                    <span className={`absolute left-[3px] top-4 h-3.5 w-3.5 rounded-full ${nodeCls}`} />

                                    <div className="ml-4 rounded-2xl bg-white p-4 shadow-sm dark:bg-zinc-900">

                                      <div className="flex flex-wrap items-center justify-between gap-2">

                                        <div className="flex items-center gap-2">

                                          <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${tagCls}`}>

                                            {directionLabel(dir, isEn)}

                                          </span>

                                          <span className="text-[12px] font-semibold text-[#666] dark:text-zinc-300">

                                            {whenText(tr.traded_at, dateLocale)}

                                          </span>

                                          {hasReply ? (

                                            <span className="text-[12px] text-[#999] dark:text-zinc-500" title={isEn ? 'Has follow-up' : '有追问'}>

                                              

                                            </span>

                                          ) : null}

                                        </div>

                                        <span className="font-mono text-[12px] font-semibold tabular-nums text-[#999] dark:text-zinc-500">

                                          {emotionEmoji(tr.emotion_score)} {confidenceTag(tr.confidence_score, isEn)}

                                        </span>

                                      </div>

                                      <div className="mt-2 font-mono text-[12.5px] tabular-nums text-[#1A1A1A] dark:text-white">

                                        ¥{money(Number(tr.price))} × {Number(tr.quantity).toLocaleString('zh-CN')} = ¥

                                        {money(Number(tr.price) * Number(tr.quantity))}

                                      </div>

                                      {tr.decision_note ? (

                                        <div className="mt-3 rounded-xl bg-[#FAFAFA] p-3 text-[12px] leading-relaxed text-[#666] dark:bg-zinc-950/40 dark:text-zinc-300">

                                          <div className="border-l-[3px] border-black/15 pl-3 dark:border-white/10">

                                            <div className="line-clamp-3">{tr.decision_note}</div>

                                          </div>

                                        </div>

                                      ) : null}

                                    </div>

                                  </div>

                                )

                              })}

                            </div>

                          </div>

                        )}

                        {list.length > 5 ? (

                          <div className="mt-4 flex items-center justify-between">

                            <button

                              type="button"

                              onClick={(e) => {

                                e.stopPropagation()

                                setShowAllTradesByAsset((prev) => ({ ...prev, [aid]: !prev[aid] }))

                              }}

                              className="text-[12px] font-semibold text-[#666] transition-colors hover:text-black dark:text-zinc-400 dark:hover:text-white"

                            >

                              {showAll ? (isEn ? 'Collapse' : '收起') : isEn ? `View all ${list.length} trades` : `查看全部 ${list.length} 笔`}

                            </button>

                            <div className="flex items-center gap-3">

                              <button

                                type="button"

                                onClick={(e) => {

                                  e.stopPropagation()

                                  navigate(`/asset/${aid}`)

                                }}

                                className="text-[12px] font-semibold text-[#666] transition-colors hover:text-black dark:text-zinc-400 dark:hover:text-white"

                              >

                                {isEn ? 'View Asset Detail' : '查看标的详情'}

                              </button>

                              <button

                                type="button"

                                onClick={(e) => {

                                  e.stopPropagation()

                                  openTradeWizard?.()

                                }}

                                className="inline-flex h-9 items-center justify-center rounded-xl bg-black px-3 text-[12px] font-semibold text-white transition-colors hover:bg-[#333] dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"

                              >

                                {isEn ? 'Add Trade' : '添加交易'}

                              </button>

                            </div>

                          </div>

                        ) : (

                          <div className="mt-4 flex items-center justify-end gap-3">

                            <button

                              type="button"

                              onClick={(e) => {

                                e.stopPropagation()

                                navigate(`/asset/${aid}`)

                              }}

                              className="text-[12px] font-semibold text-[#666] transition-colors hover:text-black dark:text-zinc-400 dark:hover:text-white"

                            >

                              {isEn ? 'View Asset Detail' : '查看标的详情'}

                            </button>

                            <button

                              type="button"

                              onClick={(e) => {

                                e.stopPropagation()

                                openTradeWizard?.()

                              }}

                              className="inline-flex h-9 items-center justify-center rounded-xl bg-black px-3 text-[12px] font-semibold text-white transition-colors hover:bg-[#333] dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"

                            >

                              {isEn ? 'Add Trade' : '添加交易'}

                            </button>

                          </div>

                        )}

                      </div>

                    </div>

                  </div>

                </li>

              )

            })}

          </ul>

        )}

      </section>

      {/* 5) Shadow watchlist */}

      <section className="pt-4">

        <div className="mb-6 mt-12 flex items-center justify-between gap-4">

          <h2 className="text-lg font-extrabold text-[#1A1A1A] dark:text-white">{isEn ? 'My Watchlist' : '我的观望仓'}</h2>

          <Link

            to="/shadow"

            className="text-[12px] font-semibold text-[#666] transition-colors hover:text-black dark:text-zinc-400 dark:hover:text-white"

          >

            {isEn ? 'Add watchlist asset →' : '添加观望标的 →'}

          </Link>

        </div>

        {shadows.length === 0 ? (

          <div className="rounded-2xl border border-dashed border-[#E0E0E0] bg-[#FAFAFA] px-8 py-14 text-center dark:border-zinc-800 dark:bg-zinc-950/20">

            <p className="text-sm font-normal text-[#999] dark:text-zinc-500">

              {isEn ? 'Add assets you are watching to preview KeeFoo insights' : '添加你观望中的标的，提前感受 KeeFoo 的分析能力'}

            </p>

          </div>

        ) : (

          <ul className="grid gap-4 md:grid-cols-2">

            {shadows.map((sp, i) => {

              const asset = sp.asset

              if (!asset) return null

              const isMissed = sp.shadow_type === 'missed'

              const label = isMissed ? (isEn ? 'Missed Opportunity' : '错过的机会') : isEn ? 'Watching' : '观望中'

              const tagCls = isMissed ? 'bg-[#FFF7ED] text-[#C2410C]' : 'bg-[#F5F5F5] text-[#555]'

              const hypo =

                sp.hypothetical_entry_price != null ? Number(sp.hypothetical_entry_price).toFixed(4) : '—'

              const scenario = scenarioByShadowId[String(sp.id)]

              return (

                <li key={sp.id} className="stagger-in" style={{ animationDelay: `${i * 60}ms` }}>

                  <div

                    role="button"

                    tabIndex={0}

                    onClick={() => navigate(`/asset/${asset.id}`)}

                    onKeyDown={(e) => {

                      if (e.key === 'Enter' || e.key === ' ') {

                        e.preventDefault()

                        navigate(`/asset/${asset.id}`)

                      }

                    }}

                    className="card-hover cursor-pointer rounded-2xl border border-dashed border-[#E0E0E0] bg-white p-5 shadow-sm transition-all duration-200 hover:-translate-y-[1px] hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900"

                  >

                    <div className="flex items-start justify-between gap-2">

                      <span className={`inline-block rounded-full px-2.5 py-0.5 text-[11px] font-medium ${tagCls}`}>

                        {label}

                      </span>

                    </div>

                    <div className="mt-3 text-base font-bold text-[#1A1A1A] dark:text-white">{asset.name}</div>

                    <div className="font-mono text-[12px] text-[#999] dark:text-zinc-500">{asset.code}</div>

                    <p className="mt-3 text-[13px] text-[#666] dark:text-zinc-300">

                      {isEn ? 'Hypothetical entry' : '假设建仓价'} <span className="font-mono font-medium text-[#1A1A1A] dark:text-white">{hypo}</span>

                    </p>

                    {scenario ? (

                      <div className="mt-4 rounded-xl bg-[#FAFAFA] p-4 dark:bg-zinc-950/30">

                        <p className="text-[11px] font-semibold text-[#999] dark:text-zinc-500">{isEn ? 'Scenario Simulation' : '情景推演'}</p>

                        <p className="mt-2 text-[13px] font-semibold text-[#1A1A1A] dark:text-white">

                          {scenario.event_title || '—'}

                        </p>

                        <p className="mt-2 text-[12px] leading-relaxed text-[#555] dark:text-zinc-300">

                          {scenario.scenario_text}

                        </p>

                      </div>

                    ) : null}

                  </div>

                </li>

              )

            })}

          </ul>

        )}

      </section>

      <style>{`

        @keyframes dash-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }

        .stagger-in { animation: dash-in 260ms ease-out both; }

      `}</style>

    </div>

  )

}

