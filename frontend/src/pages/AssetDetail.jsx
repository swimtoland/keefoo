import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { getAssetDetail } from '../api'
import { useAuth } from '../contexts/AuthContext.jsx'
import { useUiPreferences } from '../contexts/UiPreferencesContext.jsx'
import { useToast } from '../components/Toast.jsx'

const ASSET_TYPE_I18N = {
  stock: 'asset.typeStock',
  fund: 'asset.typeFund',
  bond: 'asset.typeBond',
  futures: 'asset.typeFutures',
  gold: 'asset.typeGold',
}

const EVENT_TYPE_I18N = {
  earnings: 'asset.evEarnings',
  policy: 'asset.evPolicy',
  executive: 'asset.evExecutive',
  rating: 'asset.evRating',
  macro: 'asset.evMacro',
  announcement: 'asset.evAnnouncement',
}

function formatDt(iso, dateLocale) {
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

function DetailSkeleton() {
  return (
    <div className="animate-pulse space-y-8">
      <div className="h-10 w-2/3 rounded bg-[#E8E8E8] dark:bg-zinc-800" />
      <div className="flex flex-col gap-8 lg:flex-row">
        <div className="h-[400px] flex-1 rounded-2xl bg-white shadow-sm dark:bg-zinc-900 dark:ring-1 dark:ring-zinc-800" />
        <div className="h-[300px] w-full rounded-2xl bg-white shadow-sm dark:bg-zinc-900 dark:ring-1 dark:ring-zinc-800 lg:w-[38%]" />
      </div>
    </div>
  )
}

export default function AssetDetail() {
  const { assetId } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { t: tr, dateLocale } = useUiPreferences()
  const userId = user?.id
  const showToast = useToast()
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState(null)

  useEffect(() => {
    if (!assetId || !userId) return
    let cancelled = false
    setData(null)
    setLoading(true)
    getAssetDetail(assetId, userId)
      .then((d) => {
        if (!cancelled) setData(d)
      })
      .catch((e) => {
        if (!cancelled) {
          setData(null)
          showToast(
            typeof e.response?.data?.detail === 'string'
              ? e.response.data.detail
              : e.message || tr('asset.loadFail'),
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
  }, [assetId, userId, showToast, tr])

  const tradesSorted = useMemo(() => {
    const list = data?.trades || []
    return [...list].sort((a, b) => new Date(b.traded_at) - new Date(a.traded_at))
  }, [data])

  const eventsSorted = useMemo(() => {
    const list = data?.events || []
    return [...list].sort((a, b) => new Date(b.occurred_at) - new Date(a.occurred_at))
  }, [data])

  if (loading || !data) {
    return loading ? (
      <DetailSkeleton />
    ) : (
      <div className="rounded-2xl bg-white p-10 text-center text-[#999] shadow-sm dark:bg-zinc-900 dark:text-zinc-500 dark:ring-1 dark:ring-zinc-800">
        {tr('asset.notFound')}
      </div>
    )
  }

  const asset = data.asset
  const typeLabel = ASSET_TYPE_I18N[asset.asset_type]
    ? tr(ASSET_TYPE_I18N[asset.asset_type])
    : asset.asset_type
  const hasShadow = Boolean(data.shadow_position)

  return (
    <div className="stagger-in text-[#1A1A1A] dark:text-zinc-100">
      {hasShadow && (
        <div className="mb-6 rounded-xl bg-[#F0F0F0] px-4 py-3 text-center text-[13px] text-[#666] dark:bg-zinc-800 dark:text-zinc-300">
          {tr('asset.shadowBanner')}
        </div>
      )}

      <header className="mb-10 flex flex-wrap items-start gap-4">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#E5E5E5] bg-white text-[#1A1A1A] shadow-sm transition-all duration-200 hover:border-[#CCC] hover:shadow dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:border-zinc-600"
          aria-label={tr('asset.back')}
        >
          <ArrowLeft className="h-5 w-5" strokeWidth={1.75} />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="text-[26px] font-extrabold tracking-tight text-[#1A1A1A] dark:text-white">{asset.name}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <span className="font-mono text-[13px] text-[#999] dark:text-zinc-500">{asset.code}</span>
            <span className="rounded-full bg-[#F5F5F5] px-2.5 py-0.5 text-[11px] font-medium text-[#555] dark:bg-zinc-800 dark:text-zinc-300">
              {typeLabel}
            </span>
          </div>
        </div>
      </header>

      <div className="flex flex-col gap-10 lg:flex-row lg:items-start">
        <section className="min-w-0 flex-1 lg:max-w-[60%] lg:flex-[0.6]">
          <h2 className="mb-6 text-[16px] font-bold text-[#1A1A1A] dark:text-white">{tr('asset.tradesTitle')}</h2>
          {tradesSorted.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[#E0E0E0] bg-white px-6 py-14 text-center text-sm text-[#999] shadow-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-500 dark:ring-1 dark:ring-zinc-800">
              {tr('asset.noTrades')}
            </div>
          ) : (
            <div className="relative pl-6">
              <div
                className="absolute bottom-0 left-[7px] top-0 w-px bg-[#E5E5E5] dark:bg-zinc-700"
                aria-hidden
              />
              <ul className="space-y-6">
                {tradesSorted.map((t) => {
                  const isBuy = t.direction === 'buy'
                  const dotCls = isBuy ? 'bg-[#22C55E]' : 'bg-[#EF4444]'
                  const dirLabel = isBuy ? tr('asset.buy') : tr('asset.sell')
                  const dirBg = isBuy ? 'bg-[#F0FDF4] text-[#15803D]' : 'bg-[#FEF2F2] text-[#B91C1C]'
                  const showAgentThread =
                    t.agent_question_text &&
                    t.note_source === 'agent_parsed' &&
                    (t.decision_note || '').trim()

                  return (
                    <li key={t.id} className="relative">
                      <span
                        className={`absolute left-[-19px] top-2 z-10 h-3 w-3 rounded-full ring-4 ring-white dark:ring-zinc-950 ${dotCls}`}
                        aria-hidden
                      />
                      <div className="card-hover rounded-xl bg-white p-4 shadow-sm transition-shadow duration-200 hover:shadow-md dark:bg-zinc-900 dark:ring-1 dark:ring-zinc-800">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${dirBg}`}
                          >
                            {dirLabel}
                          </span>
                          <span className="font-mono text-[14px] font-semibold text-[#1A1A1A] dark:text-white">
                            {t.price} × {t.quantity}
                          </span>
                        </div>
                        <time className="mt-2 block text-[12px] text-[#999] dark:text-zinc-500">
                          {formatDt(t.traded_at, dateLocale)}
                        </time>
                        {showAgentThread ? (
                          <div className="mt-4 space-y-2 rounded-xl bg-[#FAFAFA] p-3 dark:bg-zinc-800/80">
                            <div className="rounded-lg bg-white px-3 py-2 text-[13px] text-[#555] shadow-sm dark:bg-zinc-900 dark:text-zinc-300">
                              <span className="text-[10px] font-semibold uppercase text-[#999] dark:text-zinc-500">
                                {tr('asset.followUp')}
                              </span>
                              <p className="mt-1">{t.agent_question_text}</p>
                            </div>
                            <div className="rounded-lg border border-[#E8E8E8] bg-white px-3 py-2 text-[13px] text-[#1A1A1A] dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100">
                              <span className="text-[10px] font-semibold uppercase text-[#999] dark:text-zinc-500">
                                {tr('asset.yourReply')}
                              </span>
                              <p className="mt-1 whitespace-pre-wrap">{t.decision_note}</p>
                            </div>
                          </div>
                        ) : (
                          <>
                            {t.decision_note && (
                              <blockquote className="mt-3 border-l-2 border-[#E5E5E5] pl-3 text-[13px] leading-relaxed text-[#777] dark:border-zinc-600 dark:text-zinc-400">
                                {t.decision_note}
                              </blockquote>
                            )}
                            {t.agent_question_text && t.note_source !== 'agent_parsed' && (
                              <div className="mt-3 rounded-lg bg-[#FAFAFA] px-3 py-2 text-[13px] text-[#555] dark:bg-zinc-800 dark:text-zinc-300">
                                <span className="text-[10px] font-semibold text-[#999] dark:text-zinc-500">
                                  {tr('asset.aiFollowUp')}
                                </span>
                                <p className="mt-1">{t.agent_question_text}</p>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
        </section>

        <aside className="w-full shrink-0 lg:max-w-[40%] lg:flex-[0.4]">
          <h2 className="mb-6 text-[16px] font-bold text-[#1A1A1A] dark:text-white">{tr('asset.eventsTitle')}</h2>
          {eventsSorted.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[#E0E0E0] bg-white px-6 py-12 text-center text-sm text-[#999] shadow-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-500 dark:ring-1 dark:ring-zinc-800">
              {tr('asset.noEvents')}
            </div>
          ) : (
            <ul className="space-y-3">
              {eventsSorted.map((ev, i) => {
                const etLabel = EVENT_TYPE_I18N[ev.event_type]
                  ? tr(EVENT_TYPE_I18N[ev.event_type])
                  : ev.event_type
                const imp = ev.impact_level
                const dot =
                  imp === 'high'
                    ? 'bg-black'
                    : imp === 'medium'
                      ? 'bg-[#888888]'
                      : 'bg-[#D4D4D4]'

                return (
                  <li
                    key={ev.id}
                    className="card-hover rounded-xl bg-white p-4 shadow-sm transition-shadow duration-200 hover:shadow-md dark:bg-zinc-900 dark:ring-1 dark:ring-zinc-800"
                    style={{ animationDelay: `${i * 50}ms` }}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="rounded-full bg-[#F5F5F5] px-2 py-0.5 text-[10px] font-medium text-[#666] dark:bg-zinc-800 dark:text-zinc-300">
                        {etLabel}
                      </span>
                      <span className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${dot}`} title={imp} />
                    </div>
                    <p className="mt-2 text-[14px] font-semibold leading-snug text-[#1A1A1A] dark:text-white">
                      {ev.title}
                    </p>
                    <time className="mt-2 block text-[11px] text-[#999] dark:text-zinc-500">
                      {formatDt(ev.occurred_at, dateLocale)}
                    </time>
                  </li>
                )
              })}
            </ul>
          )}
        </aside>
      </div>
    </div>
  )
}
