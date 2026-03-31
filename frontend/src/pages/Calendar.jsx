import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  CalendarDays,
  CalendarX,
  ChevronLeft,
  ChevronRight,
  Clock,
  Plus,
  Search,
  X,
} from 'lucide-react'
import {
  createReminder,
  deleteReminder,
  getCalendarDay,
  getCalendarMonth,
  searchAssets,
  updateReminder,
} from '../api'
import { useAuth } from '../contexts/AuthContext.jsx'
import { useUiPreferences } from '../contexts/UiPreferencesContext.jsx'
import { useToast } from '../components/Toast.jsx'

function pad2(n) {
  return String(n).padStart(2, '0')
}

function isoDate(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

function addDays(d, n) {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}

function monthKey(year, month) {
  return `${year}-${pad2(month)}`
}

const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function formatMonthTitleEn(year, month) {
  return `${MONTHS_EN[month - 1]}' ${year}`
}

const WEEKDAY_EN = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']

/** Reference UI: coral accent */
const ACCENT = '#E65F45'

function cnWeekdayLong(i) {
  return ['周一', '周二', '周三', '周四', '周五', '周六', '周日'][i] || ''
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

function formatZhDayHeader(d) {
  const m = d.getMonth() + 1
  const day = d.getDate()
  const weekday = cnWeekdayLong((d.getDay() + 6) % 7)
  return `${m}月${day}日 ${weekday}`
}

function pill(cls) {
  return `inline-flex items-center justify-center rounded-full px-3 py-1.5 text-[12px] font-semibold transition-colors ${cls}`
}

function Modal({ open, onClose, children }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-[140]">
      <button
        type="button"
        onClick={onClose}
        className="absolute inset-0 bg-black/25 backdrop-blur-md transition-[opacity,backdrop-filter] duration-300"
        aria-label="Close"
      />
      <div className="absolute inset-0 flex items-center justify-center px-4 py-8">
        {children}
      </div>
    </div>
  )
}

/** Build ordered preview entries for month cell: trades → reminders → notes */
function buildMonthPreviewEntries(dayData) {
  if (!dayData) return []
  const entries = []
  for (const tr of dayData.trades || []) {
    entries.push({ kind: 'trade', trade: tr })
  }
  for (const r of dayData.reminders || []) {
    entries.push({ kind: 'reminder', reminder: r })
  }
  for (const n of dayData.notes || []) {
    entries.push({ kind: 'note', note: n })
  }
  return entries
}

export default function Calendar() {
  const { user } = useAuth()
  const userId = user?.id
  const { t } = useUiPreferences()
  const showToast = useToast()
  const navigate = useNavigate()

  const view = 'month'
  const [cursorDate, setCursorDate] = useState(() => {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    return d
  })

  const [monthCache, setMonthCache] = useState({})
  const [monthLoading, setMonthLoading] = useState(false)

  /** Prefetched full-day payloads for rich month cells (same API as detail panel). */
  const [dayPreviewByDate, setDayPreviewByDate] = useState({})

  const [selectedDate, setSelectedDate] = useState(null)
  const [dayLoading, setDayLoading] = useState(false)
  const [dayData, setDayData] = useState(null)

  const [newReminderOpen, setNewReminderOpen] = useState(false)
  const [remTitle, setRemTitle] = useState('')
  const [remDesc, setRemDesc] = useState('')
  const [remDate, setRemDate] = useState(() => isoDate(new Date()))
  const [remTime, setRemTime] = useState('')
  const [remPriority, setRemPriority] = useState('medium')
  const [remAssetQuery, setRemAssetQuery] = useState('')
  const [remAssetPick, setRemAssetPick] = useState(null)
  const [remSaving, setRemSaving] = useState(false)
  const [assetHits, setAssetHits] = useState([])
  const [assetSearching, setAssetSearching] = useState(false)
  const [assetOpen, setAssetOpen] = useState(false)
  const assetTimer = useRef(null)

  const [quickText, setQuickText] = useState('')
  const [quickSaving, setQuickSaving] = useState(false)

  const year = cursorDate.getFullYear()
  const month = cursorDate.getMonth() + 1
  const mKey = monthKey(year, month)
  const monthOverview = monthCache[mKey] || null

  const todayIso = useMemo(() => isoDate(new Date()), [])

  const closeDayPanel = useCallback(() => {
    setSelectedDate(null)
    setDayData(null)
  }, [])

  const refreshMonth = useCallback(async () => {
    if (!userId) return
    setMonthLoading(true)
    try {
      const data = await getCalendarMonth(userId, year, month)
      setMonthCache((prev) => ({ ...prev, [mKey]: Array.isArray(data) ? data : [] }))
    } catch (e) {
      const d = e.response?.data?.detail
      showToast(typeof d === 'string' ? d : e.message || '加载失败', 'error')
    } finally {
      setMonthLoading(false)
    }
  }, [mKey, month, showToast, userId, year])

  const openDay = useCallback(
    async (d) => {
      if (!userId) return
      setSelectedDate(d)
      setDayLoading(true)
      setDayData(null)
      try {
        const data = await getCalendarDay(userId, isoDate(d))
        setDayData(data)
      } catch (e) {
        const dd = e.response?.data?.detail
        showToast(typeof dd === 'string' ? dd : e.message || '加载失败', 'error')
      } finally {
        setDayLoading(false)
      }
    },
    [showToast, userId],
  )

  useEffect(() => {
    if (!userId) return
    refreshMonth()
  }, [refreshMonth, userId])

  /** Rich month previews: fetch day detail for days with any activity (month overview is count-only). */
  useEffect(() => {
    if (!userId || !monthOverview || monthOverview.length === 0) {
      setDayPreviewByDate({})
      return
    }
    let cancelled = false
    const active = monthOverview.filter(
      (row) => (row.trade_count || 0) + (row.note_count || 0) + (row.reminder_count || 0) > 0,
    )
    if (active.length === 0) {
      setDayPreviewByDate({})
      return
    }
    Promise.all(active.map((row) => getCalendarDay(userId, row.date)))
      .then((days) => {
        if (cancelled) return
        const next = {}
        for (let i = 0; i < active.length; i++) {
          next[active[i].date] = days[i]
        }
        setDayPreviewByDate(next)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [userId, monthOverview, mKey])

  useEffect(() => {
    if (!newReminderOpen) return
    if (!assetOpen) return
    if (assetTimer.current) window.clearTimeout(assetTimer.current)
    assetTimer.current = window.setTimeout(() => {
      const q = remAssetQuery.trim()
      if (!q) {
        setAssetHits([])
        setAssetSearching(false)
        return
      }
      setAssetSearching(true)
      searchAssets(q)
        .then((rows) => setAssetHits(Array.isArray(rows) ? rows.slice(0, 5) : []))
        .catch(() => setAssetHits([]))
        .finally(() => setAssetSearching(false))
    }, 260)
    return () => {
      if (assetTimer.current) window.clearTimeout(assetTimer.current)
    }
  }, [assetOpen, newReminderOpen, remAssetQuery])

  const prev = () => {
    const d = new Date(cursorDate)
    d.setMonth(d.getMonth() - 1)
    d.setDate(1)
    setCursorDate(d)
  }

  const next = () => {
    const d = new Date(cursorDate)
    d.setMonth(d.getMonth() + 1)
    d.setDate(1)
    setCursorDate(d)
  }

  const monthGrid = useMemo(() => {
    const first = new Date(year, month - 1, 1)
    const last = new Date(year, month, 0)
    const daysInMonth = last.getDate()
    const firstWeekdayMon = (first.getDay() + 6) % 7
    const cells = []
    for (let i = 0; i < firstWeekdayMon; i++) {
      const d = new Date(first)
      d.setDate(d.getDate() - (firstWeekdayMon - i))
      cells.push({ date: d, inMonth: false })
    }
    for (let i = 1; i <= daysInMonth; i++) {
      cells.push({ date: new Date(year, month - 1, i), inMonth: true })
    }
    while (cells.length % 7 !== 0) {
      const prevCell = cells[cells.length - 1]?.date
      const nd = prevCell ? addDays(prevCell, 1) : addDays(last, 1)
      cells.push({ date: nd, inMonth: false })
    }
    return cells
  }, [month, year])

  const monthMap = useMemo(() => {
    const map = {}
    for (const row of monthOverview || []) {
      map[row.date] = row
    }
    return map
  }, [monthOverview])

  async function toggleReminderCompleted(rem) {
    if (!userId) return
    const prevList = dayData?.reminders || []
    const nextCompleted = !rem.is_completed
    setDayData((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        reminders: prev.reminders.map((x) => (x.id === rem.id ? { ...x, is_completed: nextCompleted } : x)),
      }
    })
    try {
      await updateReminder(rem.id, { is_completed: nextCompleted })
    } catch (e) {
      setDayData((prev) => {
        if (!prev) return prev
        return { ...prev, reminders: prevList }
      })
      const d = e.response?.data?.detail
      showToast(typeof d === 'string' ? d : e.message || '更新失败', 'error')
    }
  }

  async function removeReminder(rem) {
    if (!userId) return
    try {
      await deleteReminder(rem.id)
      if (selectedDate) await openDay(new Date(selectedDate))
      await refreshMonth()
      showToast('已删除', 'success')
    } catch (e) {
      const d = e.response?.data?.detail
      showToast(typeof d === 'string' ? d : e.message || '删除失败', 'error')
    }
  }

  async function quickAddReminder() {
    if (!userId) return
    const title = quickText.trim()
    if (!title) return
    setQuickSaving(true)
    try {
      await createReminder(userId, {
        title,
        remind_date: selectedDate ? isoDate(selectedDate) : todayIso,
        priority: 'medium',
      })
      setQuickText('')
      if (selectedDate) await openDay(new Date(selectedDate))
      await refreshMonth()
      showToast('提醒已添加', 'success')
    } catch (e) {
      const d = e.response?.data?.detail
      showToast(typeof d === 'string' ? d : e.message || '创建失败', 'error')
    } finally {
      setQuickSaving(false)
    }
  }

  async function saveNewReminder() {
    if (!userId) return
    if (!remTitle.trim()) {
      showToast('请填写标题', 'error')
      return
    }
    setRemSaving(true)
    try {
      await createReminder(userId, {
        title: remTitle.trim(),
        description: remDesc.trim() || undefined,
        remind_date: remDate,
        remind_time: remTime || undefined,
        priority: remPriority,
        linked_asset_id: remAssetPick?.id || undefined,
      })
      setNewReminderOpen(false)
      setRemTitle('')
      setRemDesc('')
      setRemTime('')
      setRemPriority('medium')
      setRemAssetQuery('')
      setRemAssetPick(null)
      await refreshMonth()
      if (selectedDate && isoDate(selectedDate) === remDate) {
        await openDay(new Date(selectedDate))
      }
      showToast('提醒已创建', 'success')
    } catch (e) {
      const d = e.response?.data?.detail
      showToast(typeof d === 'string' ? d : e.message || '创建失败', 'error')
    } finally {
      setRemSaving(false)
    }
  }

  const panelOpen = Boolean(selectedDate)
  const panelTransform = panelOpen ? 'translate-x-0' : 'translate-x-full'

  const now = new Date()
  const isViewingMonthWithToday =
    view === 'month' && year === now.getFullYear() && month === now.getMonth() + 1
  const todayWeekdayCol = (now.getDay() + 6) % 7

  useEffect(() => {
    if (!panelOpen) return
    const onKeyDown = (e) => {
      if (e.key === 'Escape') closeDayPanel()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [closeDayPanel, panelOpen])

  return (
    <div className="relative flex h-full w-full min-w-0 overflow-hidden bg-white text-[#000000] dark:bg-zinc-950 dark:text-zinc-100">
      <div className="min-w-0 flex-1 pr-0">
        {/* Header — reference: title + nav left, calendar icon center, actions right */}
        <div className="relative">
          <div className="mb-2 flex justify-center sm:mb-0 sm:hidden" aria-hidden>
            <CalendarDays className="h-6 w-6 text-[#CCCCCC] dark:text-zinc-600" strokeWidth={1.5} />
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 sm:max-w-[min(100%,520px)]">
              <div className="flex flex-wrap items-baseline gap-3">
                <h1 className="text-[38px] font-extrabold leading-[1.05] tracking-tight text-black dark:text-white">
                  {formatMonthTitleEn(year, month)}
                </h1>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={prev}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-[#666] transition-colors hover:bg-black/[0.04] hover:text-black dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-white"
                    aria-label="prev month"
                  >
                    <ChevronLeft className="h-5 w-5" strokeWidth={2} />
                  </button>
                  <span className="select-none text-[14px] font-medium text-[#CCCCCC] dark:text-zinc-600">·</span>
                  <button
                    type="button"
                    onClick={next}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-[#666] transition-colors hover:bg-black/[0.04] hover:text-black dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-white"
                    aria-label="next month"
                  >
                    <ChevronRight className="h-5 w-5" strokeWidth={2} />
                  </button>
                </div>
              </div>
              <p className="mt-3 max-w-lg text-[14px] leading-relaxed text-[#999999] dark:text-zinc-500">
                在这里查看你所有的投资活动记录。
                <br />
                交易、笔记与提醒按日期汇聚在日历格中。
              </p>
            </div>

            <div
              className="pointer-events-none absolute left-1/2 top-0 hidden -translate-x-1/2 sm:block"
              aria-hidden
            >
              <div className="flex h-[52px] items-center justify-center text-[#CCCCCC] dark:text-zinc-600">
                <CalendarDays className="h-7 w-7" strokeWidth={1.5} />
              </div>
            </div>

            <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 sm:pt-1">
              <button
                type="button"
                onClick={() => {
                  setNewReminderOpen(true)
                  setRemDate(selectedDate ? isoDate(selectedDate) : todayIso)
                }}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-black px-5 text-[13px] font-semibold text-white shadow-sm transition-colors hover:bg-[#222] dark:bg-white dark:text-zinc-900 dark:shadow-none dark:hover:bg-zinc-200"
              >
                <Plus className="h-4 w-4" strokeWidth={2} aria-hidden />
                {t('calendar.newReminder')}
              </button>
            </div>
          </div>
        </div>

        {/* Main views */}
        <div className="mt-6 min-w-0">
          <div key={mKey} className="animate-[cal-fade_200ms_ease-out] min-w-0">
              {/* Weekday header — thin rule; today column accent underline */}
              <div className="grid grid-cols-7">
                {WEEKDAY_EN.map((w, i) => {
                  const isTodayCol = isViewingMonthWithToday && i === todayWeekdayCol
                  return (
                    <div
                      key={w}
                      className={[
                        'px-1 pb-2 text-center text-[11px] font-semibold uppercase tracking-wider',
                        isTodayCol ? 'border-b-2' : 'border-b border-black/[0.08] dark:border-white/10',
                        isTodayCol ? '' : 'text-[#999999] dark:text-zinc-500',
                      ].join(' ')}
                      style={
                        isTodayCol
                          ? { borderColor: ACCENT, color: ACCENT }
                          : undefined
                      }
                    >
                      {w}
                    </div>
                  )
                })}
              </div>

              {/* Grid — horizontal rules only, no vertical column lines */}
              <div className="min-w-0">
                <div className="grid grid-cols-7">
                  {monthGrid.map(({ date: d, inMonth }, idx) => {
                    const k = isoDate(d)
                    const row = monthMap[k]
                    const isToday = k === todayIso
                    const isSelected = selectedDate && isoDate(selectedDate) === k
                    const preview = dayPreviewByDate[k]
                    const entries = buildMonthPreviewEntries(preview)
                    const total = entries.length
                    const shown = entries.slice(0, 3)
                    const more = Math.max(0, total - shown.length)

                    const leftBarSelected =
                      isSelected && !isToday ? 'before:bg-black dark:before:bg-white' : 'before:bg-transparent'

                    return (
                      <button
                        key={`${k}-${idx}`}
                        type="button"
                        onClick={() => openDay(d)}
                        className={[
                          'relative min-h-[112px] w-full cursor-pointer rounded-none border border-[#E5E5E5] bg-white px-2 py-2.5 pt-9 text-left transition-all duration-200 ease-out dark:border-zinc-800 dark:bg-zinc-950',
                          'hover:-translate-y-[2px] hover:scale-[1.01] hover:border-black/30 hover:bg-white hover:shadow-lg dark:hover:border-white/20 dark:hover:bg-zinc-950',
                          isToday
                            ? 'bg-[#F9F7F5] dark:bg-zinc-900/60'
                            : isSelected
                              ? 'bg-[#F9F9F9] dark:bg-zinc-900/35'
                              : '',
                          'before:absolute before:left-0 before:top-0 before:z-[1] before:h-full before:w-[3px] before:content-[""]',
                          isSelected && !isToday ? leftBarSelected : 'before:bg-transparent',
                          !inMonth ? 'opacity-80' : '',
                        ].join(' ')}
                      >
                        <div
                          className={[
                            'absolute left-2 top-2 text-[24px] font-bold leading-none',
                            !inMonth && 'text-[#D4D4D4] dark:text-zinc-600',
                            inMonth && !isToday && isSelected && 'font-extrabold text-black dark:text-white',
                            inMonth && !isToday && !isSelected && 'text-black dark:text-zinc-100',
                            inMonth && isToday && 'font-extrabold',
                          ]
                            .filter(Boolean)
                            .join(' ')}
                          style={inMonth && isToday ? { color: ACCENT } : undefined}
                        >
                          {d.getDate()}
                        </div>

                        <div className="relative z-[2] mt-2 space-y-1.5">
                          {shown.map((entry, i) => {
                            if (entry.kind === 'trade') {
                              const tr = entry.trade
                              const isSell = tr.direction === 'sell'
                              const name = tr.asset?.name || '—'
                              return (
                                <div key={`t-${tr.id}-${i}`} className="min-w-0">
                                  <div className="truncate text-[12px] font-semibold leading-snug text-black dark:text-neutral-100">
                                    <span className={isSell ? 'text-[#EF4444]' : 'text-[#22C55E]'}>
                                      {isSell ? '卖出' : '买入'}{' '}
                                    </span>
                                    <span>{name}</span>
                                  </div>
                                  <div className="mt-0.5 truncate text-[10px] leading-snug text-[#999999] dark:text-zinc-500">
                                    ¥{Number(tr.price).toLocaleString()} × {Number(tr.quantity).toLocaleString()}
                                  </div>
                                </div>
                              )
                            }
                            if (entry.kind === 'reminder') {
                              const r = entry.reminder
                              const urgent = r.priority === 'high'
                              return (
                                <div key={`r-${r.id}-${i}`} className="min-w-0">
                                  <div
                                    className={[
                                      'truncate text-[12px] font-semibold leading-snug',
                                      r.is_completed
                                        ? 'text-[#9CA3AF] line-through dark:text-zinc-600'
                                        : '',
                                    ].join(' ')}
                                    style={!r.is_completed ? { color: ACCENT } : undefined}
                                  >
                                    {urgent && !r.is_completed ? '⚠ ' : ''}
                                    {r.title}
                                  </div>
                                  <div className="mt-0.5 text-[10px] text-[#999999] dark:text-zinc-500">
                                    {r.remind_time ? '定时' : '全天'}
                                  </div>
                                </div>
                              )
                            }
                            const n = entry.note
                            return (
                              <div key={`n-${n.id}-${i}`} className="min-w-0">
                                <div className="truncate text-[12px] font-semibold leading-snug text-black dark:text-neutral-100">
                                  {n.title}
                                </div>
                                <div className="mt-0.5 truncate text-[10px] text-[#999999] dark:text-zinc-500">
                                  笔记
                                </div>
                              </div>
                            )
                          })}

                          {!preview && row && (row.trade_count || row.note_count || row.reminder_count) ? (
                            <div className="text-[12px] text-[#BBBBBB] dark:text-zinc-600">加载预览…</div>
                          ) : null}

                          {preview && total === 0 && row
                            ? (row.trade_count || 0) + (row.note_count || 0) + (row.reminder_count || 0) > 0 && (
                                <div className="text-[12px] text-[#999999] dark:text-zinc-500">
                                  共 {row.trade_count + row.note_count + row.reminder_count} 条记录
                                </div>
                              )
                            : null}

                          {more > 0 ? (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                openDay(d)
                              }}
                              className="text-left text-[12px] font-medium text-[#999999] underline decoration-[#DDDDDD] underline-offset-[3px] transition-colors hover:text-[#666666] dark:text-zinc-500 dark:decoration-zinc-700 dark:hover:text-zinc-300"
                            >
                              And {more} more
                            </button>
                          ) : null}
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>

              {monthLoading ? (
                <div className="mt-4 text-[12px] text-[#999999] dark:text-zinc-500">加载中…</div>
              ) : null}
          </div>
        </div>
      </div>

      {/* Day detail modal (same feel as TradeWizard) */}
      <Modal open={panelOpen} onClose={closeDayPanel}>
        <div
          className="relative w-full max-w-[900px] overflow-hidden rounded-[20px] bg-white shadow-2xl dark:bg-zinc-950 dark:text-white"
          style={{ maxHeight: '85vh' }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex min-h-0 flex-col" style={{ maxHeight: '85vh' }}>
            <div className="flex items-start justify-between gap-3 border-b border-[#F0F0F0] px-6 py-5 dark:border-zinc-800">
              <div className="min-w-0">
                <div className="truncate text-[18px] font-extrabold text-[#1A1A1A] dark:text-white">
                  {selectedDate ? formatZhDayHeader(selectedDate) : ''}
                </div>
                <div className="mt-1 text-[12px] text-[#999] dark:text-zinc-500">
                  {dayLoading ? '加载中…' : ''}
                </div>
              </div>
              <button
                type="button"
                onClick={closeDayPanel}
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[#E5E5E5] bg-white text-[#555] transition-colors hover:bg-[#FAFAFA] hover:text-[#1A1A1A] dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300 dark:hover:bg-zinc-900"
                aria-label="close"
              >
                <X className="h-4 w-4" strokeWidth={2} />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
            {!dayLoading && dayData && dayData.trade_count + dayData.note_count + dayData.reminder_count === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <CalendarX className="h-10 w-10 text-[#DDD] dark:text-zinc-700" strokeWidth={1.5} aria-hidden />
                <div className="mt-4 text-[14px] font-semibold text-[#1A1A1A] dark:text-white">
                  {t('calendar.emptyTitle')}
                </div>
                <div className="mt-1 text-[12px] text-[#999] dark:text-zinc-500">{t('calendar.emptyBody')}</div>
              </div>
            ) : null}

            {dayData?.trades?.length ? (
              <div className="mb-5">
                <div className="mb-2 flex items-center justify-between">
                  <div className="inline-flex items-center gap-2 text-[13px] font-extrabold text-[#1A1A1A] dark:text-white">
                    <span className="h-2 w-2 rounded-full bg-emerald-500" />
                    {t('calendar.trade')}
                  </div>
                  <div className="text-[12px] font-semibold text-[#999] dark:text-zinc-500">
                    {dayData.trades.length}
                  </div>
                </div>
                <div className="space-y-2">
                  {dayData.trades.map((tr) => {
                    const dir = tr.direction === 'sell' ? 'sell' : 'buy'
                    const tagCls =
                      dir === 'buy'
                        ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/10 dark:text-emerald-300'
                        : 'bg-red-50 text-red-700 dark:bg-red-900/10 dark:text-red-300'
                    return (
                      <button
                        key={tr.id}
                        type="button"
                        onClick={() => navigate(`/asset/${tr.asset?.id || tr.asset_id}`)}
                        className="w-full rounded-2xl border border-[#F0F0F0] bg-white p-3 text-left transition-colors hover:bg-[#FAFAFA] dark:border-zinc-800 dark:bg-zinc-950 dark:hover:bg-zinc-900/40"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${tagCls}`}>
                                {dir === 'buy' ? '买入' : '卖出'}
                              </span>
                              <span className="truncate text-[13px] font-semibold text-[#1A1A1A] dark:text-white">
                                {tr.asset?.name || '—'}
                              </span>
                              <span className="font-mono text-[11px] text-[#999] dark:text-zinc-500">
                                {tr.asset?.code || ''}
                              </span>
                            </div>
                            <div className="mt-1 text-[12px] text-[#666] dark:text-zinc-300">
                              {Number(tr.price).toLocaleString()} × {Number(tr.quantity).toLocaleString()}
                            </div>
                            {tr.decision_note ? (
                              <div className="mt-2 line-clamp-2 text-[12px] text-[#999] dark:text-zinc-500">
                                {tr.decision_note}
                              </div>
                            ) : null}
                          </div>
                          <div className="text-[16px]">{emotionEmoji(tr.emotion_score)}</div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            ) : null}

            {dayData?.notes?.length ? (
              <div className="mb-5">
                <div className="mb-2 flex items-center justify-between">
                  <div className="inline-flex items-center gap-2 text-[13px] font-extrabold text-[#1A1A1A] dark:text-white">
                    <span className="h-2 w-2 rounded-full bg-blue-500" />
                    {t('calendar.notes')}
                  </div>
                  <div className="text-[12px] font-semibold text-[#999] dark:text-zinc-500">
                    {dayData.notes.length}
                  </div>
                </div>
                <div className="space-y-2">
                  {dayData.notes.map((n) => (
                    <button
                      key={n.id}
                      type="button"
                      onClick={() => navigate('/notebook', { state: { noteId: n.id } })}
                      className="w-full rounded-2xl border border-[#F0F0F0] bg-white p-3 text-left transition-colors hover:bg-[#FAFAFA] dark:border-zinc-800 dark:bg-zinc-950 dark:hover:bg-zinc-900/40"
                    >
                      <div className="truncate text-[13px] font-semibold text-[#1A1A1A] dark:text-white">
                        {n.title}
                      </div>
                      <div className="mt-1 line-clamp-2 text-[12px] text-[#999] dark:text-zinc-500">
                        {n.content_preview}
                      </div>
                      {n.linked_asset_name ? (
                        <div className="mt-2 inline-flex rounded-full bg-[#F5F5F5] px-2.5 py-1 text-[11px] font-semibold text-[#666] dark:bg-zinc-900 dark:text-zinc-300">
                          {n.linked_asset_name}
                        </div>
                      ) : null}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {dayData?.reminders?.length ? (
              <div className="mb-4">
                <div className="mb-2 flex items-center justify-between">
                  <div className="inline-flex items-center gap-2 text-[13px] font-extrabold text-[#1A1A1A] dark:text-white">
                    <span className="h-2 w-2 rounded-full bg-amber-500" />
                    {t('calendar.reminders')}
                  </div>
                  <div className="text-[12px] font-semibold text-[#999] dark:text-zinc-500">
                    {dayData.reminders.length}
                  </div>
                </div>
                <div className="space-y-2">
                  {dayData.reminders.map((r) => {
                    const pri = r.priority || 'medium'
                    const priTag =
                      pri === 'high'
                        ? { cls: 'bg-red-500 text-white', text: t('calendar.priorityUrgent') }
                        : pri === 'medium'
                          ? {
                              cls: 'bg-[#F5F5F5] text-[#666] dark:bg-zinc-900 dark:text-zinc-300',
                              text: t('calendar.priorityNormal'),
                            }
                          : null

                    return (
                      <div
                        key={r.id}
                        className="rounded-2xl border border-[#F0F0F0] bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <button
                            type="button"
                            onClick={() => toggleReminderCompleted(r)}
                            className={[
                              'mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full border',
                              r.is_completed
                                ? 'border-black bg-black text-white dark:border-white dark:bg-white dark:text-zinc-900'
                                : 'border-[#CCC] bg-white dark:border-zinc-700 dark:bg-zinc-950',
                            ].join(' ')}
                            aria-label="toggle"
                          >
                            {r.is_completed ? '✓' : ''}
                          </button>

                          <div className="min-w-0 flex-1">
                            <div
                              className={[
                                'text-[13px] font-semibold',
                                r.is_completed
                                  ? 'text-[#9CA3AF] line-through dark:text-zinc-600'
                                  : 'text-[#1A1A1A] dark:text-white',
                              ].join(' ')}
                            >
                              {r.title}
                            </div>
                            {r.linked_asset?.name ? (
                              <button
                                type="button"
                                onClick={() => navigate(`/asset/${r.linked_asset.id}`)}
                                className="mt-2 inline-flex rounded-full bg-[#F5F5F5] px-2.5 py-1 text-[11px] font-semibold text-[#666] transition-colors hover:bg-[#EEEEEE] dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                              >
                                {r.linked_asset.name}
                              </button>
                            ) : null}
                          </div>

                          <div className="flex items-center gap-2">
                            {priTag ? (
                              <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${priTag.cls}`}>
                                {priTag.text}
                              </span>
                            ) : null}
                            <button
                              type="button"
                              onClick={() => removeReminder(r)}
                              className="text-[11px] font-semibold text-[#999] transition-colors hover:text-black dark:text-zinc-500 dark:hover:text-white"
                            >
                              删除
                            </button>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ) : null}
            </div>

            <div className="border-t border-[#F0F0F0] px-6 py-5 dark:border-zinc-800">
              <div className="flex items-center gap-2">
                <input
                  value={quickText}
                  onChange={(e) => setQuickText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      quickAddReminder()
                    }
                  }}
                  placeholder={t('calendar.quickAddPh')}
                  className="h-11 flex-1 rounded-xl border border-[#E5E5E5] bg-white px-3 text-[13px] text-[#1A1A1A] outline-none transition-colors focus:border-black dark:border-zinc-800 dark:bg-zinc-950 dark:text-white dark:focus:border-zinc-400"
                />
                <button
                  type="button"
                  onClick={quickAddReminder}
                  disabled={quickSaving}
                  className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-black text-white transition-colors hover:bg-[#333] disabled:opacity-50 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
                  aria-label="send"
                >
                  <Plus className="h-4 w-4" strokeWidth={2} />
                </button>
              </div>
            </div>
          </div>
        </div>
      </Modal>

      <Modal
        open={newReminderOpen}
        onClose={() => {
          if (remSaving) return
          setNewReminderOpen(false)
        }}
      >
        <div className="relative w-full max-w-[480px] rounded-[20px] bg-white p-6 shadow-2xl dark:bg-zinc-950 dark:text-white">
          <button
            type="button"
            onClick={() => setNewReminderOpen(false)}
            className="absolute right-4 top-4 inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[#E5E5E5] bg-white text-[#555] transition-colors hover:bg-[#FAFAFA] hover:text-[#1A1A1A] dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300 dark:hover:bg-zinc-900"
            aria-label="Close"
          >
            <X className="h-4 w-4" strokeWidth={2} />
          </button>

          <div className="text-[18px] font-extrabold text-[#1A1A1A] dark:text-white">{t('calendar.newReminder')}</div>
          <div className="mt-1 text-[12px] text-[#999] dark:text-zinc-500">创建一个提醒/待办</div>

          <div className="mt-5 space-y-4">
            <div>
              <div className="mb-1 text-[12px] font-semibold text-[#666] dark:text-zinc-300">
                {t('calendar.reminderTitle')}
              </div>
              <input
                value={remTitle}
                onChange={(e) => setRemTitle(e.target.value)}
                className="h-11 w-full rounded-xl border border-[#E5E5E5] bg-white px-3 text-[13px] outline-none transition-colors focus:border-black dark:border-zinc-800 dark:bg-zinc-950 dark:text-white dark:focus:border-zinc-400"
                placeholder="例如：关注茅台财报发布"
              />
            </div>

            <div>
              <div className="mb-1 text-[12px] font-semibold text-[#666] dark:text-zinc-300">
                {t('calendar.reminderDesc')}
              </div>
              <textarea
                rows={3}
                value={remDesc}
                onChange={(e) => setRemDesc(e.target.value)}
                className="w-full resize-y rounded-xl border border-[#E5E5E5] bg-white px-3 py-2.5 text-[13px] outline-none transition-colors focus:border-black dark:border-zinc-800 dark:bg-zinc-950 dark:text-white dark:focus:border-zinc-400"
                placeholder="可选"
              />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <div className="mb-1 text-[12px] font-semibold text-[#666] dark:text-zinc-300">
                  {t('calendar.reminderDate')}
                </div>
                <input
                  type="date"
                  value={remDate}
                  onChange={(e) => setRemDate(e.target.value)}
                  className="h-11 w-full rounded-xl border border-[#E5E5E5] bg-white px-3 font-mono text-[13px] outline-none transition-colors focus:border-black dark:border-zinc-800 dark:bg-zinc-950 dark:text-white dark:focus:border-zinc-400"
                />
              </div>
              <div>
                <div className="mb-1 text-[12px] font-semibold text-[#666] dark:text-zinc-300">
                  {t('calendar.reminderTime')}
                </div>
                <div className="relative">
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[#BBB] dark:text-zinc-600">
                    <Clock className="h-4 w-4" strokeWidth={2} />
                  </div>
                  <input
                    type="time"
                    value={remTime}
                    onChange={(e) => setRemTime(e.target.value)}
                    className="h-11 w-full rounded-xl border border-[#E5E5E5] bg-white pl-10 pr-3 font-mono text-[13px] outline-none transition-colors focus:border-black dark:border-zinc-800 dark:bg-zinc-950 dark:text-white dark:focus:border-zinc-400"
                  />
                </div>
              </div>
            </div>

            <div>
              <div className="mb-2 text-[12px] font-semibold text-[#666] dark:text-zinc-300">优先级</div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setRemPriority('high')}
                  className={pill(
                    remPriority === 'high'
                      ? 'bg-red-500 text-white'
                      : 'bg-[#F5F5F5] text-[#666] hover:bg-[#EEEEEE] dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800',
                  )}
                >
                  {t('calendar.priorityHigh')}
                </button>
                <button
                  type="button"
                  onClick={() => setRemPriority('medium')}
                  className={pill(
                    remPriority === 'medium'
                      ? 'bg-black text-white dark:bg-white dark:text-zinc-900'
                      : 'bg-[#F5F5F5] text-[#666] hover:bg-[#EEEEEE] dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800',
                  )}
                >
                  {t('calendar.priorityMedium')}
                </button>
                <button
                  type="button"
                  onClick={() => setRemPriority('low')}
                  className={pill(
                    remPriority === 'low'
                      ? 'bg-[#E5E5E5] text-[#333] dark:bg-zinc-800 dark:text-zinc-200'
                      : 'bg-[#F5F5F5] text-[#666] hover:bg-[#EEEEEE] dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800',
                  )}
                >
                  {t('calendar.priorityLow')}
                </button>
              </div>
            </div>

            <div>
              <div className="mb-1 text-[12px] font-semibold text-[#666] dark:text-zinc-300">{t('calendar.linkAsset')}</div>
              <div className="relative">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[#BBB] dark:text-zinc-600">
                  <Search className="h-4 w-4" strokeWidth={2} />
                </div>
                <input
                  value={remAssetQuery}
                  onChange={(e) => {
                    setRemAssetQuery(e.target.value)
                    setRemAssetPick(null)
                    setAssetOpen(true)
                  }}
                  onFocus={() => setAssetOpen(true)}
                  onBlur={() => window.setTimeout(() => setAssetOpen(false), 200)}
                  className="h-11 w-full rounded-xl border border-[#E5E5E5] bg-white pl-10 pr-3 text-[13px] outline-none transition-colors focus:border-black dark:border-zinc-800 dark:bg-zinc-950 dark:text-white dark:focus:border-zinc-400"
                  placeholder="例如 600519"
                />
                {assetSearching ? (
                  <span className="absolute right-3 top-3 text-[11px] text-[#CCC] dark:text-zinc-600">搜索中…</span>
                ) : null}
                {assetOpen && assetHits.length > 0 ? (
                  <ul className="absolute z-50 mt-2 max-h-56 w-full overflow-auto rounded-2xl border border-[#F0F0F0] bg-white py-1 shadow-[0_12px_40px_-12px_rgba(0,0,0,0.18)] dark:border-zinc-800 dark:bg-zinc-950">
                    {assetHits.map((a) => (
                      <li key={a.id}>
                        <button
                          type="button"
                          onMouseDown={() => {
                            setRemAssetPick(a)
                            setRemAssetQuery(a.code || a.name || '')
                            setAssetOpen(false)
                          }}
                          className="flex w-full flex-col items-start px-4 py-2.5 text-left transition-colors hover:bg-[#FAFAFA] dark:hover:bg-zinc-900/40"
                        >
                          <span className="font-mono text-[13px] text-[#1A1A1A] dark:text-white">{a.code}</span>
                          <span className="text-[12px] text-[#999] dark:text-zinc-500">{a.name}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </div>
          </div>

          <div className="mt-6 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => setNewReminderOpen(false)}
              className="text-[13px] font-semibold text-[#888] transition-colors hover:text-black dark:text-zinc-500 dark:hover:text-white"
            >
              {t('calendar.cancel')}
            </button>
            <button
              type="button"
              onClick={saveNewReminder}
              disabled={remSaving}
              className="inline-flex items-center justify-center rounded-xl bg-black px-5 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-[#333] disabled:opacity-50 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              {remSaving ? t('calendar.saving') : t('calendar.save')}
            </button>
          </div>
        </div>
      </Modal>

      <style>{`
        @keyframes cal-fade { from { opacity: 0; } to { opacity: 1; } }
      `}</style>
    </div>
  )
}
