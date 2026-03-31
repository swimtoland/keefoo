import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  Calendar,
  CheckCircle,
  ClipboardCheck,
  Flame,
  Meh,
  Plus,
  Search,
  Shield,
  Smile,
  X,
  Zap,
} from 'lucide-react'
import { createTrade, searchAssets } from '../api'
import { useAuth } from '../contexts/AuthContext.jsx'
import { useUiPreferences } from '../contexts/UiPreferencesContext.jsx'
import { useToast } from './Toast.jsx'

const ASSET_TYPES = [
  { label: '股票', value: 'stock' },
  { label: '基金', value: 'fund' },
  { label: '债券', value: 'bond' },
  { label: '期货', value: 'futures' },
  { label: '贵金属', value: 'gold' },
]

function pad2(n) {
  return String(n).padStart(2, '0')
}

function localDatetimeValue(d = new Date()) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(
    d.getMinutes(),
  )}`
}

function todayKey() {
  const d = new Date()
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

function formatMoney(n) {
  if (!Number.isFinite(n)) return '0.00'
  return n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function confidenceLabel(v) {
  if (v <= 3) return '试探性建仓'
  if (v <= 6) return '有一定把握'
  if (v <= 8) return '比较确定'
  return '非常有信心'
}

export function TradeWizard({ open, onClose }) {
  const { user } = useAuth()
  const userId = user?.id
  const { t } = useUiPreferences()
  const showToast = useToast()

  const [closing, setClosing] = useState(false)
  const [step, setStep] = useState(1)
  const [emotionScore, setEmotionScore] = useState(null)

  // step2 form
  const [assetQuery, setAssetQuery] = useState('')
  const [assetPick, setAssetPick] = useState(null) // {id, code, name, asset_type}
  const [assetType, setAssetType] = useState('stock')
  const [direction, setDirection] = useState('buy')
  const [tradedAt, setTradedAt] = useState(() => localDatetimeValue())
  const [closeAt, setCloseAt] = useState('')
  const [price, setPrice] = useState('')
  const [quantity, setQuantity] = useState('')
  const [decisionNote, setDecisionNote] = useState('')
  const [confidence, setConfidence] = useState(5)
  const [submitting, setSubmitting] = useState(false)
  const [reviewPanelOpen, setReviewPanelOpen] = useState(false)
  const [execNote, setExecNote] = useState('')
  const [reviewNote, setReviewNote] = useState('')
  const [errorTagText, setErrorTagText] = useState('')
  const [errorTags, setErrorTags] = useState([])

  const [searchOpen, setSearchOpen] = useState(false)
  const [searchHits, setSearchHits] = useState([])
  const [searching, setSearching] = useState(false)
  const searchTimer = useRef(null)

  const decisionRef = useRef(null)

  const todayCount = useMemo(() => {
    const key = `keefoo_trade_count_${todayKey()}`
    const n = Number(localStorage.getItem(key) || '0')
    return Number.isFinite(n) && n >= 0 ? n : 0
  }, [open])

  const moodOptions = useMemo(
    () => [
      { key: 'calm', label: '平静', emoji: '😊', Icon: Smile, emotion_score: 3 },
      { key: 'excited', label: '兴奋', emoji: '⚡', Icon: Zap, emotion_score: 7 },
      { key: 'anxious', label: '焦虑', emoji: '😰', Icon: AlertTriangle, emotion_score: 8 },
      { key: 'angry', label: '愤怒', emoji: '😤', Icon: Flame, emotion_score: 9 },
      { key: 'bored', label: '无聊', emoji: '😑', Icon: Meh, emotion_score: 2 },
    ],
    [],
  )

  const moodHint = useMemo(() => {
    if (emotionScore === null) return null
    if (emotionScore === 7)
      return { tone: 'warn', text: t('tradeWizard.moodHintExcited') || '⚠ 兴奋时容易追高，注意控制仓位。' }
    if (emotionScore === 8)
      return { tone: 'risk', text: t('tradeWizard.moodHintAnxious') || '⚠ 焦虑时决策质量下降，建议观望。' }
    if (emotionScore >= 9)
      return { tone: 'danger', text: t('tradeWizard.moodHintAngry') || '⛔ 情绪化交易是亏损的主要来源，强烈建议暂停。' }
    return { tone: 'good', text: t('tradeWizard.moodHintGood') || '✓ 心态良好，祝交易顺利。' }
  }, [emotionScore, t])

  const hintCls =
    moodHint?.tone === 'danger'
      ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-900/30 dark:bg-red-900/10 dark:text-red-300'
      : moodHint?.tone === 'risk'
        ? 'border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-900/30 dark:bg-orange-900/10 dark:text-orange-300'
        : moodHint?.tone === 'warn'
          ? 'border-yellow-200 bg-yellow-50 text-yellow-700 dark:border-yellow-900/30 dark:bg-yellow-900/10 dark:text-yellow-300'
          : 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/30 dark:bg-emerald-900/10 dark:text-emerald-300'

  const overlayClose = useCallback(() => {
    if (closing) return
    setClosing(true)
    window.setTimeout(() => {
      setClosing(false)
      onClose?.()
    }, 300)
  }, [closing, onClose])

  const resetAll = useCallback(() => {
    setStep(1)
    setEmotionScore(null)
    setAssetQuery('')
    setAssetPick(null)
    setAssetType('stock')
    setDirection('buy')
    setTradedAt(localDatetimeValue())
    setCloseAt('')
    setPrice('')
    setQuantity('')
    setDecisionNote('')
    setConfidence(5)
    setReviewPanelOpen(false)
    setExecNote('')
    setReviewNote('')
    setErrorTagText('')
    setErrorTags([])
    setSearchOpen(false)
    setSearchHits([])
    setSearching(false)
  }, [])

  useEffect(() => {
    if (!open) return
    resetAll()
    setClosing(false)
  }, [open, resetAll])

  useEffect(() => {
    if (!open) return
    function onKeyDown(e) {
      if (e.key === 'Escape') overlayClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, overlayClose])

  // asset search (step2)
  useEffect(() => {
    if (!open) return
    if (step !== 2) return
    if (!searchOpen) return
    if (searchTimer.current) window.clearTimeout(searchTimer.current)
    searchTimer.current = window.setTimeout(() => {
      const q = assetQuery.trim()
      if (q.length < 1) {
        setSearchHits([])
        setSearching(false)
        return
      }
      setSearching(true)
      searchAssets(q)
        .then((rows) => setSearchHits(Array.isArray(rows) ? rows.slice(0, 5) : []))
        .catch(() => setSearchHits([]))
        .finally(() => setSearching(false))
    }, 260)
    return () => {
      if (searchTimer.current) window.clearTimeout(searchTimer.current)
    }
  }, [assetQuery, open, searchOpen, step])

  const pickAsset = useCallback((a) => {
    const next = {
      id: a.id,
      code: a.code || '',
      name: a.name || '',
      asset_type: a.asset_type || undefined,
    }
    setAssetPick(next)
    setAssetQuery(next.code || next.name || '')
    if (next.asset_type) setAssetType(next.asset_type)
    setSearchOpen(false)
    setSearchHits([])
  }, [])

  const pnlPreview = useMemo(() => {
    const p = Number(price)
    const q = Number(quantity)
    if (!Number.isFinite(p) || !Number.isFinite(q) || p <= 0 || q <= 0) return 0
    // As we don't have cost basis in this flow, show execution amount as preview.
    return p * q
  }, [price, quantity])

  const commonErrorTags = useMemo(
    () => ['追高', '恐慌卖出', '过度自信', '忽视止损', 'FOMO'],
    [],
  )

  const addErrorTag = useCallback((raw) => {
    const tag = String(raw || '').trim()
    if (!tag) return
    setErrorTags((prev) => {
      if (prev.includes(tag)) return prev
      return [...prev, tag]
    })
  }, [])

  const removeErrorTag = useCallback((tag) => {
    setErrorTags((prev) => prev.filter((x) => x !== tag))
  }, [])

  const mergedDecisionNote = useMemo(() => {
    const base = String(decisionNote || '').trim()
    const a = String(execNote || '').trim()
    const b = String(reviewNote || '').trim()
    const tags = errorTags
    const blocks = []
    if (base) blocks.push(base)
    if (a) blocks.push(`【笔记】\n${a}`)
    if (b) blocks.push(`【复盘笔记】\n${b}`)
    if (tags.length > 0) blocks.push(`【错误标签】${tags.join('、')}`)
    return blocks.join('\n\n').trim()
  }, [decisionNote, execNote, reviewNote, errorTags])

  async function handleSave() {
    if (!userId) {
      showToast('请先登录', 'error')
      return
    }
    if (emotionScore === null) {
      showToast('请先选择当前心态', 'error')
      return
    }
    const code = assetPick?.code?.trim() || assetQuery.trim()
    if (!code) {
      showToast('请选择或输入标的', 'error')
      return
    }
    const p = Number(price)
    const q = Number(quantity)
    if (!Number.isFinite(p) || p <= 0) {
      showToast('请输入有效价格', 'error')
      return
    }
    if (!Number.isFinite(q) || q <= 0) {
      showToast('请输入有效数量', 'error')
      return
    }
    setSubmitting(true)
    try {
      await createTrade(userId, {
        asset_code: code,
        asset_name: assetPick?.name?.trim() || undefined,
        asset_type: assetType,
        direction,
        price: p,
        quantity: q,
        traded_at: new Date(tradedAt).toISOString(),
        decision_note: mergedDecisionNote || undefined,
        emotion_score: emotionScore,
        confidence_score: Number(confidence) || 5,
        status: direction === 'sell' ? 'closed' : 'open',
      })

      const key = `keefoo_trade_count_${todayKey()}`
      const next = (Number(localStorage.getItem(key) || '0') || 0) + 1
      localStorage.setItem(key, String(next))

      showToast(t('tradeWizard.savedToast') || '交易已记录，AI 助手将在稍后追问你的交易逻辑', 'success')
      window.dispatchEvent(new Event('keefoo-pending-refresh'))
      overlayClose()
    } catch (err) {
      const d = err.response?.data?.detail
      const msg =
        typeof d === 'string' ? d : Array.isArray(d) ? d.map((x) => x.msg).join('；') : err.message
      showToast(msg || '提交失败', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[120]">
      <button
        type="button"
        aria-label="Close"
        onClick={overlayClose}
        className={[
          'absolute inset-0 transition-[opacity,backdrop-filter] duration-300',
          'bg-black/25 backdrop-blur-md',
          closing ? 'opacity-0 backdrop-blur-none' : 'opacity-100 backdrop-blur-md',
        ].join(' ')}
      />

      <div className="absolute inset-0 flex items-center justify-center px-4 py-8">
        {step === 1 ? (
          <div
            className={[
              'relative w-full max-w-[480px] rounded-[20px] bg-white shadow-2xl transition-[transform,opacity] duration-300',
              'dark:bg-zinc-950 dark:text-white',
              closing ? 'translate-y-2 opacity-0' : 'translate-y-0 opacity-100',
              'animate-[tw-wizard-in_300ms_ease-out]',
            ].join(' ')}
            style={{ animationName: closing ? undefined : 'tw-wizard-in' }}
            role="dialog"
            aria-modal="true"
          >
            <button
              type="button"
              onClick={overlayClose}
              className="absolute right-4 top-4 z-10 inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[#E5E5E5] bg-white text-[#555] transition-colors hover:bg-[#FAFAFA] hover:text-[#1A1A1A] dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300 dark:hover:bg-zinc-900"
              aria-label="Close"
            >
              <X className="h-4 w-4" strokeWidth={2} aria-hidden />
            </button>

            <div className="p-6 sm:p-7">
              <div className="transition-all duration-300">
                <div className="flex items-start gap-3 pr-10">
                  <div className="mt-0.5 inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-black/5 text-black dark:bg-white/10 dark:text-white">
                    <Shield className="h-5 w-5" strokeWidth={2} aria-hidden />
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-[22px] font-extrabold tracking-tight text-black dark:text-white">
                      {t('tradeWizard.step1Title')}
                    </h2>
                    <p className="mt-1 text-[13px] text-[#999] dark:text-zinc-500">{t('tradeWizard.step1Subtitle')}</p>
                  </div>
                </div>

                <div className="mt-6 space-y-4">
                  <div className="flex items-center justify-between rounded-2xl border border-[#F0F0F0] bg-[#FAFAFA] px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900/40">
                    <div className="text-[13px] font-medium text-[#1A1A1A] dark:text-zinc-100">
                      {String(t('tradeWizard.todayCount')).replace('{n}', String(todayCount))}
                    </div>
                    <div className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-black text-white dark:bg-white dark:text-zinc-900">
                      <Plus className="h-4 w-4" strokeWidth={2} aria-hidden />
                    </div>
                  </div>

                  <div>
                    <div className="text-[11px] font-semibold tracking-[0.16em] text-[#BBB] dark:text-zinc-600">
                      {t('tradeWizard.currentMood')}
                    </div>
                    <div className="mt-3 grid grid-cols-5 gap-2.5">
                      {moodOptions.map((m) => {
                        const selected = emotionScore === m.emotion_score
                        const Icon = m.Icon
                        return (
                          <button
                            key={m.key}
                            type="button"
                            onClick={() => setEmotionScore(m.emotion_score)}
                            className={[
                              'group flex flex-col items-center justify-center rounded-2xl border bg-white py-3 transition-all',
                              'dark:bg-zinc-950',
                              selected
                                ? 'border-black shadow-sm scale-[1.03] dark:border-white'
                                : 'border-[#E5E5E5] hover:border-[#CCC] dark:border-zinc-800 dark:hover:border-zinc-700',
                              'active:scale-[0.99]',
                            ].join(' ')}
                          >
                            <div className="inline-flex h-9 w-9 items-center justify-center rounded-2xl bg-black/5 text-black dark:bg-white/10 dark:text-white">
                              <Icon className="h-4.5 w-4.5" strokeWidth={2} aria-hidden />
                            </div>
                            <div className="mt-2 text-[11px] font-medium text-[#666] dark:text-zinc-300">
                              {m.emoji} {m.label}
                            </div>
                          </button>
                        )
                      })}
                    </div>

                    {moodHint && (
                      <div className={`mt-4 rounded-2xl border px-4 py-3 text-[12.5px] font-medium ${hintCls}`}>
                        {moodHint.text}
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-6 flex items-center justify-between">
                  <div className="text-[12px] text-[#999] dark:text-zinc-500">{t('tradeWizard.progressHalf')}</div>
                  <button
                    type="button"
                    disabled={emotionScore === null}
                    onClick={() => setStep(2)}
                    className="inline-flex items-center justify-center rounded-xl bg-black px-4 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-[#333] disabled:bg-[#DDD] disabled:text-white disabled:opacity-80 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200 dark:disabled:bg-zinc-700 dark:disabled:text-zinc-300"
                  >
                    {t('tradeWizard.continue')}
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div
            className={[
              'relative flex min-h-0 w-full max-w-full flex-col overflow-hidden rounded-[20px] bg-white shadow-2xl',
              'dark:bg-zinc-950 dark:text-white',
              closing ? 'translate-y-2 opacity-0' : 'translate-y-0 opacity-100',
              'transition-[transform,opacity] duration-300',
              'max-h-[85vh]',
            ].join(' ')}
            style={{
              width: reviewPanelOpen ? 900 : 640,
              maxWidth: 'calc(100vw - 2rem)',
              transition: 'width 300ms ease',
            }}
            role="dialog"
            aria-modal="true"
          >
            <button
              type="button"
              onClick={overlayClose}
              className="absolute right-4 top-4 z-10 inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[#E5E5E5] bg-white text-[#555] transition-colors hover:bg-[#FAFAFA] hover:text-[#1A1A1A] dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300 dark:hover:bg-zinc-900"
              aria-label="Close"
            >
              <X className="h-4 w-4" strokeWidth={2} aria-hidden />
            </button>

            <div className="flex min-h-0 flex-1 flex-row overflow-hidden">
              <div className="min-h-0 flex-1 min-w-0 overflow-y-auto p-8 pb-8 pt-14">
                <div className="flex items-start justify-between gap-4 pr-2">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-black text-white dark:bg-white dark:text-zinc-900">
                      <Plus className="h-5 w-5" strokeWidth={2} aria-hidden />
                    </div>
                    <div>
                      <h2 className="text-[22px] font-extrabold tracking-tight text-black dark:text-white">
                        {t('tradeWizard.step2Title')}
                      </h2>
                      <p className="mt-1 text-[13px] text-[#999] dark:text-zinc-500">
                        {t('tradeWizard.step2Subtitle')}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setReviewPanelOpen((v) => !v)}
                    className="mt-1 text-[12.5px] font-medium text-[#888] transition-colors hover:text-black dark:text-zinc-500 dark:hover:text-white"
                  >
                    {t('tradeWizard.goReport')}
                  </button>
                </div>

                <div className="mt-6 space-y-5">
                  {/* row 1 */}
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-12">
                    <div className="sm:col-span-7">
                      <div className="relative">
                        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[#BBB] dark:text-zinc-600">
                          <Search className="h-4 w-4" strokeWidth={2} aria-hidden />
                        </div>
                        <input
                          type="text"
                          value={assetQuery}
                          onChange={(e) => {
                            setAssetQuery(e.target.value)
                            setAssetPick(null)
                            setSearchOpen(true)
                          }}
                          onFocus={() => setSearchOpen(true)}
                          onBlur={() => window.setTimeout(() => setSearchOpen(false), 200)}
                          placeholder={t('tradeWizard.assetPh')}
                          className="h-11 w-full rounded-xl border border-[#E5E5E5] bg-white pl-10 pr-3 text-[14px] text-[#1A1A1A] outline-none transition-colors focus:border-black dark:border-zinc-800 dark:bg-zinc-950 dark:text-white dark:focus:border-zinc-400"
                          autoComplete="off"
                        />
                        {searching && (
                          <span className="absolute right-3 top-3 text-[11px] text-[#CCC] dark:text-zinc-600">
                            搜索中…
                          </span>
                        )}
                        {searchOpen && searchHits.length > 0 && (
                          <ul className="absolute z-50 mt-2 max-h-56 w-full overflow-auto rounded-2xl border border-[#F0F0F0] bg-white py-1 shadow-[0_12px_40px_-12px_rgba(0,0,0,0.18)] dark:border-zinc-800 dark:bg-zinc-950">
                            {searchHits.map((a) => (
                              <li key={a.id}>
                                <button
                                  type="button"
                                  onMouseDown={() => pickAsset(a)}
                                  className="flex w-full flex-col items-start px-4 py-2.5 text-left transition-colors hover:bg-[#FAFAFA] dark:hover:bg-zinc-900/40"
                                >
                                  <span className="font-mono text-[13px] text-[#1A1A1A] dark:text-white">
                                    {a.code}
                                  </span>
                                  <span className="text-[12px] text-[#999] dark:text-zinc-500">{a.name}</span>
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                      {assetPick?.name ? (
                        <div className="mt-2 text-[12px] text-[#888] dark:text-zinc-500">
                          已选择：<span className="font-semibold text-[#1A1A1A] dark:text-white">{assetPick.name}</span>{' '}
                          <span className="font-mono">({assetPick.code})</span>
                        </div>
                      ) : null}
                    </div>

                    <div className="sm:col-span-5">
                      <div className="grid grid-cols-2 gap-3">
                        <button
                          type="button"
                          onClick={() => setDirection('buy')}
                          className={[
                            'h-11 rounded-xl border text-[14px] font-semibold transition-all',
                            direction === 'buy'
                              ? 'border-emerald-500 bg-emerald-500 text-white'
                              : 'border-[#E5E5E5] bg-white text-[#666] hover:border-[#CCC] dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300 dark:hover:border-zinc-700',
                          ].join(' ')}
                        >
                          {t('tradeWizard.buy')}
                        </button>
                        <button
                          type="button"
                          onClick={() => setDirection('sell')}
                          className={[
                            'h-11 rounded-xl border text-[14px] font-semibold transition-all',
                            direction === 'sell'
                              ? 'border-red-500 bg-red-500 text-white'
                              : 'border-[#E5E5E5] bg-white text-[#666] hover:border-[#CCC] dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300 dark:hover:border-zinc-700',
                          ].join(' ')}
                        >
                          {t('tradeWizard.sell')}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* row 2 */}
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <div className="mb-1 text-[12px] font-semibold text-emerald-600 dark:text-emerald-400">
                        {t('tradeWizard.tradeTime')}
                      </div>
                      <div className="relative">
                        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[#BBB] dark:text-zinc-600">
                          <Calendar className="h-4 w-4" strokeWidth={2} aria-hidden />
                        </div>
                        <input
                          type="datetime-local"
                          value={tradedAt}
                          onChange={(e) => setTradedAt(e.target.value)}
                          className="h-11 w-full rounded-xl border border-[#E5E5E5] bg-white pl-10 pr-3 font-mono text-[13px] text-[#1A1A1A] outline-none transition-colors focus:border-black dark:border-zinc-800 dark:bg-zinc-950 dark:text-white dark:focus:border-zinc-400"
                        />
                      </div>
                    </div>
                    <div>
                      <div className="mb-1 text-[12px] font-semibold text-[#AAA] dark:text-zinc-500">
                        {t('tradeWizard.closeTime')}{' '}
                        <span className="font-normal">({t('tradeWizard.optional')})</span>
                      </div>
                      <div className="relative">
                        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[#BBB] dark:text-zinc-600">
                          <Calendar className="h-4 w-4" strokeWidth={2} aria-hidden />
                        </div>
                        <input
                          type="datetime-local"
                          value={closeAt}
                          onChange={(e) => setCloseAt(e.target.value)}
                          placeholder={t('tradeWizard.optional')}
                          className="h-11 w-full rounded-xl border border-[#E5E5E5] bg-white pl-10 pr-3 font-mono text-[13px] text-[#1A1A1A] outline-none transition-colors focus:border-black dark:border-zinc-800 dark:bg-zinc-950 dark:text-white dark:focus:border-zinc-400"
                        />
                      </div>
                    </div>
                  </div>

                  {/* row 3 */}
                  <div>
                    <div className="text-[13px] font-bold text-[#1A1A1A] dark:text-white">{t('tradeWizard.execTitle')}</div>
                    <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-12">
                      <div className="sm:col-span-4">
                        <input
                          type="number"
                          step="any"
                          min="0"
                          value={price}
                          onChange={(e) => setPrice(e.target.value)}
                          placeholder={t('tradeWizard.pricePh')}
                          className="h-11 w-full rounded-xl border border-[#E5E5E5] bg-white px-3 font-mono text-[13px] text-[#1A1A1A] outline-none transition-colors focus:border-black dark:border-zinc-800 dark:bg-zinc-950 dark:text-white dark:focus:border-zinc-400"
                        />
                      </div>
                      <div className="sm:col-span-4">
                        <input
                          type="number"
                          step="any"
                          min="0"
                          value={quantity}
                          onChange={(e) => setQuantity(e.target.value)}
                          placeholder={t('tradeWizard.qtyPh')}
                          className="h-11 w-full rounded-xl border border-[#E5E5E5] bg-white px-3 font-mono text-[13px] text-[#1A1A1A] outline-none transition-colors focus:border-black dark:border-zinc-800 dark:bg-zinc-950 dark:text-white dark:focus:border-zinc-400"
                        />
                      </div>
                      <div className="sm:col-span-4">
                        <select
                          value={assetType}
                          onChange={(e) => setAssetType(e.target.value)}
                          className="h-11 w-full rounded-xl border border-[#E5E5E5] bg-white px-3 text-[13px] text-[#1A1A1A] outline-none transition-colors focus:border-black dark:border-zinc-800 dark:bg-zinc-950 dark:text-white dark:focus:border-zinc-400"
                        >
                          {ASSET_TYPES.map((x) => (
                            <option key={x.value} value={x.value}>
                              {x.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* row 4 */}
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-12">
                    <div className="sm:col-span-7">
                      <div className="text-[13px] font-bold text-[#1A1A1A] dark:text-white">{t('tradeWizard.logicTitle')}</div>
                      <textarea
                        ref={decisionRef}
                        rows={5}
                        value={decisionNote}
                        onChange={(e) => setDecisionNote(e.target.value)}
                        placeholder={t('tradeWizard.decisionPh')}
                        className="mt-3 w-full resize-y rounded-xl border border-[#E5E5E5] bg-white px-4 py-3 text-[13px] text-[#1A1A1A] outline-none transition-colors focus:border-black dark:border-zinc-800 dark:bg-zinc-950 dark:text-white dark:focus:border-zinc-400"
                      />
                    </div>
                    <div className="sm:col-span-5">
                      <div className="text-[13px] font-bold text-[#1A1A1A] dark:text-white">{t('tradeWizard.confidence')}</div>
                      <div className="mt-4 rounded-2xl border border-[#F0F0F0] bg-[#FAFAFA] p-4 dark:border-zinc-800 dark:bg-zinc-900/40">
                        <input
                          type="range"
                          min={1}
                          max={10}
                          value={confidence}
                          onChange={(e) => setConfidence(Number(e.target.value))}
                          className="w-full"
                        />
                        <div className="mt-3 flex items-center justify-between">
                          <div className="text-[20px] font-extrabold tabular-nums text-black dark:text-white">
                            {confidence}
                          </div>
                          <div className="text-[12.5px] font-medium text-[#666] dark:text-zinc-300">
                            {confidenceLabel(confidence)}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* row 5 */}
                  <div className="flex items-end justify-between gap-4 rounded-2xl border border-[#F0F0F0] bg-white px-4 py-4 dark:border-zinc-800 dark:bg-zinc-950">
                    <div>
                      <div className="text-[12px] font-semibold text-[#BBB] dark:text-zinc-600">
                        {t('tradeWizard.pnlPreview')}
                      </div>
                      <div className="mt-1 text-[28px] font-extrabold tracking-tight text-black dark:text-white">
                        {formatMoney(pnlPreview)} ¥
                      </div>
                    </div>
                    <div className="text-[12px] font-semibold">
                      <span
                        className={
                          direction === 'buy'
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-red-600 dark:text-red-400'
                        }
                      >
                        {direction === 'buy' ? t('tradeWizard.statusOpen') : t('tradeWizard.statusClose')}
                      </span>
                    </div>
                  </div>

                  {/* footer */}
                  <div className="mt-2 flex items-center justify-between">
                    <div className="text-[12px] text-[#999] dark:text-zinc-500">
                      {emotionScore !== null ? (
                        <span className="inline-flex items-center gap-2">
                          <CheckCircle className="h-4 w-4 text-emerald-600 dark:text-emerald-400" strokeWidth={2} />
                          emotion_score: <span className="font-mono">{emotionScore}</span>
                        </span>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={overlayClose}
                        className="text-[13px] font-medium text-[#888] transition-colors hover:text-black dark:text-zinc-500 dark:hover:text-white"
                      >
                        {t('tradeWizard.cancel')}
                      </button>
                      <button
                        type="button"
                        onClick={handleSave}
                        disabled={submitting}
                        className="inline-flex items-center justify-center rounded-xl bg-black px-5 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-[#333] disabled:opacity-50 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
                      >
                        {submitting ? '保存中…' : t('tradeWizard.save')}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
              {reviewPanelOpen ? (
                <div className="min-h-0 w-[280px] flex-shrink-0 overflow-y-auto border-l border-gray-100 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-2">
                          <div className="mt-0.5 inline-flex h-9 w-9 items-center justify-center rounded-2xl bg-black/5 text-black dark:bg-white/10 dark:text-white">
                            <ClipboardCheck className="h-4.5 w-4.5" strokeWidth={2} aria-hidden />
                          </div>
                          <div>
                            <div className="text-[14px] font-extrabold text-black dark:text-white">复盘与错误</div>
                            <div className="mt-0.5 text-[12px] text-[#999] dark:text-zinc-500">记录你的交易思考</div>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setReviewPanelOpen(false)}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-[#E5E5E5] bg-white text-[#555] transition-colors hover:bg-[#FAFAFA] hover:text-[#1A1A1A] dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300 dark:hover:bg-zinc-900"
                          aria-label="Close panel"
                        >
                          <X className="h-4 w-4" strokeWidth={2} aria-hidden />
                        </button>
                      </div>

                      <div className="mt-4 space-y-4">
                        <div>
                          <div className="text-[12.5px] font-bold text-[#1A1A1A] dark:text-white">📝 笔记</div>
                          <textarea
                            rows={4}
                            value={execNote}
                            onChange={(e) => setExecNote(e.target.value)}
                            placeholder="执行笔记、入场前的想法..."
                            className="mt-2 w-full resize-y rounded-xl border border-[#E5E5E5] bg-white px-3 py-2.5 text-[13px] text-[#1A1A1A] outline-none transition-colors focus:border-black dark:border-zinc-800 dark:bg-zinc-950 dark:text-white dark:focus:border-zinc-400"
                          />
                        </div>

                        <div>
                          <div className="text-[12.5px] font-bold text-[#1A1A1A] dark:text-white">📋 复盘笔记</div>
                          <textarea
                            rows={4}
                            value={reviewNote}
                            onChange={(e) => setReviewNote(e.target.value)}
                            placeholder="交易后分析、经验教训..."
                            className="mt-2 w-full resize-y rounded-xl border border-[#E5E5E5] bg-white px-3 py-2.5 text-[13px] text-[#1A1A1A] outline-none transition-colors focus:border-black dark:border-zinc-800 dark:bg-zinc-950 dark:text-white dark:focus:border-zinc-400"
                          />
                        </div>

                        <div>
                          <div className="text-[12.5px] font-bold text-[#1A1A1A] dark:text-white">⚠ 错误标签</div>
                          <div className="mt-2 flex items-center gap-2">
                            <input
                              type="text"
                              value={errorTagText}
                              onChange={(e) => setErrorTagText(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault()
                                  addErrorTag(errorTagText)
                                  setErrorTagText('')
                                }
                              }}
                              placeholder="添加标签 (如：踏空)..."
                              className="h-10 flex-1 rounded-xl border border-[#E5E5E5] bg-white px-3 text-[13px] text-[#1A1A1A] outline-none transition-colors focus:border-black dark:border-zinc-800 dark:bg-zinc-950 dark:text-white dark:focus:border-zinc-400"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                addErrorTag(errorTagText)
                                setErrorTagText('')
                              }}
                              className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-black text-white transition-colors hover:bg-[#333] dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
                              aria-label="Add tag"
                            >
                              <Plus className="h-4 w-4" strokeWidth={2} aria-hidden />
                            </button>
                          </div>

                          {errorTags.length > 0 && (
                            <div className="mt-3 flex flex-wrap gap-2">
                              {errorTags.map((tag) => (
                                <button
                                  key={tag}
                                  type="button"
                                  onClick={() => removeErrorTag(tag)}
                                  className="inline-flex items-center gap-1.5 rounded-full border border-[#E5E5E5] bg-white px-3 py-1 text-[12px] font-medium text-[#666] transition-colors hover:bg-[#FAFAFA] dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300 dark:hover:bg-zinc-900"
                                >
                                  {tag}
                                  <X className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                                </button>
                              ))}
                            </div>
                          )}

                          <div className="mt-3 flex flex-wrap gap-2">
                            {commonErrorTags.map((tag) => {
                              const picked = errorTags.includes(tag)
                              return (
                                <button
                                  key={tag}
                                  type="button"
                                  onClick={() => (picked ? removeErrorTag(tag) : addErrorTag(tag))}
                                  className={[
                                    'rounded-full px-3 py-1 text-[12px] font-medium transition-colors',
                                    picked
                                      ? 'bg-black text-white dark:bg-white dark:text-zinc-900'
                                      : 'bg-[#F5F5F5] text-[#777] hover:bg-[#EEEEEE] dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800',
                                  ].join(' ')}
                                >
                                  {tag}
                                </button>
                              )
                            })}
                          </div>
                        </div>
                      </div>
                </div>
              ) : null}
            </div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes tw-wizard-in {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}

