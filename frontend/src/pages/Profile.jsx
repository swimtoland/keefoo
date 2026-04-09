import { useEffect, useMemo, useState } from 'react'
import { UserCircle } from 'lucide-react'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
} from 'recharts'
import { getStrategyProfile, getTrades } from '../api'
import { useAuth } from '../contexts/AuthContext.jsx'
import { useUiPreferences } from '../contexts/UiPreferencesContext.jsx'

const SECTOR_GRAY = ['#1A1A1A', '#525252', '#737373', '#A3A3A3', '#D4D4D4', '#E5E5E5']

function formatPnl(n, dateLocale) {
  const v = Number(n)
  if (!Number.isFinite(v)) return '—'
  const sign = v > 0 ? '+' : ''
  return `${sign}${v.toLocaleString(dateLocale, { maximumFractionDigits: 0 })}`
}

export default function Profile() {
  const { user } = useAuth()
  const { t: tr, dateLocale, theme } = useUiPreferences()
  const userId = user?.id
  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState(null)
  const [trades, setTrades] = useState([])

  useEffect(() => {
    if (!userId) return
    let cancelled = false
    ;(async () => {
      await Promise.resolve()
      if (cancelled) return
      setLoading(true)
      try {
        const [prof, tr] = await Promise.all([
          getStrategyProfile(userId),
          getTrades(userId),
        ])
        if (!cancelled) {
          setProfile(prof)
          setTrades(Array.isArray(tr) ? tr : [])
        }
      } catch {
        if (!cancelled) {
          setProfile({ has_data: false, message: tr('profile.loadFail') })
          setTrades([])
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [userId, tr])

  const hasData = profile?.has_data === true
  const time = profile?.time_analysis
  const asset = profile?.asset_analysis
  const behavior = profile?.behavior_analysis
  const bias = profile?.bias_analysis

  const pnlByAsset = useMemo(() => {
    const m = {}
    for (const t of trades) {
      const aid = t.asset_id
      if (!aid) continue
      const p = t.pnl != null ? Number(t.pnl) : 0
      m[aid] = (m[aid] || 0) + p
    }
    return m
  }, [trades])

  const holdingBars = useMemo(() => {
    const dist = time?.holding_period_distribution || []
    return dist.map((d) => ({
      range: d.range?.replace('天', '天') || d.range,
      count: d.count,
    }))
  }, [time])

  const monthLine = useMemo(() => {
    const arr = time?.trade_frequency_by_month || []
    return arr.map((d) => ({
      month: d.month,
      count: d.count,
    }))
  }, [time])

  const decisionTypes = useMemo(
    () => [
      { key: 'event_driven', label: tr('profile.decisionEvent') },
      { key: 'technical', label: tr('profile.decisionTechnical') },
      { key: 'fundamental', label: tr('profile.decisionFundamental') },
      { key: 'sentiment', label: tr('profile.decisionSentiment') },
    ],
    [tr],
  )

  const sectorPie = useMemo(() => {
    const rows = asset?.sector_distribution || []
    return rows.map((r) => ({
      name: r.sector || tr('profile.uncategorized'),
      value: r.count,
      pnl: r.pnl,
    }))
  }, [asset, tr])

  const topFive = useMemo(() => {
    const list = asset?.top_traded_assets || []
    return list.map((row) => ({
      ...row,
      pnlSum: pnlByAsset[row.asset_id] ?? null,
    }))
  }, [asset, pnlByAsset])

  const decisionDist = useMemo(
    () => profile?.behavior_analysis?.decision_type_distribution ?? {},
    [profile],
  )
  const decisionTotal = useMemo(() => {
    return Object.values(decisionDist).reduce((a, b) => a + Number(b || 0), 0) || 1
  }, [decisionDist])

  const decisionPercents = useMemo(() => {
    const out = {}
    for (const { key } of decisionTypes) {
      const c = Number(decisionDist[key] || 0)
      out[key] = (c / decisionTotal) * 100
    }
    return out
  }, [decisionDist, decisionTotal, decisionTypes])

  const maxDecisionKey = useMemo(() => {
    let max = -1
    let k = decisionTypes[0]?.key ?? 'event_driven'
    for (const { key } of decisionTypes) {
      const c = Number(decisionDist[key] || 0)
      if (c > max) {
        max = c
        k = key
      }
    }
    return k
  }, [decisionDist, decisionTypes])

  const radarData = useMemo(() => {
    if (!bias) return []
    return [
      {
        subject: tr('profile.biasDisposition'),
        explainKey: 'profile.biasExplainDisposition',
        key: 'disposition_score',
        A: Number(bias.disposition_score) || 0,
        fullMark: 100,
      },
      {
        subject: tr('profile.biasOvertrading'),
        explainKey: 'profile.biasExplainOvertrading',
        key: 'overtrading_score',
        A: Number(bias.overtrading_score) || 0,
        fullMark: 100,
      },
      {
        subject: tr('profile.biasEmotional'),
        explainKey: 'profile.biasExplainEmotional',
        key: 'emotional_score',
        A: Number(bias.emotional_score) || 0,
        fullMark: 100,
      },
      {
        subject: tr('profile.biasFomo'),
        explainKey: 'profile.biasExplainFomo',
        key: 'fomo_score',
        A: Number(bias.fomo_score) || 0,
        fullMark: 100,
      },
    ]
  }, [bias, tr])

  const gridStroke = theme === 'dark' ? '#3f3f46' : '#E5E5E5'
  const axisColor = theme === 'dark' ? '#a1a1aa' : '#999'
  const primaryFill = theme === 'dark' ? '#e4e4e7' : '#1A1A1A'
  const mutedColor = theme === 'dark' ? '#a1a1aa' : '#999'
  const pieStroke = theme === 'dark' ? '#18181b' : '#fff'
  const tooltipBoxStyle =
    theme === 'dark'
      ? {
          borderRadius: 8,
          fontSize: 12,
          backgroundColor: '#27272a',
          color: '#fafafa',
          border: '1px solid #3f3f46',
        }
      : { borderRadius: 8, fontSize: 12 }
  const radarGrid = theme === 'dark' ? '#3f3f46' : '#E5E5E5'
  const radarStroke = theme === 'dark' ? '#fafafa' : '#1A1A1A'
  const radarFill = theme === 'dark' ? '#52525b' : '#E5E5E5'

  const avgConf = behavior?.avg_confidence_by_result || {}

  return (
    <div className="animate-fade-in-up space-y-10 text-[#1A1A1A] dark:text-zinc-100">
      <header className="space-y-2">
        <h1
          className="text-[28px] font-extrabold tracking-tight text-black dark:text-white"
          style={{ fontWeight: 800 }}
        >
          {tr('profile.title')}
        </h1>
        <p className="text-[14px] leading-relaxed text-[#888] dark:text-zinc-500">
          {tr('profile.profileSubtitle')}
        </p>
      </header>

      {loading && (
        <div className="flex items-center justify-center py-24 text-[14px] text-[#999] dark:text-zinc-500">
          {tr('profile.loading')}
        </div>
      )}

      {!loading && !hasData && (
        <div className="flex flex-col items-center justify-center rounded-2xl bg-white px-8 py-20 shadow-sm dark:bg-zinc-900 dark:shadow-none dark:ring-1 dark:ring-zinc-800">
          <UserCircle
            className="mb-4 h-16 w-16 text-[#CCC] dark:text-zinc-600"
            strokeWidth={1.1}
            aria-hidden
          />
          <p className="max-w-sm text-center text-[15px] leading-relaxed text-[#666] dark:text-zinc-400">
            {profile?.message || tr('profile.emptyHint')}
          </p>
        </div>
      )}

      {!loading && hasData && time && asset && behavior && bias && (
        <>
          <section className="space-y-4">
            <h2 className="text-[17px] font-bold text-black dark:text-white">
              {tr('profile.timeSection')}
            </h2>
            <div className="grid gap-6 lg:grid-cols-2">
              <div className="rounded-2xl bg-white p-5 shadow-sm dark:bg-zinc-900 dark:shadow-none dark:ring-1 dark:ring-zinc-800">
                <div className="mb-4 text-[12px] font-medium text-[#999] dark:text-zinc-500">
                  {tr('profile.holdingDist')}
                </div>
                <div className="h-[260px] w-full">
                  <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={holdingBars} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
                      <XAxis
                        dataKey="range"
                        tick={{ fill: axisColor, fontSize: 11 }}
                        axisLine={{ stroke: gridStroke }}
                        tickLine={false}
                      />
                      <YAxis
                        tick={{ fill: axisColor, fontSize: 11 }}
                        axisLine={false}
                        tickLine={false}
                        allowDecimals={false}
                      />
                      <Tooltip
                        formatter={(v) => [v, tr('profile.tooltipCount')]}
                        contentStyle={tooltipBoxStyle}
                      />
                      <Bar dataKey="count" fill={primaryFill} radius={[4, 4, 0, 0]} maxBarSize={48} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div className="rounded-2xl bg-white p-5 shadow-sm dark:bg-zinc-900 dark:shadow-none dark:ring-1 dark:ring-zinc-800">
                <div className="mb-4 text-[12px] font-medium text-[#999] dark:text-zinc-500">
                  {tr('profile.monthFreq')}
                </div>
                <div className="h-[260px] w-full">
                  <ResponsiveContainer width="100%" height={200}>
                    <LineChart data={monthLine} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
                      <XAxis
                        dataKey="month"
                        tick={{ fill: axisColor, fontSize: 11 }}
                        axisLine={{ stroke: gridStroke }}
                        tickLine={false}
                      />
                      <YAxis
                        tick={{ fill: axisColor, fontSize: 11 }}
                        axisLine={false}
                        tickLine={false}
                        allowDecimals={false}
                      />
                      <Tooltip contentStyle={tooltipBoxStyle} />
                      <Line
                        type="monotone"
                        dataKey="count"
                        stroke={primaryFill}
                        strokeWidth={2}
                        dot={{ r: 3, fill: primaryFill }}
                        activeDot={{ r: 5 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </section>

          <section className="space-y-4">
            <h2 className="text-[17px] font-bold text-black dark:text-white">
              {tr('profile.assetSection')}
            </h2>
            <div className="grid gap-6 lg:grid-cols-2">
              <div className="rounded-2xl bg-white p-5 shadow-sm dark:bg-zinc-900 dark:shadow-none dark:ring-1 dark:ring-zinc-800">
                <div className="mb-2 text-[12px] font-medium text-[#999] dark:text-zinc-500">
                  {tr('profile.sectorDist')}
                </div>
                <div className="h-[280px] w-full">
                  <ResponsiveContainer width="100%" height={250}>
                    <PieChart>
                      <Pie
                        data={sectorPie}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={56}
                        outerRadius={88}
                        paddingAngle={2}
                      >
                        {sectorPie.map((_, i) => (
                          <Cell
                            key={i}
                            fill={SECTOR_GRAY[i % SECTOR_GRAY.length]}
                            stroke={pieStroke}
                            strokeWidth={1}
                          />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(v, _n, p) => {
                          const pnl = p?.payload?.pnl
                          const mid =
                            pnl != null
                              ? ` · ${tr('profile.pnlLabel')} ${formatPnl(pnl, dateLocale)}`
                              : ''
                          return [`${v} ${tr('profile.unitTrades')}${mid}`, p.payload.name]
                        }}
                        contentStyle={tooltipBoxStyle}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div className="rounded-2xl bg-white p-5 shadow-sm dark:bg-zinc-900 dark:shadow-none dark:ring-1 dark:ring-zinc-800">
                <div className="mb-4 text-[12px] font-medium text-[#999] dark:text-zinc-500">
                  {tr('profile.topFiveTitle')}
                </div>
                <ul className="divide-y divide-[#F0F0F0] dark:divide-zinc-800">
                  {topFive.map((row, idx) => (
                    <li
                      key={row.asset_id || idx}
                      className="flex items-center justify-between gap-3 py-3 first:pt-0"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-[14px] font-semibold text-black dark:text-white">
                          {row.name}
                        </div>
                        <div className="text-[12px] text-[#AAA] dark:text-zinc-500">{row.code}</div>
                      </div>
                      <div className="shrink-0 text-right text-[13px]">
                        <div className="tabular-nums text-[#666] dark:text-zinc-400">
                          {row.trade_count} {tr('profile.unitTrades')}
                        </div>
                        <div
                          className={[
                            'mt-0.5 text-[13px] font-semibold tabular-nums',
                            row.pnlSum == null
                              ? 'text-[#AAA] dark:text-zinc-500'
                              : row.pnlSum > 0
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : row.pnlSum < 0
                                  ? 'text-red-500 dark:text-red-400'
                                  : 'text-[#666] dark:text-zinc-400',
                          ].join(' ')}
                        >
                          {row.pnlSum == null
                            ? tr('profile.cumPnlUnknown')
                            : tr('profile.cumPnl').replace(
                                '{v}',
                                formatPnl(row.pnlSum, dateLocale),
                              )}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </section>

          <section className="space-y-4">
            <h2 className="text-[17px] font-bold text-black dark:text-white">
              {tr('profile.behaviorSection')}
            </h2>
            <div className="grid grid-cols-2 gap-3 gap-y-4 lg:grid-cols-4">
              {decisionTypes.map(({ key, label }) => {
                const pct = decisionPercents[key] ?? 0
                const highlight = key === maxDecisionKey && Number(decisionDist[key] || 0) > 0
                return (
                  <div
                    key={key}
                    className="rounded-2xl bg-white p-4 text-center shadow-sm dark:bg-zinc-900 dark:shadow-none dark:ring-1 dark:ring-zinc-800"
                  >
                    <div className="text-[12px] text-[#999] dark:text-zinc-500">{label}</div>
                    <div
                      className={[
                        'mt-2 text-[22px] tabular-nums',
                        highlight
                          ? 'font-extrabold text-black dark:text-white'
                          : 'font-semibold text-[#444] dark:text-zinc-400',
                      ].join(' ')}
                    >
                      {pct.toFixed(1)}%
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl bg-white p-5 shadow-sm dark:bg-zinc-900 dark:shadow-none dark:ring-1 dark:ring-zinc-800">
                <div className="text-[12px] text-[#999] dark:text-zinc-500">
                  {tr('profile.stopLossRate')}
                </div>
                <div className="mt-2 text-[26px] font-bold tabular-nums text-black dark:text-white">
                  {Number(behavior.stop_loss_rate ?? 0).toFixed(1)}
                  <span className="text-[14px] font-semibold text-[#999] dark:text-zinc-500">%</span>
                </div>
                <p className="mt-2 text-[11px] text-[#AAA] dark:text-zinc-500">
                  {tr('profile.stopLossHint')}
                </p>
              </div>
              <div className="rounded-2xl bg-white p-5 shadow-sm dark:bg-zinc-900 dark:shadow-none dark:ring-1 dark:ring-zinc-800">
                <div className="text-[12px] text-[#999] dark:text-zinc-500">
                  {tr('profile.takeProfitRate')}
                </div>
                <div className="mt-2 text-[26px] font-bold tabular-nums text-black dark:text-white">
                  {Number(behavior.take_profit_rate ?? 0).toFixed(1)}
                  <span className="text-[14px] font-semibold text-[#999] dark:text-zinc-500">%</span>
                </div>
                <p className="mt-2 text-[11px] text-[#AAA] dark:text-zinc-500">
                  {tr('profile.takeProfitHint')}
                </p>
              </div>
            </div>
            <div className="rounded-2xl bg-white p-5 shadow-sm dark:bg-zinc-900 dark:shadow-none dark:ring-1 dark:ring-zinc-800">
              <div className="text-[13px] font-semibold text-black dark:text-white">
                {tr('profile.avgConfTitle')}
              </div>
              <div className="mt-4 grid grid-cols-2 gap-4 sm:gap-8">
                <div className="rounded-xl bg-[#F7F7F7] px-4 py-4 dark:bg-zinc-800">
                  <div className="text-[12px] text-[#888] dark:text-zinc-400">
                    {tr('profile.winningTrades')}
                  </div>
                  <div className="mt-1 text-[24px] font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
                    {avgConf.winning != null ? avgConf.winning : '—'}
                  </div>
                </div>
                <div className="rounded-xl bg-[#F7F7F7] px-4 py-4 dark:bg-zinc-800">
                  <div className="text-[12px] text-[#888] dark:text-zinc-400">
                    {tr('profile.losingTrades')}
                  </div>
                  <div className="mt-1 text-[24px] font-bold tabular-nums text-red-600 dark:text-red-400">
                    {avgConf.losing != null ? avgConf.losing : '—'}
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="space-y-4">
            <h2 className="text-[17px] font-bold text-black dark:text-white">
              {tr('profile.biasPortrait')}
            </h2>
            <div className="rounded-2xl bg-white p-5 shadow-sm dark:bg-zinc-900 dark:shadow-none dark:ring-1 dark:ring-zinc-800">
              <div className="mx-auto h-[320px] w-full max-w-[420px]">
                <ResponsiveContainer width="100%" height={300}>
                  <RadarChart cx="50%" cy="50%" outerRadius="78%" data={radarData}>
                    <PolarGrid stroke={radarGrid} />
                    <PolarAngleAxis
                      dataKey="subject"
                      tick={{ fill: mutedColor, fontSize: 11 }}
                    />
                    <PolarRadiusAxis
                      angle={90}
                      domain={[0, 100]}
                      tick={false}
                      axisLine={false}
                    />
                    <Radar
                      name={tr('profile.radarName')}
                      dataKey="A"
                      stroke={radarStroke}
                      fill={radarFill}
                      fillOpacity={0.45}
                      strokeWidth={1.5}
                    />
                    <Tooltip
                      formatter={(v) => [v, tr('profile.radarTooltip')]}
                      contentStyle={tooltipBoxStyle}
                    />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
              <ul className="mt-6 space-y-3 border-t border-[#F0F0F0] pt-5 dark:border-zinc-800">
                {radarData.map((row) => (
                  <li
                    key={row.key}
                    className="text-[13px] leading-relaxed text-[#666] dark:text-zinc-400"
                  >
                    <span className="font-semibold text-black dark:text-white">{row.subject}：</span>
                    {tr(row.explainKey)}
                  </li>
                ))}
              </ul>
            </div>
          </section>
        </>
      )}
    </div>
  )
}
