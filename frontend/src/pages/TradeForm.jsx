import { useCallback, useEffect, useMemo, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { ClipboardList, Plus } from 'lucide-react'
import { getTrades } from '../api'
import { useAuth } from '../contexts/AuthContext.jsx'
import { useUiPreferences } from '../contexts/UiPreferencesContext.jsx'
import { useToast } from '../components/Toast.jsx'

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
  if (!Number.isFinite(s)) return '🙂'
  if (s <= 2) return '😑'
  if (s <= 4) return '😊'
  if (s <= 6) return '🙂'
  if (s === 7) return '⚡'
  if (s === 8) return '😰'
  return '😤'
}

function directionLabel(dir) {
  return dir === 'sell' ? '卖出' : '买入'
}

export default function TradeForm() {
  const { user } = useAuth()
  const { t, dateLocale } = useUiPreferences()
  const userId = user?.id
  const showToast = useToast()
  const outlet = useOutletContext()
  const openTradeWizard = outlet?.openTradeWizard

  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState('all') // all | open | closed
  const [rows, setRows] = useState([])
  const [expandedId, setExpandedId] = useState(null)

  const load = useCallback(() => {
    if (!userId) return Promise.resolve()
    setLoading(true)
    return getTrades(userId, status === 'all' ? undefined : status)
      .then((list) => setRows(Array.isArray(list) ? list : []))
      .catch((e) => {
        setRows([])
        const d = e.response?.data?.detail
        const msg =
          typeof d === 'string' ? d : Array.isArray(d) ? d.map((x) => x.msg).join('；') : e.message
        showToast(msg || '加载失败', 'error')
      })
      .finally(() => setLoading(false))
  }, [showToast, status, userId])

  useEffect(() => {
    load()
  }, [load])

  const total = rows.length
  const title = t('nav.trade') || '交易记录'

  const emptyText = useMemo(() => {
    if (loading) return ''
    if (status === 'open') return '暂无持仓中交易'
    if (status === 'closed') return '暂无已平仓交易'
    return '暂无交易记录，点击右上角「录入交易」开始第一笔'
  }, [loading, status])

  return (
    <div className="text-[#1A1A1A] dark:text-zinc-100">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-black text-white dark:bg-white dark:text-zinc-900">
              <ClipboardList className="h-5 w-5" strokeWidth={2} aria-hidden />
            </div>
            <div>
              <h1 className="text-[28px] font-extrabold tracking-tight text-[#1A1A1A] dark:text-white">
                {title}
              </h1>
              <p className="mt-1 text-[13px] font-normal text-[#999] dark:text-zinc-500">
                查看你的全部交易记录与 AI 追问
              </p>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => openTradeWizard?.()}
          className="inline-flex h-[44px] items-center justify-center gap-2 rounded-xl bg-black px-4 text-[13px] font-semibold text-white transition-colors hover:bg-[#333] dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          <Plus className="h-4 w-4" strokeWidth={2} aria-hidden />
          录入交易
        </button>
      </header>

      <div className="mb-5 flex flex-wrap items-center gap-2">
        {[
          { key: 'all', label: `全部 (${total})` },
          { key: 'open', label: '持仓中' },
          { key: 'closed', label: '已平仓' },
        ].map((x) => (
          <button
            key={x.key}
            type="button"
            onClick={() => setStatus(x.key)}
            className={[
              'rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-all',
              status === x.key
                ? 'bg-black text-white dark:bg-white dark:text-zinc-900'
                : 'bg-[#F5F5F5] text-[#777] hover:bg-[#EEEEEE] dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800',
            ].join(' ')}
          >
            {x.label}
          </button>
        ))}
        <button
          type="button"
          onClick={load}
          className="ml-auto text-[12px] font-medium text-[#888] transition-colors hover:text-black dark:text-zinc-500 dark:hover:text-white"
        >
          刷新
        </button>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-[#F0F0F0] bg-white p-6 text-[13px] text-[#999] dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-500">
          加载中…
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-[#F0F0F0] bg-white p-10 text-center text-[13px] text-[#999] dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-500">
          {emptyText}
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {rows.map((tr) => {
            const isOpen = expandedId === tr.id
            const assetName = tr.asset?.name || tr.asset_name || '—'
            const assetCode = tr.asset?.code || tr.asset_code || ''
            const dir = tr.direction === 'sell' ? 'sell' : 'buy'
            const dirCls =
              dir === 'buy'
                ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/10 dark:text-emerald-300'
                : 'bg-red-50 text-red-700 dark:bg-red-900/10 dark:text-red-300'

            return (
              <li
                key={tr.id}
                className="rounded-2xl border border-[#F0F0F0] bg-white p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900 dark:shadow-none"
              >
                <button
                  type="button"
                  onClick={() => setExpandedId(isOpen ? null : tr.id)}
                  className="w-full text-left"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[16px]">{emotionEmoji(tr.emotion_score)}</span>
                        <div className="truncate text-[15px] font-semibold text-[#1A1A1A] dark:text-white">
                          {assetName}{' '}
                          {assetCode ? (
                            <span className="font-mono text-[12px] font-medium text-[#999] dark:text-zinc-500">
                              ({assetCode})
                            </span>
                          ) : null}
                        </div>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px] text-[#999] dark:text-zinc-500">
                        <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${dirCls}`}>
                          {directionLabel(dir)}
                        </span>
                        <span className="font-mono">
                          {Number(tr.price || 0).toLocaleString()} × {Number(tr.quantity || 0).toLocaleString()}
                        </span>
                        <span>·</span>
                        <span className="font-mono">{whenText(tr.traded_at, dateLocale)}</span>
                      </div>
                    </div>
                    <div className="text-[11px] font-semibold text-[#BBB] dark:text-zinc-600">
                      {tr.status === 'closed' ? '已平仓' : '持仓中'}
                    </div>
                  </div>

                  <div className="mt-3 line-clamp-2 text-[13px] leading-relaxed text-[#666] dark:text-zinc-300">
                    {tr.decision_note || '（无交易逻辑记录）'}
                  </div>
                </button>

                {isOpen && (
                  <div className="mt-4 rounded-2xl border border-[#F0F0F0] bg-[#FAFAFA] p-4 text-[13px] dark:border-zinc-800 dark:bg-zinc-950/30">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <div className="text-[11px] font-semibold text-[#BBB] dark:text-zinc-600">emotion_score</div>
                        <div className="mt-1 font-mono text-[13px] text-[#1A1A1A] dark:text-white">
                          {tr.emotion_score ?? '—'}
                        </div>
                      </div>
                      <div>
                        <div className="text-[11px] font-semibold text-[#BBB] dark:text-zinc-600">confidence_score</div>
                        <div className="mt-1 font-mono text-[13px] text-[#1A1A1A] dark:text-white">
                          {tr.confidence_score ?? '—'}
                        </div>
                      </div>
                    </div>

                    <div className="mt-3">
                      <div className="text-[11px] font-semibold text-[#BBB] dark:text-zinc-600">decision_note</div>
                      <div className="mt-1 whitespace-pre-wrap text-[13px] leading-relaxed text-[#1A1A1A] dark:text-zinc-100">
                        {tr.decision_note || '—'}
                      </div>
                    </div>

                    <div className="mt-3">
                      <div className="text-[11px] font-semibold text-[#BBB] dark:text-zinc-600">AI 追问</div>
                      <div className="mt-1 whitespace-pre-wrap text-[13px] leading-relaxed text-[#666] dark:text-zinc-300">
                        {tr.agent_question_text || '（尚无追问）'}
                      </div>
                    </div>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
