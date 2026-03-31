import { useEffect, useMemo, useState } from 'react'
import { BarChart3 } from 'lucide-react'
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
} from 'recharts'
import { getReport, getBiases } from '../api'
import { useAuth } from '../contexts/AuthContext.jsx'
import { useUiPreferences } from '../contexts/UiPreferencesContext.jsx'

const NOTE_SOURCE_I18N = {
  user_input: 'report.noteUserInput',
  agent_parsed: 'report.noteAgentParsed',
  silence_inferred: 'report.noteSilenceInferred',
  none: 'report.noteNone',
}

const PIE_GRAY = ['#1A1A1A', '#737373', '#A3A3A3', '#D4D4D4', '#E5E5E5']

function formatMoney(n, dateLocale) {
  const v = Number(n)
  if (!Number.isFinite(v)) return '—'
  const sign = v > 0 ? '+' : ''
  return `${sign}${v.toLocaleString(dateLocale, { maximumFractionDigits: 0 })}`
}

function biasBarColor(score) {
  if (score > 70) return '#EF4444'
  if (score >= 30) return '#F97316'
  return '#22C55E'
}

export default function Report() {
  const { user } = useAuth()
  const { t: tr, dateLocale, theme } = useUiPreferences()
  const userId = user?.id

  const periods = [
    { key: 'weekly', label: tr('report.periodWeekly') },
    { key: 'monthly', label: tr('report.periodMonthly') },
    { key: 'quarterly', label: tr('report.periodQuarterly') },
  ]
  const [period, setPeriod] = useState('weekly')
  const [loading, setLoading] = useState(true)
  const [report, setReport] = useState(null)
  const [biasPayload, setBiasPayload] = useState(null)

  useEffect(() => {
    if (!userId) return
    let cancelled = false
    ;(async () => {
      await Promise.resolve()
      if (cancelled) return
      setLoading(true)
      try {
        const [rep, bias] = await Promise.all([
          getReport(userId, period),
          getBiases(userId),
        ])
        if (!cancelled) {
          setReport(rep)
          setBiasPayload(bias)
        }
      } catch {
        if (!cancelled) {
          setReport({ has_data: false, message: tr('report.loadFail') })
          setBiasPayload(null)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [period, userId, tr])

  const hasData = report?.has_data === true
  const summary = report?.summary
  const behavior = report?.behavior
  const biasesText = report?.biases
  const aiCommentary = report?.ai_commentary
  const biasHasData = biasPayload?.has_data === true

  const pieData = useMemo(() => {
    const dist = behavior?.note_source_distribution || {}
    return Object.entries(dist).map(([k, v]) => ({
      name: NOTE_SOURCE_I18N[k] ? tr(NOTE_SOURCE_I18N[k]) : k,
      value: Number(v) || 0,
    }))
  }, [behavior?.note_source_distribution, tr])

  const biasRows = useMemo(
    () => [
      {
        scoreKey: 'disposition_score',
        label: tr('report.biasDisposition'),
        reportTextKey: 'disposition_effect',
      },
      {
        scoreKey: 'overtrading_score',
        label: tr('report.biasOvertrading'),
        reportTextKey: 'overtrading',
      },
      {
        scoreKey: 'emotional_score',
        label: tr('report.biasEmotional'),
        reportTextKey: 'emotional_trading',
      },
    ],
    [tr],
  )

  const pieStroke = theme === 'dark' ? '#18181b' : '#fff'
  const tooltipBoxStyle =
    theme === 'dark'
      ? {
          borderRadius: 8,
          border: '1px solid #3f3f46',
          fontSize: 12,
          backgroundColor: '#27272a',
          color: '#fafafa',
        }
      : {
          borderRadius: 8,
          border: '1px solid #EEE',
          fontSize: 12,
        }

  const descriptions = biasPayload?.descriptions || {}

  const threeScores = biasHasData
    ? [
        Number(biasPayload.disposition_score) || 0,
        Number(biasPayload.overtrading_score) || 0,
        Number(biasPayload.emotional_score) || 0,
      ]
    : [0, 0, 0]

  const allLow =
    biasHasData && threeScores.every((s) => s < 30)

  return (
    <div className="animate-fade-in-up space-y-8 text-[#1A1A1A] dark:text-zinc-100">
      <header className="space-y-5">
        <h1
          className="text-[28px] font-extrabold tracking-tight text-black dark:text-white"
          style={{ fontWeight: 800 }}
        >
          {tr('report.title')}
        </h1>
        <p className="text-[13px] text-[#888] dark:text-zinc-500">{tr('report.subtitle')}</p>
        <div className="flex flex-wrap gap-2">
          {periods.map((p) => {
            const active = period === p.key
            return (
              <button
                key={p.key}
                type="button"
                onClick={() => setPeriod(p.key)}
                disabled={loading}
                className={[
                  'rounded-full px-5 py-2 text-[14px] font-medium transition-colors',
                  active
                    ? 'bg-black text-white dark:bg-white dark:text-black'
                    : 'bg-[#ECECEC] text-[#888] hover:bg-[#E0E0E0] dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700',
                ].join(' ')}
              >
                {p.label}
              </button>
            )
          })}
        </div>
      </header>

      {loading && (
        <div className="flex items-center justify-center py-24 text-[14px] text-[#999] dark:text-zinc-500">
          {tr('report.loading')}
        </div>
      )}

      {!loading && !hasData && (
        <div className="flex flex-col items-center justify-center rounded-2xl bg-white px-8 py-20 shadow-sm dark:bg-zinc-900 dark:shadow-none dark:ring-1 dark:ring-zinc-800">
          <BarChart3
            className="mb-4 h-16 w-16 text-[#CCC] dark:text-zinc-600"
            strokeWidth={1.25}
            aria-hidden
          />
          <p className="max-w-sm text-center text-[15px] leading-relaxed text-[#666] dark:text-zinc-400">
            {report?.message || tr('report.emptyNoData')}
          </p>
        </div>
      )}

      {!loading && hasData && summary && behavior && (
        <>
          <section className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div className="rounded-2xl bg-white p-5 shadow-sm dark:bg-zinc-900 dark:shadow-none dark:ring-1 dark:ring-zinc-800">
              <div className="text-[12px] font-medium text-[#999] dark:text-zinc-500">
                {tr('report.totalTrades')}
              </div>
              <div className="mt-2 flex items-baseline gap-1">
                <span className="text-[28px] font-bold tabular-nums text-black dark:text-white">
                  {summary.total_trades}
                </span>
                <span className="text-[13px] text-[#999] dark:text-zinc-500">
                  {tr('report.unitTrades')}
                </span>
              </div>
            </div>
            <div className="rounded-2xl bg-white p-5 shadow-sm dark:bg-zinc-900 dark:shadow-none dark:ring-1 dark:ring-zinc-800">
              <div className="text-[12px] font-medium text-[#999] dark:text-zinc-500">
                {tr('report.winRate')}
              </div>
              <div
                className={[
                  'mt-2 text-[28px] font-bold tabular-nums',
                  summary.win_rate > 50
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : summary.win_rate < 50
                      ? 'text-red-500 dark:text-red-400'
                      : 'text-[#666] dark:text-zinc-400',
                ].join(' ')}
              >
                {Number(summary.win_rate).toFixed(1)}%
              </div>
            </div>
            <div className="rounded-2xl bg-white p-5 shadow-sm dark:bg-zinc-900 dark:shadow-none dark:ring-1 dark:ring-zinc-800">
              <div className="text-[12px] font-medium text-[#999] dark:text-zinc-500">
                {tr('report.totalPnl')}
              </div>
              <div
                className={[
                  'mt-2 text-[28px] font-bold tabular-nums',
                  summary.total_pnl > 0
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : summary.total_pnl < 0
                      ? 'text-red-500 dark:text-red-400'
                      : 'text-black dark:text-white',
                ].join(' ')}
              >
                {formatMoney(summary.total_pnl, dateLocale)} {tr('report.yuan')}
              </div>
            </div>
            <div className="rounded-2xl bg-white p-5 shadow-sm dark:bg-zinc-900 dark:shadow-none dark:ring-1 dark:ring-zinc-800">
              <div className="text-[12px] font-medium text-[#999] dark:text-zinc-500">
                {tr('report.avgHolding')}
              </div>
              <div className="mt-2 flex items-baseline gap-1">
                <span className="text-[28px] font-bold tabular-nums text-black dark:text-white">
                  {Number(summary.avg_holding_days).toFixed(1)}
                </span>
                <span className="text-[13px] text-[#999] dark:text-zinc-500">
                  {tr('report.unitDays')}
                </span>
              </div>
            </div>
          </section>

          <section className="grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border-l-[3px] border-emerald-500 bg-white p-6 shadow-sm dark:bg-zinc-900 dark:shadow-none dark:ring-1 dark:ring-zinc-800">
              <div className="text-[12px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
                {tr('report.bestDecision')}
              </div>
              <div className="mt-3 text-[18px] font-semibold text-black dark:text-white">
                {summary.best_trade?.asset_name || '—'}
              </div>
              <div className="mt-2 text-[24px] font-bold text-emerald-600 dark:text-emerald-400">
                {formatMoney(summary.best_trade?.pnl, dateLocale)}{' '}
                {tr('report.yuan')}
              </div>
              <div className="mt-2 text-[13px] text-[#888] dark:text-zinc-500">
                {tr('report.holdingAbout').replace(
                  '{n}',
                  String(summary.best_trade?.holding_days ?? '—'),
                )}
              </div>
            </div>
            <div className="rounded-2xl border-l-[3px] border-red-500 bg-white p-6 shadow-sm dark:bg-zinc-900 dark:shadow-none dark:ring-1 dark:ring-zinc-800">
              <div className="text-[12px] font-semibold uppercase tracking-wide text-red-700 dark:text-red-400">
                {tr('report.worstDecision')}
              </div>
              <div className="mt-3 text-[18px] font-semibold text-black dark:text-white">
                {summary.worst_trade?.asset_name || '—'}
              </div>
              <div className="mt-2 text-[24px] font-bold text-red-500 dark:text-red-400">
                {formatMoney(summary.worst_trade?.pnl, dateLocale)}{' '}
                {tr('report.yuan')}
              </div>
              <div className="mt-2 text-[13px] text-[#888] dark:text-zinc-500">
                {tr('report.holdingAbout').replace(
                  '{n}',
                  String(summary.worst_trade?.holding_days ?? '—'),
                )}
              </div>
            </div>
          </section>

          <section className="rounded-2xl bg-white p-6 shadow-sm dark:bg-zinc-900 dark:shadow-none dark:ring-1 dark:ring-zinc-800">
            <h2 className="text-[16px] font-bold text-black dark:text-white">
              {tr('report.biasSection')}
            </h2>
            {allLow && (
              <p className="mt-3 rounded-lg bg-[#F5F5F5] px-4 py-3 text-[13px] text-[#666] dark:bg-zinc-800 dark:text-zinc-300">
                {tr('report.biasAllClear')}
              </p>
            )}
            <div className="mt-5 space-y-6">
              {biasRows.map((row) => {
                const score = biasHasData
                  ? Number(biasPayload[row.scoreKey]) || 0
                  : null
                const desc = descriptions[row.scoreKey] || ''
                const fallback = biasesText?.[row.reportTextKey]
                return (
                  <div key={row.label}>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[14px] font-medium text-black dark:text-white">
                        {row.label}
                      </span>
                      {biasHasData && score !== null && (
                        <span className="text-[13px] tabular-nums text-[#666] dark:text-zinc-400">
                          {Math.round(score)}
                        </span>
                      )}
                    </div>
                    {biasHasData && score !== null && (
                      <div className="mt-2 h-[3px] w-full overflow-hidden rounded-full bg-[#F0F0F0] dark:bg-zinc-800">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${Math.min(100, Math.max(0, score))}%`,
                            backgroundColor: biasBarColor(score),
                          }}
                        />
                      </div>
                    )}
                    <p className="mt-2 text-[12px] leading-relaxed text-[#999] dark:text-zinc-500">
                      {desc}
                    </p>
                    {!biasHasData && fallback && (
                      <p className="mt-1 text-[13px] leading-relaxed text-[#666] dark:text-zinc-400">
                        {fallback}
                      </p>
                    )}
                  </div>
                )
              })}
            </div>
            {!biasHasData && (
              <p className="mt-4 text-[12px] text-[#AAA] dark:text-zinc-500">
                {tr('report.biasFootnote')}
              </p>
            )}
          </section>

          <section className="rounded-2xl border-l-[3px] border-black bg-white p-6 shadow-sm dark:border-white dark:bg-zinc-900 dark:shadow-none dark:ring-1 dark:ring-zinc-800">
            <div className="flex flex-wrap items-baseline gap-2">
              <h2 className="text-[16px] font-bold text-black dark:text-white">
                {tr('report.aiTitle')}
              </h2>
              <span className="text-[11px] font-normal text-[#AAA] dark:text-zinc-500">
                {tr('report.aiDisclaimer')}
              </span>
            </div>
            <div className="mt-5 space-y-4 text-[15px] leading-[1.85] text-[#333] dark:text-zinc-300">
              {(aiCommentary || []).map((para, i) => (
                <p key={i}>{para}</p>
              ))}
            </div>
            <p className="mt-8 border-t border-[#F0F0F0] pt-4 text-[11px] leading-relaxed text-[#AAA] dark:border-zinc-800 dark:text-zinc-500">
              {tr('report.aiDataSources')}
            </p>
          </section>

          <section className="rounded-2xl bg-white p-6 shadow-sm dark:bg-zinc-900 dark:shadow-none dark:ring-1 dark:ring-zinc-800">
            <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-[15px] font-bold text-black dark:text-white">
                  {tr('report.noteCoverage')}
                </h2>
                <div className="mt-2 text-[11px] text-[#999] dark:text-zinc-500">
                  {tr('report.noteCoverageHint')}
                </div>
                <div className="mt-3 text-[32px] font-extrabold tabular-nums text-black dark:text-white">
                  {Number(behavior.note_coverage || 0).toFixed(0)}
                  <span className="text-[18px] font-semibold text-[#999] dark:text-zinc-500">
                    %
                  </span>
                </div>
              </div>
              <div className="h-[200px] w-full max-w-[280px] md:mx-0">
                <ResponsiveContainer width="100%" height={250}>
                  <PieChart>
                    <Pie
                      data={pieData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={52}
                      outerRadius={72}
                      paddingAngle={2}
                    >
                      {pieData.map((_, i) => (
                        <Cell
                          key={i}
                          fill={PIE_GRAY[i % PIE_GRAY.length]}
                          stroke={pieStroke}
                          strokeWidth={1}
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(v) => [
                        `${Number(v).toFixed(1)}%`,
                        tr('report.tooltipShare'),
                      ]}
                      contentStyle={tooltipBoxStyle}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
            <p className="mt-4 text-center text-[11px] text-[#AAA] dark:text-zinc-500 md:text-left">
              {tr('report.pieFootnote')}
            </p>
          </section>
        </>
      )}
    </div>
  )
}
