import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Bold,
  Bot,
  Code,
  Edit2,
  Eye,
  Italic,
  List,
  ListOrdered,
  Minus,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  Quote,
  Save,
  Search,
  Strikethrough,
  Tag as TagIcon,
} from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useAuth } from '../contexts/AuthContext.jsx'
import { useUiPreferences } from '../contexts/UiPreferencesContext.jsx'
import { useToast } from '../components/Toast.jsx'
import { createNote, getNote, getNotes, getTags, searchAssets, updateNote } from '../api'

function cx(...parts) {
  return parts.filter(Boolean).join(' ')
}

function hashString(str) {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function mulberry32(a) {
  return function () {
    let t = (a += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function generateCandles(seedKey, bars = 120) {
  const rand = mulberry32(hashString(String(seedKey || 'keefoo')))
  const now = new Date()
  const candles = []
  const volumes = []

  const start = new Date(now.getTime())
  start.setDate(start.getDate() - bars * 1.4)

  let close = 40 + rand() * 160
  const drift = (rand() - 0.5) * 0.06

  let day = new Date(start.getTime())
  let count = 0
  while (count < bars) {
    const dow = day.getDay()
    if (dow !== 0 && dow !== 6) {
      const regime = count < bars * 0.35 ? 0.35 : count < bars * 0.7 ? 0 : -0.1
      const vol = 0.015 + rand() * 0.03 + Math.abs(regime) * 0.01
      const open = close
      const noise = (rand() - 0.5) * 2
      const step = drift + regime + noise * vol
      const nextClose = Math.max(1, open * (1 + step))

      const high = Math.max(open, nextClose) * (1 + rand() * vol)
      const low = Math.min(open, nextClose) * (1 - rand() * vol)
      close = nextClose

      const time = Math.floor(day.getTime() / 1000)
      candles.push({ time, open, high, low, close })
      const up = nextClose >= open
      volumes.push({
        time,
        value: Math.floor((20000 + rand() * 120000) * (0.6 + Math.abs(step) * 10)),
        color: up ? '#EF4444' : '#22C55E',
      })
      count++
    }
    day.setDate(day.getDate() + 1)
  }

  return { candles, volumes }
}

function loadLightweightCharts() {
  if (window.LightweightCharts) return Promise.resolve(window.LightweightCharts)
  const existing = document.querySelector('script[data-lc="1"]')
  if (existing) {
    return new Promise((resolve, reject) => {
      existing.addEventListener('load', () => resolve(window.LightweightCharts))
      existing.addEventListener('error', () => reject(new Error('Failed to load charts script')))
    })
  }
  return new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.dataset.lc = '1'
    script.src =
      'https://unpkg.com/lightweight-charts/dist/lightweight-charts.standalone.production.js'
    script.async = true
    script.onload = () => resolve(window.LightweightCharts)
    script.onerror = () => reject(new Error('Failed to load charts script'))
    document.head.appendChild(script)
  })
}

function insertMarkdown(text, selectionStart, selectionEnd, before, after) {
  const start = Math.max(0, selectionStart ?? 0)
  const end = Math.max(start, selectionEnd ?? start)
  const selected = text.slice(start, end)
  const next = text.slice(0, start) + before + selected + after + text.slice(end)
  const nextSelStart = start + before.length
  const nextSelEnd = nextSelStart + selected.length
  return { next, nextSelStart, nextSelEnd }
}

export default function Chart() {
  const { user } = useAuth()
  const userId = user?.id
  const { t, dateLocale } = useUiPreferences()
  const showToast = useToast()

  // chart
  const chartContainerRef = useRef(null)
  const chartRef = useRef(null)
  const [crosshair, setCrosshair] = useState(null)

  const [assetQuery, setAssetQuery] = useState('')
  const [assetResults, setAssetResults] = useState([])
  const [selectedAsset, setSelectedAsset] = useState(null)

  const candlesSeedKey = useMemo(() => selectedAsset?.id || 'mock', [selectedAsset])
  const mock = useMemo(() => generateCandles(candlesSeedKey, 120), [candlesSeedKey])
  const ohlcvByTime = useMemo(() => {
    const map = new Map()
    for (const c of mock.candles) {
      map.set(c.time, { ...c, volume: null })
    }
    for (const v of mock.volumes) {
      const cur = map.get(v.time)
      if (cur) cur.volume = v.value
    }
    return map
  }, [mock])

  // notes panel state
  const [isExpanded, setIsExpanded] = useState(true)
  const [notesLoading, setNotesLoading] = useState(false)
  const [notes, setNotes] = useState([])
  const [currentNoteId, setCurrentNoteId] = useState(null)
  const [currentNote, setCurrentNote] = useState(null)

  // markdown editor state
  const [noteTitle, setNoteTitle] = useState('')
  const [noteContent, setNoteContent] = useState('')
  const [isPreviewMode, setIsPreviewMode] = useState(false)
  const titleInputRef = useRef(null)
  const textareaRef = useRef(null)

  const [tags, setTags] = useState([])
  const [tagIds, setTagIds] = useState([])

  const [dirty, setDirty] = useState(false)
  const [autoSaveState, setAutoSaveState] = useState(t('chart.unsavedChanges'))
  const saveTimerRef = useRef(null)

  useEffect(() => {
    if (!chartContainerRef.current) return

    let chart = null

    const safeMockData = [
      { time: '2025-03-01', open: 150.2, high: 152.5, low: 149.8, close: 151.0 },
      { time: '2025-03-02', open: 151.0, high: 153.8, low: 150.5, close: 153.2 },
      { time: '2025-03-03', open: 153.2, high: 154.0, low: 151.2, close: 151.8 },
      { time: '2025-03-04', open: 151.8, high: 155.5, low: 151.5, close: 155.0 },
      { time: '2025-03-05', open: 155.0, high: 156.2, low: 153.0, close: 154.5 },
      { time: '2025-03-06', open: 154.5, high: 155.8, low: 152.2, close: 152.8 },
      { time: '2025-03-07', open: 152.8, high: 158.0, low: 152.5, close: 157.5 },
      { time: '2025-03-08', open: 157.5, high: 159.2, low: 156.0, close: 158.8 },
      { time: '2025-03-09', open: 158.8, high: 161.0, low: 158.0, close: 160.2 },
      { time: '2025-03-10', open: 160.2, high: 160.5, low: 157.5, close: 158.5 },
    ]

    const renderChart = () => {
      if (!chartContainerRef.current || typeof window.LightweightCharts === 'undefined') return

      chartContainerRef.current.innerHTML = '' // 清理遗留

      chart = window.LightweightCharts.createChart(chartContainerRef.current, {
        autoSize: true,
        layout: { background: { type: 'solid', color: 'transparent' }, textColor: '#333' },
        grid: { vertLines: { color: '#f0f3fa' }, horzLines: { color: '#f0f3fa' } },
      })

      if (typeof chart.addCandlestickSeries === 'function') {
        const series = chart.addCandlestickSeries({
          upColor: '#EF4444',
          downColor: '#22C55E',
          borderVisible: false,
          wickUpColor: '#EF4444',
          wickDownColor: '#22C55E',
        })
        series.setData(safeMockData)
      } else if (typeof chart.addLineSeries === 'function') {
        const series = chart.addLineSeries({ color: '#111827', lineWidth: 2 })
        series.setData(safeMockData.map((d) => ({ time: d.time, value: d.close })))
      }

      setTimeout(() => {
        if (chart) chart.timeScale().fitContent()
      }, 50)
    }

    if (typeof window.LightweightCharts === 'undefined') {
      const existingScript = document.getElementById('tv-lw-charts')
      if (!existingScript) {
        const script = document.createElement('script')
        script.id = 'tv-lw-charts'
        script.src =
          'https://unpkg.com/lightweight-charts/dist/lightweight-charts.standalone.production.js'
        script.onload = renderChart
        document.head.appendChild(script)
      } else {
        existingScript.addEventListener('load', renderChart)
      }
    } else {
      renderChart()
    }

    return () => {
      if (chart) chart.remove()
    }
  }, [])

  // ----- Load tags (for selector) -----
  useEffect(() => {
    if (!userId) return
    getTags(userId)
      .then((tg) => setTags(Array.isArray(tg) ? tg : []))
      .catch(() => setTags([]))
  }, [userId])

  // ----- Load notes list by linked_asset_id -----
  useEffect(() => {
    if (!userId || !selectedAsset?.id) {
      setNotes([])
      setCurrentNoteId(null)
      setCurrentNote(null)
      setNoteTitle('')
      setNoteContent('')
      setTagIds([])
      setDirty(false)
      setAutoSaveState(t('chart.unsavedChanges'))
      return
    }
    setNotesLoading(true)
    getNotes(userId, { linked_asset_id: selectedAsset.id })
      .then((list) => {
        const arr = Array.isArray(list) ? list : []
        setNotes(arr)
        if (arr.length === 0) return
        const first = arr[0]
        setCurrentNoteId(first.id)
        return getNote(userId, first.id).then((full) => {
          setCurrentNote(full)
        })
      })
      .catch(() => setNotes([]))
      .finally(() => setNotesLoading(false))
  }, [userId, selectedAsset?.id, t])

  // when currentNote changes: sync editor state
  useEffect(() => {
    if (!currentNote) return
    setNoteTitle(currentNote.title || '')
    setNoteContent(String(currentNote.content || ''))
    setTagIds((currentNote.tags || []).map((x) => x.id))
    setDirty(false)
    setAutoSaveState(t('chart.autoSaved'))
  }, [currentNote, t])

  // autosave existing note (debounce 2s)
  useEffect(() => {
    if (!userId) return
    if (!currentNoteId) return
    if (!dirty) return
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    setAutoSaveState(t('chart.unsavedChanges'))
    saveTimerRef.current = setTimeout(async () => {
      try {
        await updateNote(userId, currentNoteId, {
          title: noteTitle,
          content: noteContent,
          content_type: 'markdown',
          linked_asset_id: selectedAsset?.id ?? null,
          tag_ids: tagIds,
        })
        setDirty(false)
        setAutoSaveState(t('chart.autoSaved'))
      } catch (e) {
        showToast(e.message || 'Save failed', 'error')
      }
    }, 2000)
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    }
  }, [dirty, userId, currentNoteId, noteTitle, noteContent, selectedAsset?.id, tagIds, t, showToast])

  const handleNewNote = () => {
    if (!isExpanded) setIsExpanded(true)
    setCurrentNoteId(null)
    setCurrentNote(null)
    setNoteTitle('')
    setNoteContent('')
    setTagIds([])
    setDirty(false)
    setAutoSaveState(t('chart.unsavedChanges'))
    setIsPreviewMode(false)
    requestAnimationFrame(() => titleInputRef.current?.focus())
  }

  const saveToNotebook = async () => {
    if (!userId) return
    if (!selectedAsset?.id) {
      showToast('Select an asset first', 'error')
      return
    }
    const payload = {
      title: noteTitle.trim() || 'Untitled',
      content: noteContent || '',
      content_type: 'markdown',
      linked_asset_id: selectedAsset.id,
      tag_ids: tagIds,
    }
    try {
      if (currentNoteId) {
        await updateNote(userId, currentNoteId, payload)
        setDirty(false)
        setAutoSaveState(t('chart.autoSaved'))
        showToast(t('chart.autoSaved'), 'success')
        return
      }
      const created = await createNote(userId, payload)
      setCurrentNoteId(created.id)
      setCurrentNote(created)
      setDirty(false)
      setAutoSaveState(t('chart.autoSaved'))
      showToast(t('chart.autoSaved'), 'success')
    } catch (e) {
      showToast(e.message || 'Save failed', 'error')
    }
  }

  const toggleTag = (tagId) => {
    setTagIds((prev) => (prev.includes(tagId) ? prev.filter((x) => x !== tagId) : [...prev, tagId]))
    setDirty(true)
  }

  const metaMock = useMemo(() => {
    const base = 80 + (hashString(selectedAsset?.id || 'mock') % 120)
    const changePct = ((hashString(selectedAsset?.name || 'x') % 3100) / 100) - 15
    const up = changePct >= 0
    return {
      last: base * (1 + changePct / 100),
      changePct,
      vol: 1_200_000 + (hashString(String(selectedAsset?.id || 'm')) % 900_000),
      turnover: 0.8 + ((hashString(String(selectedAsset?.code || 'm')) % 500) / 1000),
      pe: 8 + (hashString(String(selectedAsset?.id || 'm')) % 35),
      up,
    }
  }, [selectedAsset])

  const applyMd = (before, after = before) => {
    if (isPreviewMode) return
    const ta = textareaRef.current
    const start = ta?.selectionStart ?? noteContent.length
    const end = ta?.selectionEnd ?? noteContent.length
    const { next, nextSelStart, nextSelEnd } = insertMarkdown(noteContent, start, end, before, after)
    setNoteContent(next)
    setDirty(true)
    requestAnimationFrame(() => {
      if (!ta) return
      ta.focus()
      ta.setSelectionRange(nextSelStart, nextSelEnd)
    })
  }

  return (
    <div className="flex h-[calc(100vh-64px)] w-full overflow-hidden bg-gray-50 dark:bg-gray-900">
      {/* 左侧图表区：【核心修复】必须包含 flex-1 和 min-w-0 */}
      <div className="flex-1 min-w-0 flex flex-col h-full bg-white dark:bg-gray-950">
        {/* 顶部工具栏 (保持原有代码) */}
        <div className="h-14 shrink-0 border-b border-gray-100 dark:border-gray-800 flex items-center px-4">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="relative w-full max-w-[420px]">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                value={assetQuery}
                onChange={(e) => setAssetQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter') return
                  const keyword = assetQuery.trim()
                  if (!keyword) return
                  searchAssets(keyword)
                    .then((res) => setAssetResults(Array.isArray(res) ? res : []))
                    .catch(() => setAssetResults([]))
                }}
                placeholder={t('chart.searchPlaceholder')}
                className="w-full rounded-xl border border-gray-200 bg-white px-9 py-2 text-[13px] text-gray-900 outline-none focus:border-gray-900 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-100 dark:focus:border-gray-200"
              />
              {assetResults.length > 0 && (
                <div className="absolute left-0 right-0 top-[44px] z-20 max-h-[260px] overflow-auto rounded-xl border border-gray-200 bg-white shadow-lg dark:border-gray-800 dark:bg-gray-900">
                  {assetResults.map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => {
                        setSelectedAsset(a)
                        setAssetQuery(`${a.name} (${a.code})`)
                        setAssetResults([])
                      }}
                      className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-gray-50 dark:hover:bg-gray-800"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-[13px] font-semibold text-gray-900 dark:text-gray-100">
                          {a.name}
                        </div>
                        <div className="truncate text-[11px] text-gray-500 dark:text-gray-400">
                          {a.code} · {a.asset_type}
                        </div>
                      </div>
                      <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-700 dark:bg-gray-800 dark:text-gray-200">
                        {a.asset_type}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {selectedAsset?.id && (
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate text-[13px] font-semibold text-gray-900 dark:text-gray-100">
                    {selectedAsset.name}
                  </span>
                  <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-[11px] font-medium text-gray-700 dark:bg-gray-800 dark:text-gray-200">
                    {selectedAsset.code}
                  </span>
                  <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-[11px] font-medium text-gray-700 dark:bg-gray-800 dark:text-gray-200">
                    {selectedAsset.asset_type}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 核心修复：absolute 隔离 canvas */}
        <div className="flex-1 w-full relative">
          <div ref={chartContainerRef} className="absolute inset-0" />
        </div>

        {/* 底部信息栏 (保持原有代码) */}
        <div className="h-8 shrink-0 border-t border-gray-100 dark:border-gray-800 flex items-center px-4 justify-between text-[11px] text-gray-500 dark:text-gray-400">
          <div className="flex items-center gap-4">
            <span className="font-semibold text-gray-900 dark:text-gray-200">{metaMock.last.toFixed(2)}</span>
            <span
              className={cx(
                'font-semibold',
                metaMock.up
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-red-500 dark:text-red-400',
              )}
            >
              {metaMock.changePct >= 0 ? '+' : ''}
              {metaMock.changePct.toFixed(2)}%
            </span>
            <span>成交量 {metaMock.vol.toLocaleString()}</span>
          </div>
          <div className="flex items-center gap-4">
            <span>换手率 {(metaMock.turnover * 100).toFixed(2)}%</span>
            <span>市盈率 {metaMock.pe.toFixed(1)}</span>
          </div>
        </div>
      </div>

      {/* 右侧：笔记面板（核心修复：overflow-hidden + 定宽内部容器） */}
      <div
        className={cx(
          'shrink-0 border-l border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 transition-[width] duration-300 ease-in-out relative overflow-hidden',
          isExpanded ? 'w-[400px]' : 'w-[48px]',
        )}
      >
        {/* 内部内容区固定 400px，靠右对齐；外层缩到 48px 时只遮挡，不挤压 */}
        <div className="absolute top-0 left-0 w-[400px] h-full flex">
          {/* 固定 48px 左侧按钮轨道：折叠时只显示这一列，避免内容“露出” */}
          <div className="w-[48px] flex-none border-r border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950">
            <div className="flex h-full flex-col items-center py-3 gap-2">
              <button
                type="button"
                onClick={() => setIsExpanded((v) => !v)}
                className="h-10 w-10 rounded-xl border border-gray-200 bg-white hover:bg-gray-100 dark:border-gray-800 dark:bg-gray-900 dark:hover:bg-gray-800 flex items-center justify-center"
                aria-label={isExpanded ? t('chart.collapsePanel') : t('chart.expandPanel')}
              >
                {isExpanded ? (
                  <PanelRightClose className="h-5 w-5 text-gray-700 dark:text-gray-200" />
                ) : (
                  <PanelRightOpen className="h-5 w-5 text-gray-700 dark:text-gray-200" />
                )}
              </button>

              <button
                type="button"
                onClick={handleNewNote}
                className="h-10 w-10 rounded-xl border border-gray-200 bg-white hover:bg-gray-100 dark:border-gray-800 dark:bg-gray-900 dark:hover:bg-gray-800 flex items-center justify-center"
                aria-label={t('chart.newNote')}
                title={t('chart.newNote')}
              >
                <Plus className="h-5 w-5 text-gray-700 dark:text-gray-200" />
              </button>

              <button
                type="button"
                onClick={saveToNotebook}
                className="h-10 w-10 rounded-xl border border-gray-200 bg-white hover:bg-gray-100 dark:border-gray-800 dark:bg-gray-900 dark:hover:bg-gray-800 flex items-center justify-center"
                aria-label={t('chart.saveToNotebook')}
                title={t('chart.saveToNotebook')}
              >
                <Save className="h-5 w-5 text-gray-700 dark:text-gray-200" />
              </button>
            </div>
          </div>

          {/* 主内容区：展开时显示；折叠时隐藏（避免被裁切后露出文字） */}
          <div
            className={cx(
              'flex-1 min-w-0 flex flex-col',
              isExpanded ? 'opacity-100' : 'opacity-0 pointer-events-none',
            )}
          >
          {/* 面板标题栏 */}
          <div className="h-14 flex-shrink-0 border-b border-gray-200 dark:border-gray-800 px-4 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <Bot className="h-4.5 w-4.5 text-blue-600 dark:text-blue-400" strokeWidth={2} aria-hidden />
              <div className="min-w-0">
                <div className="truncate text-[13px] font-bold text-gray-900 dark:text-gray-100">
                  {t('chart.analyzeNotes')}
                </div>
                <div className="text-[11px] text-gray-500 dark:text-gray-400">
                  {notesLoading ? 'Loading…' : `${notes.length} notes`}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleNewNote}
                className="inline-flex items-center gap-2 rounded-xl bg-gray-900 px-3 py-2 text-[12px] font-semibold text-white shadow-sm transition-colors hover:bg-gray-800 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-200"
              >
                <Plus className="h-4 w-4" strokeWidth={2} />
                {t('chart.newNote')}
              </button>
              <button
                type="button"
                onClick={() => setIsExpanded(false)}
                className="h-10 w-10 rounded-xl border border-gray-200 bg-white hover:bg-gray-100 dark:border-gray-800 dark:bg-gray-900 dark:hover:bg-gray-800 flex items-center justify-center"
                aria-label={t('chart.collapsePanel')}
              >
                <PanelRightClose className="h-5 w-5 text-gray-700 dark:text-gray-200" />
              </button>
            </div>
          </div>

          {/* 面板内容 */}
          <div className="flex-1 overflow-auto p-4">
            {/* 顶部 meta + 保存 */}
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-[12px] text-gray-500 dark:text-gray-400">
                <Save className="h-4 w-4" strokeWidth={2} aria-hidden />
                <span
                  className={cx(
                    'font-semibold',
                    dirty ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400',
                  )}
                >
                  {autoSaveState}
                </span>
              </div>
              <button
                type="button"
                onClick={saveToNotebook}
                className="rounded-xl bg-gray-900 px-3 py-2 text-[12px] font-semibold text-white hover:bg-gray-800 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-200"
              >
                {t('chart.saveToNotebook')}
              </button>
            </div>

            {/* 标题 + 模式切换 */}
            <div className="mb-3 flex items-start justify-between gap-2">
              <input
                ref={titleInputRef}
                value={noteTitle}
                onChange={(e) => {
                  setNoteTitle(e.target.value)
                  setDirty(true)
                }}
                placeholder="笔记标题"
                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-[14px] font-semibold text-gray-900 outline-none focus:border-gray-900 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-100 dark:focus:border-gray-200"
              />
              <button
                type="button"
                onClick={() => setIsPreviewMode((v) => !v)}
                className="h-10 w-10 rounded-xl border border-gray-200 bg-white hover:bg-gray-100 dark:border-gray-800 dark:bg-gray-900 dark:hover:bg-gray-800 flex items-center justify-center"
                aria-label={isPreviewMode ? 'Edit' : 'Preview'}
              >
                {isPreviewMode ? (
                  <Edit2 className="h-4.5 w-4.5 text-gray-700 dark:text-gray-200" />
                ) : (
                  <Eye className="h-4.5 w-4.5 text-gray-700 dark:text-gray-200" />
                )}
              </button>
            </div>

            {/* 工具栏（插入 Markdown 语法） */}
            <div className="mb-3 flex flex-wrap items-center gap-1 rounded-xl border border-gray-200 bg-white px-2 py-2 dark:border-gray-800 dark:bg-gray-900">
              <button type="button" onClick={() => applyMd('**', '**')} className="rounded-md px-2 py-1 hover:bg-gray-100 dark:hover:bg-gray-800">
                <Bold className="h-4 w-4" strokeWidth={2} />
              </button>
              <button type="button" onClick={() => applyMd('*', '*')} className="rounded-md px-2 py-1 hover:bg-gray-100 dark:hover:bg-gray-800">
                <Italic className="h-4 w-4" strokeWidth={2} />
              </button>
              <button type="button" onClick={() => applyMd('~~', '~~')} className="rounded-md px-2 py-1 hover:bg-gray-100 dark:hover:bg-gray-800">
                <Strikethrough className="h-4 w-4" strokeWidth={2} />
              </button>
              <button type="button" onClick={() => applyMd('\n- ', '')} className="rounded-md px-2 py-1 hover:bg-gray-100 dark:hover:bg-gray-800">
                <List className="h-4 w-4" strokeWidth={2} />
              </button>
              <button type="button" onClick={() => applyMd('\n1. ', '')} className="rounded-md px-2 py-1 hover:bg-gray-100 dark:hover:bg-gray-800">
                <ListOrdered className="h-4 w-4" strokeWidth={2} />
              </button>
              <button type="button" onClick={() => applyMd('\n> ', '')} className="rounded-md px-2 py-1 hover:bg-gray-100 dark:hover:bg-gray-800">
                <Quote className="h-4 w-4" strokeWidth={2} />
              </button>
              <button type="button" onClick={() => applyMd('`', '`')} className="rounded-md px-2 py-1 hover:bg-gray-100 dark:hover:bg-gray-800">
                <Code className="h-4 w-4" strokeWidth={2} />
              </button>
              <button type="button" onClick={() => applyMd('\n---\n', '')} className="rounded-md px-2 py-1 hover:bg-gray-100 dark:hover:bg-gray-800">
                <Minus className="h-4 w-4" strokeWidth={2} />
              </button>
              <div className="ml-auto" />
              <div className="flex items-center gap-2 text-[12px] text-gray-500 dark:text-gray-400">
                <TagIcon className="h-4 w-4" strokeWidth={2} />
                <details className="relative">
                  <summary className="cursor-pointer list-none rounded-lg px-2 py-1 hover:bg-gray-100 dark:hover:bg-gray-800">
                    {t('chart.selectTags')}
                  </summary>
                  <div className="absolute right-0 z-30 mt-2 w-[260px] rounded-xl border border-gray-200 bg-white p-3 shadow-lg dark:border-gray-800 dark:bg-gray-950">
                    <div className="max-h-44 overflow-auto space-y-1">
                      {tags.map((tag) => {
                        const active = tagIds.includes(tag.id)
                        return (
                          <label key={tag.id} className="flex items-center justify-between gap-3 rounded-lg px-2 py-1 hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer">
                            <span className="flex items-center gap-2 min-w-0">
                              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: tag.color || '#999' }} />
                              <span className="truncate text-[12px] text-gray-800 dark:text-gray-200">{tag.name}</span>
                            </span>
                            <input type="checkbox" checked={active} onChange={() => toggleTag(tag.id)} className="h-4 w-4" />
                          </label>
                        )
                      })}
                      {tags.length === 0 && <div className="text-[12px] text-gray-500">—</div>}
                    </div>
                  </div>
                </details>
              </div>
            </div>

            {/* 编辑/预览区 */}
            <div className="rounded-2xl border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-900">
              {isPreviewMode ? (
                <ReactMarkdown remarkPlugins={[remarkGfm]} className="prose prose-sm dark:prose-invert max-w-none">
                  {noteContent || ''}
                </ReactMarkdown>
              ) : (
                <textarea
                  ref={textareaRef}
                  value={noteContent}
                  onChange={(e) => {
                    setNoteContent(e.target.value)
                    setDirty(true)
                  }}
                  placeholder={t('chart.startTyping')}
                  className="outline-none focus:ring-0 resize-none w-full h-[320px] bg-transparent text-[14px] leading-[1.8] text-gray-900 dark:text-gray-100"
                />
              )}
            </div>

            {/* 当前笔记信息 */}
            {selectedAsset?.id && (
              <div className="mt-3 text-[11px] text-gray-500 dark:text-gray-400">
                {t('chart.linkedAsset')}: {selectedAsset.name} ({selectedAsset.code})
                {currentNote?.updated_at ? (
                  <span className="ml-2">· {new Date(currentNote.updated_at).toLocaleString(dateLocale)}</span>
                ) : null}
              </div>
            )}
          </div>
          </div>
        </div>
      </div>
    </div>
  )
}

