import { useEffect, useMemo, useRef, useState } from 'react'
import {
  BarChart3,
  BookOpen,
  BookText,
  Calendar,
  Edit2,
  Eye,
  Folder,
  FolderOpen,
  LayoutGrid,
  Plus,
  Search,
  Tag as TagIcon,
  Trash2,
  Bold,
  Italic,
  Strikethrough,
  List,
  ListOrdered,
  Quote,
  Code,
  ChevronLeft,
  ChevronRight,
  Minus,
} from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useAuth } from '../contexts/AuthContext.jsx'
import { useUiPreferences } from '../contexts/UiPreferencesContext.jsx'
import { useToast } from '../components/Toast.jsx'
import { createNote, createNotebook, getNote, getNotes, getNotebooks, getTags, updateNote } from '../api'

function cx(...parts) {
  return parts.filter(Boolean).join(' ')
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

export default function Notebook() {
  const { user } = useAuth()
  const userId = user?.id
  const { t } = useUiPreferences()
  const showToast = useToast()

  const [notebooksTree, setNotebooksTree] = useState([])
  const [tags, setTags] = useState([])

  const [selectedNotebookId, setSelectedNotebookId] = useState(undefined) // undefined => all notes
  const [folderCollapsed, setFolderCollapsed] = useState(false)

  const [notesLoading, setNotesLoading] = useState(true)
  const [notes, setNotes] = useState([])
  const [search, setSearch] = useState('')
  const [sortMode, setSortMode] = useState('time') // time | title

  const [selectedNoteId, setSelectedNoteId] = useState(null)
  const [selectedNote, setSelectedNote] = useState(null)

  const titleInputRef = useRef(null)
  const textareaRef = useRef(null)
  const [title, setTitle] = useState('')
  const [noteContent, setNoteContent] = useState('')
  const [isPreviewMode, setIsPreviewMode] = useState(false)
  const [tagIds, setTagIds] = useState([])
  const [dirty, setDirty] = useState(false)
  const [autoSaveState, setAutoSaveState] = useState(t('notebook.unsavedChanges'))
  const [isNew, setIsNew] = useState(false)

  const saveTimerRef = useRef(null)

  const loadAll = () => {
    if (!userId) return
    Promise.all([getNotebooks(userId), getTags(userId)])
      .then(([nb, tg]) => {
        setNotebooksTree(Array.isArray(nb) ? nb : [])
        setTags(Array.isArray(tg) ? tg : [])
      })
      .catch(() => {
        setNotebooksTree([])
        setTags([])
      })
  }

  const loadNotes = () => {
    if (!userId) return
    setNotesLoading(true)

    const params = {
      notebook_id: selectedNotebookId === undefined ? undefined : selectedNotebookId,
      search: search.trim() ? search.trim() : undefined,
    }

    getNotes(userId, params)
      .then((list) => {
        const arr = Array.isArray(list) ? list : []
        if (sortMode === 'title') {
          arr.sort((a, b) => String(a.title || '').localeCompare(String(b.title || '')))
        }
        setNotes(arr)
      })
      .catch(() => setNotes([]))
      .finally(() => setNotesLoading(false))
  }

  useEffect(() => {
    loadAll()
  }, [userId])

  useEffect(() => {
    loadNotes()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, selectedNotebookId, sortMode, search])

  useEffect(() => {
    if (!selectedNoteId || !selectedNote) return
    setTitle(selectedNote.title || '')
    setNoteContent(String(selectedNote.content || ''))
    setTagIds((selectedNote.tags || []).map((x) => x.id))
    setDirty(false)
    setAutoSaveState(t('notebook.autoSaved'))
    setIsNew(false)
    setIsPreviewMode(false)
  }, [selectedNoteId, selectedNote, t])

  useEffect(() => {
    if (!userId) return
    if (!selectedNoteId) return
    if (!dirty) return
    if (!selectedNote) return

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    setAutoSaveState(t('notebook.unsavedChanges'))

    saveTimerRef.current = setTimeout(async () => {
      try {
        await updateNote(userId, selectedNoteId, {
          title: title.trim() || 'Untitled',
          content: noteContent,
          content_type: 'markdown',
          notebook_id: selectedNote.notebook_id ?? null,
          linked_asset_id: selectedNote.linked_asset ? selectedNote.linked_asset.id : selectedNote.linked_asset_id ?? null,
          linked_trade_id: selectedNote.linked_trade_id ?? null,
          is_pinned: selectedNote.is_pinned ?? false,
          tag_ids: tagIds,
        })
        setDirty(false)
        setAutoSaveState(t('notebook.autoSaved'))
      } catch (e) {
        showToast(e.message || 'Save failed', 'error')
      }
    }, 2000)

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    }
  }, [dirty, userId, selectedNoteId, selectedNote, title, noteContent, tagIds, t, showToast])

  const toggleTag = (tagId) => {
    setTagIds((prev) => {
      const has = prev.includes(tagId)
      return has ? prev.filter((x) => x !== tagId) : [...prev, tagId]
    })
    setDirty(true)
  }

  const startNew = () => {
    setIsNew(true)
    setSelectedNoteId(null)
    setSelectedNote(null)
    setTitle('')
    setNoteContent('')
    setTagIds([])
    setDirty(false)
    setAutoSaveState(t('notebook.unsavedChanges'))
    setIsPreviewMode(false)
    requestAnimationFrame(() => titleInputRef.current?.focus())
  }

  const onSave = async () => {
    if (!userId) return
    if (isNew) {
      try {
        const created = await createNote(userId, {
          title: title.trim() || 'Untitled',
          content: noteContent || '',
          content_type: 'markdown',
          notebook_id: selectedNotebookId ?? null,
          linked_asset_id: null,
          linked_trade_id: null,
          tag_ids: tagIds,
        })
        setSelectedNoteId(created.id)
        setSelectedNote(created)
        setIsNew(false)
        setDirty(false)
        setAutoSaveState(t('notebook.autoSaved'))
      } catch (e) {
        showToast(e.message || 'Create failed', 'error')
      }
      return
    }

    if (!selectedNoteId) return
    try {
      await updateNote(userId, selectedNoteId, {
        title: title.trim() || 'Untitled',
        content: noteContent || '',
        content_type: 'markdown',
        notebook_id: selectedNote.notebook_id ?? null,
        linked_asset_id: selectedNote.linked_asset ? selectedNote.linked_asset.id : selectedNote.linked_asset_id ?? null,
        linked_trade_id: selectedNote.linked_trade_id ?? null,
        is_pinned: selectedNote.is_pinned ?? false,
        tag_ids: tagIds,
      })
      setDirty(false)
      setAutoSaveState(t('notebook.autoSaved'))
    } catch (e) {
      showToast(e.message || 'Save failed', 'error')
    }
  }

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

  const folderPath = useMemo(() => {
    if (!selectedNote?.notebook_id) return ''
    const findPath = (nodes, targetId, acc) => {
      for (const n of nodes) {
        const next = [...acc, n.name]
        if (n.id === targetId) return next.join(' / ')
        const child = findPath(n.children || [], targetId, next)
        if (child) return child
      }
      return null
    }
    return findPath(notebooksTree, selectedNote.notebook_id, []) || ''
  }, [notebooksTree, selectedNote])

  const placeholder = {
    title: t('notebook.editorEmptyTitle'),
    body: t('notebook.editorEmptyBody'),
  }

  const metaLine = (
    <div className="border-b border-[#E5E5E5] bg-[#F8F8F8] px-4 py-3 dark:border-zinc-800 dark:bg-[#0a0a0a]">
      <div className="flex flex-wrap items-center justify-between gap-3 text-[12px] text-[#888] dark:text-zinc-500">
        <span>
          {selectedNote?.created_at ? `${t('notebook.editorMetaCreated')}: ${new Date(selectedNote.created_at).toLocaleString()}` : ''}
        </span>
        <span>
          {selectedNote?.notebook_id ? `${t('notebook.editorMetaFolder')}: ${folderPath || '—'}` : ''}
        </span>
        <span>
          {selectedNote?.linked_asset ? `${t('notebook.editorMetaAsset')}: ${selectedNote.linked_asset.name}` : ''}
        </span>
      </div>
    </div>
  )

  const renderFolderNode = (node, depth = 0) => {
    const selected = selectedNotebookId === node.id
    return (
      <div key={node.id}>
        <button
          type="button"
          onClick={() => setSelectedNotebookId(node.id)}
          className={cx(
            'group flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left transition-colors',
            selected
              ? 'bg-white/70 font-semibold text-[#1A1A1A] dark:bg-zinc-900/60 dark:text-zinc-100'
              : 'bg-transparent text-[#666] hover:bg-white/60 dark:text-zinc-400 dark:hover:bg-zinc-900/60',
          )}
          style={{ paddingLeft: 12 + depth * 14 }}
        >
          <div
            className={cx(
              'h-6 w-[3px] rounded-full transition-colors',
              selected ? 'bg-indigo-500' : 'bg-transparent',
            )}
            aria-hidden
          />
          {node.children && node.children.length > 0 ? (
            <FolderOpen className="h-4 w-4 text-[#999] dark:text-zinc-500" />
          ) : (
            <Folder className="h-4 w-4 text-[#999] dark:text-zinc-500" />
          )}
          <div className="min-w-0 flex-1 truncate">
            <span className="truncate">{node.name}</span>
          </div>
          <span className="shrink-0 rounded-full bg-[#F5F5F5] px-2 py-0.5 text-[11px] font-semibold text-[#555] dark:bg-zinc-800 dark:text-zinc-300">
            {node.note_count}
          </span>
        </button>
        {node.children &&
          node.children.length > 0 &&
          // Always render children in MVP; could add collapsible later.
          node.children.map((c) => renderFolderNode(c, depth + 1))}
      </div>
    )
  }

  return (
    <div className="h-[calc(100vh)] w-full overflow-hidden bg-[#F8F8F8] dark:bg-[#0a0a0a]">
      <div className="flex h-full w-full">
        {/* Left sidebar */}
        <aside className="flex h-full w-[220px] flex-none flex-col border-r border-[#E5E5E5] bg-[#F8F8F8] dark:border-zinc-800 dark:bg-[#0a0a0a]">
          <div className="p-4">
            <button
              type="button"
              onClick={startNew}
              className="mb-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-black px-3 py-2 text-[12px] font-semibold text-white shadow-sm transition-colors hover:bg-[#333] dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              <Plus className="h-4 w-4" strokeWidth={2} />
              {t('notebook.newNote')}
            </button>
            <button
              type="button"
              className="w-full rounded-xl border border-[#E5E5E5] bg-white px-3 py-2 text-[12px] font-medium text-[#555] transition-colors hover:bg-[#FAFAFA] dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300 dark:hover:bg-zinc-900"
              onClick={() => {
                const name = window.prompt('Folder name')
                if (!name) return
                if (!userId) return
                const parent_id = selectedNotebookId === undefined ? null : selectedNotebookId
                createNotebook(userId, { name: String(name).trim(), parent_id })
                  .then(() => loadAll())
                  .catch((e) => showToast(e.message || 'Failed to create folder', 'error'))
              }}
              aria-label={t('notebook.newFolder')}
              title={t('notebook.newFolder')}
            >
              {t('notebook.newFolder')}
            </button>
          </div>

          <div className="flex-1 overflow-auto px-2 pb-4">
            <div className="mb-2 flex items-center justify-between gap-2 px-2 text-[12px] font-semibold text-[#555] dark:text-zinc-300">
              <span>{t('notebook.folders')}</span>
              <button
                type="button"
                onClick={() => setFolderCollapsed((v) => !v)}
                className="rounded-lg px-2 py-1 text-[#777] hover:bg-[#F5F5F5] dark:text-zinc-400 dark:hover:bg-zinc-800"
              >
                {folderCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
              </button>
            </div>

            <div className={cx('space-y-1', folderCollapsed && 'hidden')}>
              <button
                type="button"
                onClick={() => setSelectedNotebookId(undefined)}
                className={cx(
                  'flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left transition-colors',
                  selectedNotebookId === undefined
                    ? 'bg-white/70 font-semibold text-[#1A1A1A] dark:bg-zinc-900/60 dark:text-zinc-100'
                    : 'bg-transparent text-[#666] hover:bg-white/60 dark:text-zinc-400 dark:hover:bg-zinc-900/60',
                )}
              >
                <span className="flex items-center gap-2 min-w-0">
                  <FolderOpen className="h-4 w-4 text-[#999] dark:text-zinc-500" />
                  <span className="truncate">{t('notebook.allNotes')}</span>
                </span>
                <span className="shrink-0 rounded-full bg-[#F5F5F5] px-2 py-0.5 text-[11px] font-semibold text-[#555] dark:bg-zinc-800 dark:text-zinc-300">
                  {notes.length}
                </span>
              </button>

              {notebooksTree.map((n) => renderFolderNode(n, 0))}
            </div>

            <div className="my-4 border-t border-[#E5E5E5] pt-4 dark:border-zinc-800">
              <div className="flex items-center gap-2 px-3 text-[12px] font-semibold text-[#777] dark:text-zinc-400">
                <LayoutGrid className="h-4 w-4" />
                Tools
              </div>
              <div className="mt-3 space-y-1 px-2">
                <button className="w-full rounded-xl px-3 py-2 text-left text-[12px] text-[#555] hover:bg-white/60 dark:text-zinc-300 dark:hover:bg-zinc-900">
                  <BookOpen className="mr-2 inline h-4 w-4" /> 每日复盘
                </button>
                <button className="w-full rounded-xl px-3 py-2 text-left text-[12px] text-[#555] hover:bg-white/60 dark:text-zinc-300 dark:hover:bg-zinc-900">
                  <Calendar className="mr-2 inline h-4 w-4" /> 周度复盘
                </button>
                <button className="w-full rounded-xl px-3 py-2 text-left text-[12px] text-[#555] hover:bg-white/60 dark:text-zinc-300 dark:hover:bg-zinc-900">
                  <BarChart3 className="mr-2 inline h-4 w-4" /> 月度复盘
                </button>
                <button className="w-full rounded-xl px-3 py-2 text-left text-[12px] text-[#555] hover:bg-white/60 dark:text-zinc-300 dark:hover:bg-zinc-900">
                  <BookText className="mr-2 inline h-4 w-4" /> 图表分析
                </button>
              </div>
            </div>
          </div>

          <div className="border-t border-[#E5E5E5] p-4 dark:border-zinc-800">
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-2 text-[12px] font-semibold text-[#555] dark:text-zinc-300">
                <TagIcon className="h-4 w-4" />
                Tags
              </div>
              <button
                type="button"
                className="rounded-lg border border-[#E5E5E5] bg-white px-2 py-1 text-[12px] text-[#555] hover:bg-[#FAFAFA] dark:border-zinc-800 dark:bg-zinc-950 dark:hover:bg-zinc-900"
              >
                +
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {tags.slice(0, 6).map((tg) => (
                <span
                  key={tg.id}
                  className="inline-flex items-center gap-2 rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-[#555] shadow-sm dark:bg-zinc-950 dark:text-zinc-300"
                >
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: tg.color }} />
                  {tg.name}
                </span>
              ))}
              {tags.length === 0 && <span className="text-[12px] text-[#999] dark:text-zinc-500">—</span>}
            </div>
            <button
              type="button"
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-[#E5E5E5] bg-white px-3 py-2 text-[12px] font-semibold text-[#555] hover:bg-[#FAFAFA] dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300 dark:hover:bg-zinc-900"
            >
              <Trash2 className="h-4 w-4" />
              Recycle
            </button>
          </div>
        </aside>

        {/* Middle column */}
        <section className="w-[300px] flex-none border-r border-[#E5E5E5] bg-[#F8F8F8] dark:border-zinc-800 dark:bg-[#0a0a0a]">
          <div className="flex h-full flex-col">
            <div className="border-b border-[#E5E5E5] p-4 dark:border-zinc-800">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#999] dark:text-zinc-500" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t('notebook.notesSearch')}
                  className="w-full rounded-xl border border-[#E5E5E5] bg-white pl-9 pr-3 py-2 text-[13px] outline-none transition-colors focus:border-black dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
                />
              </div>
              <div className="mt-3 flex items-center justify-between gap-2 text-[12px]">
                <label className="flex items-center gap-2 text-[#777] dark:text-zinc-400">
                  <input type="checkbox" /> Select all
                </label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setSortMode('time')}
                    className={cx(
                      'rounded-xl border px-3 py-1 text-[12px] font-semibold',
                      sortMode === 'time'
                        ? 'border-black bg-black text-white dark:bg-white dark:text-zinc-900'
                        : 'border-[#E5E5E5] bg-white text-[#777] hover:bg-[#F7F7F7] dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800',
                    )}
                  >
                    {t('notebook.sortTime')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setSortMode('title')}
                    className={cx(
                      'rounded-xl border px-3 py-1 text-[12px] font-semibold',
                      sortMode === 'title'
                        ? 'border-black bg-black text-white dark:bg-white dark:text-zinc-900'
                        : 'border-[#E5E5E5] bg-white text-[#777] hover:bg-[#F7F7F7] dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800',
                    )}
                  >
                    {t('notebook.sortTitle')}
                  </button>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-auto p-4">
              <div className="mb-3 text-[12px] font-semibold text-[#777] dark:text-zinc-400">
                {selectedNotebookId
                  ? `Folder`
                  : t('notebook.allNotes')}
              </div>

              {notesLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-24 animate-pulse rounded-2xl bg-white dark:bg-zinc-900" />
                  ))}
                </div>
              ) : notes.length === 0 ? (
                <div className="flex h-[420px] flex-col items-center justify-center text-center">
                  <BookOpen className="h-12 w-12 text-[#E0E0E0] dark:text-zinc-700" />
                  <div className="mt-3 text-[14px] font-semibold text-[#1A1A1A] dark:text-zinc-100">
                    {t('notebook.emptyTitle')}
                  </div>
                  <div className="mt-2 max-w-[220px] text-[12px] text-[#999] dark:text-zinc-500">
                    {t('notebook.emptyBody')}
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {notes.map((n) => {
                    const selected = n.id === selectedNoteId
                    return (
                      <button
                        key={n.id}
                        type="button"
                        onClick={() => {
                          setSelectedNoteId(n.id)
                          setSelectedNote(null)
                          getNote(userId, n.id)
                            .then((full) => {
                              setSelectedNote(full)
                              setSelectedNotebookId(full.notebook_id ?? undefined)
                            })
                            .catch(() => setSelectedNote(null))
                        }}
                        className={cx(
                          'w-full rounded-2xl border p-3 text-left transition-all',
                          selected
                            ? 'border-indigo-200 bg-white shadow-sm dark:border-indigo-900/50 dark:bg-zinc-900'
                            : 'border-[#E8E8E8] bg-white hover:-translate-y-0.5 hover:shadow-sm dark:border-zinc-800 dark:bg-zinc-900',
                        )}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-[14px] font-semibold text-[#1A1A1A] dark:text-zinc-100">
                              {n.title}
                            </div>
                            <div className="mt-1 line-clamp-2 text-[12px] text-[#999] dark:text-zinc-500">
                              {n.content_preview}
                            </div>
                          </div>
                          {n.is_pinned && (
                            <span className="shrink-0 rounded-full bg-[#F5F5F5] px-2 py-0.5 text-[11px] font-semibold text-[#555] dark:bg-zinc-800 dark:text-zinc-300">
                              Pinned
                            </span>
                          )}
                        </div>
                        {n.tags?.length ? (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {n.tags.slice(0, 3).map((tg) => (
                              <span
                                key={tg.id}
                                className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold"
                                style={{
                                  backgroundColor: tg.color + '20',
                                  color: tg.color,
                                }}
                              >
                                {tg.name}
                              </span>
                            ))}
                          </div>
                        ) : null}
                        <div className="mt-2 text-[11px] text-[#AAA] dark:text-zinc-500">
                          {n.updated_at ? new Date(n.updated_at).toLocaleDateString() : ''}
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Editor */}
        <section className="flex-1 bg-white dark:bg-zinc-950">
          <div className="h-full flex flex-col">
            {metaLine}
            {selectedNoteId || isNew ? (
              <div className="flex-1 overflow-auto p-4">
                <div className="mb-3 flex items-start justify-between gap-2">
                  <input
                    ref={titleInputRef}
                    value={title}
                    onChange={(e) => {
                      setTitle(e.target.value)
                      setDirty(true)
                    }}
                    placeholder="笔记标题"
                    className="w-full rounded-xl border border-[#E5E5E5] bg-white px-3 py-2 text-[16px] font-semibold text-[#1A1A1A] outline-none focus:border-black dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
                  />
                  <button
                    type="button"
                    onClick={() => setIsPreviewMode((v) => !v)}
                    className="h-10 w-10 rounded-xl border border-[#E5E5E5] bg-white hover:bg-[#F7F7F7] dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800 flex items-center justify-center"
                    aria-label={isPreviewMode ? 'Edit' : 'Preview'}
                  >
                    {isPreviewMode ? <Edit2 className="h-4.5 w-4.5" /> : <Eye className="h-4.5 w-4.5" />}
                  </button>
                </div>

                <div className="mb-3 flex flex-wrap items-center gap-1 rounded-xl border border-[#E5E5E5] bg-white px-2 py-2 dark:border-zinc-800 dark:bg-zinc-900">
                  <button type="button" onClick={() => applyMd('**', '**')} className="rounded-md px-2 py-1 hover:bg-[#F5F5F5] dark:hover:bg-zinc-800">
                    <Bold className="h-4 w-4" strokeWidth={2} />
                  </button>
                  <button type="button" onClick={() => applyMd('*', '*')} className="rounded-md px-2 py-1 hover:bg-[#F5F5F5] dark:hover:bg-zinc-800">
                    <Italic className="h-4 w-4" strokeWidth={2} />
                  </button>
                  <button type="button" onClick={() => applyMd('~~', '~~')} className="rounded-md px-2 py-1 hover:bg-[#F5F5F5] dark:hover:bg-zinc-800">
                    <Strikethrough className="h-4 w-4" strokeWidth={2} />
                  </button>
                  <button type="button" onClick={() => applyMd('\n- ', '')} className="rounded-md px-2 py-1 hover:bg-[#F5F5F5] dark:hover:bg-zinc-800">
                    <List className="h-4 w-4" strokeWidth={2} />
                  </button>
                  <button type="button" onClick={() => applyMd('\n1. ', '')} className="rounded-md px-2 py-1 hover:bg-[#F5F5F5] dark:hover:bg-zinc-800">
                    <ListOrdered className="h-4 w-4" strokeWidth={2} />
                  </button>
                  <button type="button" onClick={() => applyMd('\n> ', '')} className="rounded-md px-2 py-1 hover:bg-[#F5F5F5] dark:hover:bg-zinc-800">
                    <Quote className="h-4 w-4" strokeWidth={2} />
                  </button>
                  <button type="button" onClick={() => applyMd('`', '`')} className="rounded-md px-2 py-1 hover:bg-[#F5F5F5] dark:hover:bg-zinc-800">
                    <Code className="h-4 w-4" strokeWidth={2} />
                  </button>
                  <button type="button" onClick={() => applyMd('\n---\n', '')} className="rounded-md px-2 py-1 hover:bg-[#F5F5F5] dark:hover:bg-zinc-800">
                    <Minus className="h-4 w-4" strokeWidth={2} />
                  </button>
                  <div className="ml-auto" />
                  <div className="flex items-center gap-2 text-[12px] text-[#888] dark:text-zinc-400">
                    <TagIcon className="h-4 w-4" strokeWidth={2} />
                    <details className="relative">
                      <summary className="cursor-pointer list-none rounded-lg px-2 py-1 hover:bg-[#F5F5F5] dark:hover:bg-zinc-800">
                        {t('notebook.selectTags')}
                      </summary>
                      <div className="absolute right-0 z-30 mt-2 w-[260px] rounded-xl border border-[#E5E5E5] bg-white p-3 shadow-lg dark:border-zinc-800 dark:bg-zinc-950">
                        <div className="max-h-44 overflow-auto space-y-1">
                          {tags.map((tg) => {
                            const active = tagIds.includes(tg.id)
                            return (
                              <label key={tg.id} className="flex items-center justify-between gap-3 rounded-lg px-2 py-1 hover:bg-[#F7F7F7] dark:hover:bg-zinc-800 cursor-pointer">
                                <span className="flex items-center gap-2 min-w-0">
                                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: tg.color }} />
                                  <span className="truncate text-[12px] text-[#444] dark:text-zinc-200">{tg.name}</span>
                                </span>
                                <input type="checkbox" checked={active} onChange={() => toggleTag(tg.id)} />
                              </label>
                            )
                          })}
                        </div>
                      </div>
                    </details>
                  </div>
                </div>

                <div className="rounded-2xl border border-[#E5E5E5] bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
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
                      className="outline-none focus:ring-0 resize-none w-full h-[520px] bg-transparent text-[14px] leading-[1.8] text-[#1A1A1A] dark:text-zinc-100"
                      placeholder={t('notebook.emptyBody')}
                    />
                  )}
                </div>

                <div className="mt-3 flex items-center justify-between text-[12px] text-[#999] dark:text-zinc-500">
                  <button
                    type="button"
                    onClick={onSave}
                    className="rounded-xl bg-black px-4 py-2 text-[12px] font-semibold text-white hover:bg-[#333] dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
                  >
                    {t('notebook.editorSave')}
                  </button>
                  <span className={dirty ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}>
                    {dirty ? t('notebook.unsavedChanges') : t('notebook.autoSaved')}
                  </span>
                </div>
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center">
                  <BookOpen className="mx-auto h-14 w-14 text-[#E0E0E0] dark:text-zinc-700" />
                  <div className="mt-4 text-[14px] font-semibold text-[#1A1A1A] dark:text-zinc-100">
                    {t('notebook.editorEmptyTitle')}
                  </div>
                  <div className="mt-2 max-w-[360px] text-[12px] text-[#999] dark:text-zinc-500">
                    {t('notebook.editorEmptyBody')}
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}

