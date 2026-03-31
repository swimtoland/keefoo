import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bot, Inbox, Send, TrendingDown, TrendingUp } from 'lucide-react'
import {
  getFeed,
  getFinancialNews,
  getMarketIndices,
  getPendingQuestions,
  markFeedRead,
  replyToAgent,
} from '../api'
import { useAuth } from '../contexts/AuthContext.jsx'
import { useUiPreferences } from '../contexts/UiPreferencesContext.jsx'
import { useToast } from '../components/Toast.jsx'

function formatWhen(iso, dateLocale) {
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

function barFill(score) {
  const s = Number(score)
  if (!Number.isFinite(s)) return '#CCCCCC'
  if (s > 0.8) return '#1A1A1A'
  if (s > 0.5) return '#888888'
  return '#CCCCCC'
}

function FeedSkeleton() {
  return (
    <div className="space-y-4">
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          className="h-40 animate-pulse rounded-2xl bg-white shadow-sm dark:bg-zinc-900"
          style={{ animationDelay: `${i * 80}ms` }}
        />
      ))}
    </div>
  )
}

export default function Feed() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { t, dateLocale } = useUiPreferences()
  const userId = user?.id
  const showToast = useToast()
  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState([])
  const [pendingLoading, setPendingLoading] = useState(true)
  const [pending, setPending] = useState([])
  const [expandedTradeId, setExpandedTradeId] = useState(null)
  const [replyText, setReplyText] = useState({})
  const replyTextareaRef = useRef({})
  const [replyingId, setReplyingId] = useState(null)

  const [indices, setIndices] = useState([])
  const indicesRef = useRef([])
  const [news, setNews] = useState([])
  const [expandedNews, setExpandedNews] = useState({})

  const loadFeed = () => {
    if (!userId) return Promise.resolve()
    setLoading(true)
    return getFeed(userId)
      .then((data) => setItems(Array.isArray(data) ? data : []))
      .catch((e) => {
        setItems([])
        showToast(
          typeof e.response?.data?.detail === 'string'
            ? e.response.data.detail
            : e.message || t('feed.loadFail'),
          'error',
        )
      })
      .finally(() => setLoading(false))
  }

  const loadPending = () => {
    if (!userId) return Promise.resolve()
    setPendingLoading(true)
    return getPendingQuestions(userId)
      .then((list) => setPending(Array.isArray(list) ? list : []))
      .catch(() => setPending([]))
      .finally(() => setPendingLoading(false))
  }

  useEffect(() => {
    loadFeed()
  }, [showToast, userId])

  useEffect(() => {
    loadPending()
  }, [userId])

  useEffect(() => {
    let cancelled = false
    indicesRef.current = []
    setIndices([])

    async function refresh() {
      try {
        const list = await getMarketIndices()
        const next = Array.isArray(list) ? list : []
        if (cancelled) return
        if (next.length > 0) {
          indicesRef.current = next
          setIndices(next)
        } else {
          setIndices(indicesRef.current || [])
        }
      } catch {
        if (!cancelled) setIndices(indicesRef.current || [])
      }
    }

    refresh()
    const id = window.setInterval(refresh, 60 * 1000)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    async function refreshNews() {
      try {
        const list = await getFinancialNews(10)
        if (cancelled) return
        setNews(Array.isArray(list) ? list : [])
      } catch {
        if (!cancelled) setNews([])
      }
    }

    refreshNews()
    const id = window.setInterval(refreshNews, 5 * 60 * 1000)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [])

  async function handleSendReply(tradeId) {
    const text = (replyText[tradeId] || '').trim()
    if (!text) {
      showToast(t('feed.replyEmpty'), 'error')
      return
    }
    setReplyingId(tradeId)
    try {
      await replyToAgent({
        user_id: userId,
        trade_id: tradeId,
        reply: text,
      })
      showToast(t('feed.replyOk'), 'success')
      setReplyText((prev) => {
        const next = { ...prev }
        delete next[tradeId]
        return next
      })
      setExpandedTradeId(null)
      setPending((prev) => prev.filter((p) => p.trade_id !== tradeId))
      window.dispatchEvent(new Event('keefoo-pending-refresh'))
      loadFeed()
    } catch (e) {
      const msg =
        typeof e.response?.data?.detail === 'string'
          ? e.response.data.detail
          : e.message || t('feed.sendFail')
      showToast(msg, 'error')
    } finally {
      setReplyingId(null)
    }
  }

  const hasPending = !pendingLoading && pending.length > 0
  const quickReplies = ['短线博弈', '长期价值驱动', '恐慌止损', '政策利好跟随', '趋势突破', '均值回归', '事件驱动', '仓位控制']

  const changeTone = (change) => {
    const n = Number(change)
    // China convention: up = red, down = green
    if (Number.isFinite(n) && n > 0) return 'text-red-500 dark:text-red-400'
    if (Number.isFinite(n) && n < 0) return 'text-emerald-600 dark:text-emerald-400'
    return 'text-[#888] dark:text-zinc-500'
  }

  const changeIcon = (change) => {
    const n = Number(change)
    if (Number.isFinite(n) && n > 0) return TrendingUp
    if (Number.isFinite(n) && n < 0) return TrendingDown
    return null
  }

  const tagClassFor = (levelKey) =>
    levelKey === 'direct'
      ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/20 dark:text-blue-200'
      : 'bg-[#F5F5F5] text-[#555] dark:bg-zinc-800 dark:text-zinc-300'

  const relevancePillClass =
    'inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1 text-[12px] font-medium text-gray-600 transition-colors hover:border-gray-300 hover:text-gray-800 active:scale-95 active:opacity-95 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400 dark:hover:border-zinc-700 dark:hover:text-zinc-200'

  const handleCorrelatedNodeClick = (e, node) => {
    e.stopPropagation()
    // Mock: for now we route to graph exploration.
    // If later we attach ids/types, we can branch here to /asset/:id etc.
    showToast('即将前往图谱探索该节点...', 'info')
    navigate('/graph')
  }

  const handleMarkRead = async (cardId) => {
    if (!cardId) return
    setItems((prev) => prev.map((c) => (c.id === cardId ? { ...c, is_read: true } : c)))
    try {
      await markFeedRead(cardId)
    } catch {
      // keep optimistic state; backend will reconcile on next load
    }
  }

  return (
    <div className="w-full max-w-full overflow-x-hidden px-6 py-4 text-[#1A1A1A] dark:text-zinc-100">
      {/* 行情滚动栏：固定高度 + overflow-hidden */}
      <div className="mb-4 w-full overflow-hidden border-b border-[#F0F0F0] dark:border-zinc-800" style={{ maxWidth: '100%' }}>
        <div
          className="inline-flex whitespace-nowrap py-3"
          style={{ animation: 'marquee 40s linear infinite' }}
        >
          {Array.isArray(indices) && indices.length > 0 ? (
            [...indices, ...indices].map((idx, i) => {
              const toneCls = changeTone(idx.change_pct)
              const Icon = changeIcon(idx.change_pct)
              const price = Number(idx.price)
              const changePct = Number(idx.change_pct)
              const changeText =
                Number.isFinite(changePct) ? `${changePct >= 0 ? '+' : ''}${changePct}%` : '—'
              return (
                <div key={`${idx.code}-${i}`} className="inline-flex items-center gap-2 px-4">
                  <span className="text-sm font-medium text-[#1A1A1A] dark:text-zinc-100">
                    {idx.name_en || idx.name || idx.code}
                  </span>
                  <span className="text-sm font-semibold tabular-nums text-[#1A1A1A] dark:text-zinc-100">
                    {Number.isFinite(price) ? price.toLocaleString('zh-CN') : '—'}
                  </span>
                  <span className={`inline-flex items-center gap-1.5 text-sm font-semibold ${toneCls}`}>
                    {Icon ? <Icon className="h-4 w-4" strokeWidth={2} aria-hidden /> : null}
                    {changeText}
                  </span>
                  <span className="ml-2 text-[#DDD] dark:text-zinc-700" aria-hidden>
                    |
                  </span>
                </div>
              )
            })
          ) : (
            <div className="inline-flex items-center gap-2 px-4 text-sm text-[#777] dark:text-zinc-400">
              行情数据加载中...
            </div>
          )}
        </div>
      </div>

      {/* 页面标题 */}
      <h1 className="text-[28px] font-extrabold tracking-tight text-[#1A1A1A] dark:text-white">{t('feed.title')}</h1>
      <p className="mt-1 text-[13px] font-normal text-[#999] dark:text-zinc-500">{t('feed.subtitle')}</p>

      {/* 主体两栏（flex）：用百分比锁死左右宽度 */}
      <div className="mt-4 flex w-full max-w-full gap-6 overflow-x-hidden">
        <div style={{ width: '70%' }} className="min-w-0 space-y-4">
          {hasPending && (
            <section className="stagger-in w-full max-w-full overflow-hidden rounded-2xl bg-white p-5 shadow-sm dark:bg-zinc-900">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600/10 text-blue-700 dark:text-blue-300">
                  <Bot className="h-4.5 w-4.5" strokeWidth={2} aria-hidden />
                </div>
                <div className="min-w-0 flex-1 overflow-hidden">
                  <h2 className="truncate text-[15px] font-bold text-[#1A1A1A] dark:text-white">{t('feed.aiTitle')}</h2>
                  <div className="mt-1 text-[12px] font-normal text-[#888] dark:text-zinc-500">{t('feed.subtitle')}</div>

                  <ul className="mt-4 space-y-3">
                    {pending.map((q) => {
                      const open = expandedTradeId === q.trade_id
                      return (
                        <li
                          key={q.trade_id}
                          className="w-full max-w-full overflow-hidden rounded-xl border border-[#EAF0FF] bg-white/70 dark:border-blue-900/20 dark:bg-zinc-950/20"
                        >
                          <button
                            type="button"
                            onClick={() => setExpandedTradeId(open ? null : q.trade_id)}
                            className="w-full max-w-full overflow-hidden px-4 py-3 text-left"
                          >
                            <span className="block truncate text-[13px] font-semibold text-[#1A1A1A] dark:text-white">
                              {q.asset_name || t('feed.asset')}
                            </span>
                            <p className="mt-1 break-words overflow-hidden text-[13px] leading-relaxed text-[#555] dark:text-zinc-300">
                              {q.question_text}
                            </p>
                            <span className="mt-2 inline-block text-[11px] text-[#999] dark:text-zinc-500">
                              {open ? t('feed.tapCollapse') : t('feed.tapReply')}
                            </span>
                          </button>
                          {open && (
                            <div className="border-t border-[#EEF2FF] px-4 pb-4 pt-3 dark:border-blue-900/20">
                              <textarea
                                rows={3}
                                value={replyText[q.trade_id] || ''}
                                onChange={(e) =>
                                  setReplyText((prev) => ({
                                    ...prev,
                                    [q.trade_id]: e.target.value,
                                  }))
                                }
                                placeholder={t('feed.replyPh')}
                                ref={(el) => {
                                  if (el) replyTextareaRef.current[q.trade_id] = el
                                }}
                                className="w-full max-w-full resize-y rounded-xl border border-[#E5E5E5] bg-white px-3 py-2 text-[13px] text-[#1A1A1A] placeholder:text-[#CCC] shadow-inner outline-none transition-colors duration-200 focus:border-[#1A1A1A] dark:border-zinc-600 dark:bg-zinc-950/40 dark:text-white dark:placeholder:text-zinc-500 dark:focus:border-zinc-400 break-words"
                              />

                              <div className="mt-3 w-full overflow-hidden">
                                <div className="flex max-w-full items-center gap-2 overflow-x-auto whitespace-nowrap pb-1">
                                  {quickReplies.map((label) => (
                                    <button
                                      key={label}
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        setReplyText((prev) => ({
                                          ...prev,
                                          [q.trade_id]: label,
                                        }))
                                        requestAnimationFrame(() => {
                                          replyTextareaRef.current[q.trade_id]?.focus?.()
                                        })
                                      }}
                                      className="inline-flex shrink-0 items-center rounded-full border border-blue-100 bg-white px-3 py-1.5 text-[12px] font-medium text-blue-700 transition-colors hover:bg-blue-50 active:scale-95 active:opacity-95 dark:border-blue-900/30 dark:bg-zinc-950/40 dark:text-blue-200 dark:hover:bg-blue-900/10"
                                    >
                                      {label}
                                    </button>
                                  ))}
                                </div>
                              </div>

                              <button
                                type="button"
                                disabled={replyingId === q.trade_id}
                                onClick={() => handleSendReply(q.trade_id)}
                                className="mt-3 flex w-full max-w-full items-center justify-center gap-2 rounded-xl bg-black py-2.5 text-[13px] font-semibold text-white shadow-sm transition-colors duration-200 hover:bg-[#333] disabled:opacity-50 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
                              >
                                <Send className="h-4 w-4" strokeWidth={2} />
                                {replyingId === q.trade_id ? t('feed.sending') : t('feed.send')}
                              </button>
                            </div>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                </div>
              </div>
            </section>
          )}

          {loading ? (
            <FeedSkeleton />
          ) : items.length === 0 ? (
            <div className="w-full max-w-full overflow-hidden rounded-2xl bg-white p-5 shadow-sm dark:bg-zinc-900">
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <Inbox className="mb-4 h-14 w-14 text-[#E0E0E0] dark:text-zinc-600" strokeWidth={1.25} aria-hidden />
                <p className="text-base font-semibold text-[#1A1A1A] dark:text-white">{t('feed.emptyTitle')}</p>
                <p className="mt-2 max-w-sm text-sm font-normal text-[#999] dark:text-zinc-500">{t('feed.emptyBody')}</p>
              </div>
            </div>
          ) : (
            <ul className="space-y-4">
              {items.map((card, i) => {
                const levelKey = card.relevance_level || 'macro'
                const tag =
                  t(`feed.level.${levelKey}`) !== `feed.level.${levelKey}` ? t(`feed.level.${levelKey}`) : t('feed.level.macro')
                const title = card.event_title || t('feed.untitledEvent')
                const score = Number(card.relevance_score)
                const pct = Number.isFinite(score) ? Math.min(100, Math.max(0, score * 100)) : 0
                const firstAssetId =
                  Array.isArray(card.related_asset_ids) && card.related_asset_ids.length > 0 ? card.related_asset_ids[0] : null

                const contextLines = [`· 你当前持有 100 股，成本价 1650`, `· 上次因财报买入，持仓 18 天盈利 7.3%`]

                const correlated = [{ label: '📊 动销数据存疑' }, { label: '👤 管理层表态' }, { label: '📈 板块联动' }]

                return (
                  <li
                    key={card.id}
                    onClick={() => handleMarkRead(card.id)}
                    className="stagger-in w-full max-w-full overflow-hidden rounded-2xl bg-white p-5 shadow-sm dark:bg-zinc-900"
                    style={{ animationDelay: `${i * 80}ms` }}
                  >
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <span className="inline-flex rounded-full bg-blue-50 px-3 py-1 text-[12px] font-medium text-blue-600 dark:bg-blue-900/10 dark:text-blue-200">
                        {tag}
                      </span>
                      <div className="shrink-0 text-xs font-semibold text-gray-400 dark:text-zinc-500">⚡ {Math.round(pct)}% 匹配</div>
                    </div>

                    {firstAssetId ? (
                      <button
                        type="button"
                        onClick={() => navigate(`/asset/${firstAssetId}`)}
                        className="w-full max-w-full overflow-hidden text-left text-lg font-semibold leading-snug text-gray-900 underline decoration-transparent decoration-2 underline-offset-2 transition-colors duration-200 hover:decoration-gray-900 dark:text-white dark:hover:decoration-white break-words"
                      >
                        {title}
                      </button>
                    ) : (
                      <h2 className="break-words text-lg font-semibold leading-snug text-gray-900 dark:text-white">{title}</h2>
                    )}

                    <p className="mt-2 break-words overflow-hidden text-[14px] leading-relaxed text-gray-500 dark:text-zinc-400">
                      {card.relevance_note || '—'}
                    </p>

                    <div className="mt-4 w-full max-w-full overflow-hidden rounded-xl bg-gray-50 p-4 dark:bg-gray-900/50">
                      <div className="truncate text-[12px] font-semibold text-gray-700 dark:text-zinc-200">与你的关联</div>
                      <ul className="mt-2 space-y-1.5 break-words text-sm text-gray-600 dark:text-zinc-300">
                        {contextLines.map((line) => (
                          <li key={line}>{line}</li>
                        ))}
                      </ul>
                    </div>

                    <div className="mt-4 flex max-w-full flex-wrap gap-2 overflow-hidden">
                      {correlated.map((x) => (
                        <button
                          key={x.label}
                          type="button"
                          onClick={(e) => handleCorrelatedNodeClick(e, x)}
                          className={`${relevancePillClass} cursor-pointer max-w-full`}
                        >
                          <span className="break-words">{x.label}</span>
                        </button>
                      ))}
                      <div className="ml-auto shrink-0 text-[11px] text-gray-400 dark:text-zinc-500">
                        <time dateTime={card.event_occurred_at || undefined}>{formatWhen(card.event_occurred_at, dateLocale)}</time>
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        <div style={{ width: '30%' }} className="min-w-0 flex-shrink-0 space-y-4 hidden lg:block">
          <div className="w-full max-w-full overflow-hidden rounded-2xl bg-white p-5 shadow-sm dark:bg-zinc-900">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="truncate text-[13px] font-bold text-[#1A1A1A] dark:text-white">AI 情绪指数</h3>
                <p className="mt-1 break-words text-[12px] text-[#888] dark:text-zinc-500">看多情绪 75% · 看空情绪 25%</p>
              </div>
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300">
                <span className="text-[12px] font-bold">75</span>
              </div>
            </div>
            <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-zinc-800">
              <div className="h-full rounded-full bg-emerald-500 dark:bg-emerald-400" style={{ width: '75%' }} />
            </div>
            <div className="mt-3 flex items-center justify-between text-[11px] text-[#999] dark:text-zinc-500">
              <span className="text-red-600 dark:text-red-400">看空</span>
              <span className="text-emerald-600 dark:text-emerald-400">看多</span>
            </div>
          </div>

          <div className="w-full max-w-full overflow-hidden rounded-2xl bg-white p-5 shadow-sm dark:bg-zinc-900">
            <h3 className="truncate text-[13px] font-bold text-[#1A1A1A] dark:text-white">待办复盘</h3>
            <div className="mt-3 space-y-3">
              {[
                {
                  icon: '⚠️',
                  title: '宁德时代异动，请补充买入逻辑',
                  sub: '生成复盘依赖你的交易记录与备注',
                  action: '去补充',
                  onClick: () => navigate('/trade'),
                },
                {
                  icon: '🧠',
                  title: '完善仓位控制规则（AI 需要你的阈值）',
                  sub: '建议补充：最大回撤、加仓条件、止损线',
                  action: '去查看',
                  onClick: () => navigate('/report'),
                },
              ].map((x) => (
                <div key={x.title} className="flex w-full max-w-full items-start gap-3 overflow-hidden rounded-xl bg-[#FAFAFA] p-3 dark:bg-zinc-800/50">
                  <span className="mt-0.5 text-[14px]" aria-hidden>
                    {x.icon}
                  </span>
                  <div className="min-w-0 flex-1 overflow-hidden">
                    <p className="truncate text-[12.5px] font-medium text-[#1A1A1A] dark:text-zinc-200">{x.title}</p>
                    <p className="mt-1 break-words overflow-hidden text-[11px] text-[#999] dark:text-zinc-500">{x.sub}</p>
                  </div>
                  <button
                    type="button"
                    onClick={x.onClick}
                    className="shrink-0 rounded-lg bg-black px-3 py-1.5 text-[11px] font-semibold text-white transition-colors hover:bg-[#333] dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
                  >
                    {x.action}
                  </button>
                </div>
              ))}

              <button
                type="button"
                onClick={() => navigate('/trade')}
                className="mt-1 inline-flex w-full max-w-full items-center justify-center gap-2 overflow-hidden rounded-xl bg-black py-2 text-[12px] font-semibold text-white shadow-sm transition-colors duration-200 hover:bg-[#333] dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
              >
                {t('positions.goTrade')}
              </button>
            </div>
          </div>
        </div>
      </div>

      {Array.isArray(news) && news.length > 0 && (
        <section className="mt-10 rounded-2xl bg-white p-5 shadow-sm dark:bg-zinc-900 dark:ring-1 dark:ring-zinc-800">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-[15px] font-bold text-[#1A1A1A] dark:text-white">市场快讯</h2>
            <span className="text-[12px] text-[#999] dark:text-zinc-500">每 5 分钟更新</span>
          </div>
          <ul className="space-y-3">
            {news.map((n, i) => {
              const key = `${n.title}-${n.publish_time}-${i}`
              const isOpen = Boolean(expandedNews[key])
              return (
                <li key={key} className="rounded-xl border border-[#F0F0F0] p-4 dark:border-zinc-800">
                  <button
                    type="button"
                    onClick={() => setExpandedNews((prev) => ({ ...prev, [key]: !prev[key] }))}
                    className="w-full text-left"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <p className="min-w-0 flex-1 text-[13px] font-semibold text-[#1A1A1A] dark:text-white">
                        {n.title}
                      </p>
                      <div className="shrink-0 text-[12px] text-[#999] dark:text-zinc-500">
                        {n.source ? `${n.source} · ` : ''}
                        {n.publish_time || '—'}
                      </div>
                    </div>
                    {isOpen && n.summary && (
                      <p className="mt-2 whitespace-pre-wrap text-[12px] leading-relaxed text-[#666] dark:text-zinc-300">
                        {n.summary}
                      </p>
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
        </section>
      )}
    </div>
  )
}
