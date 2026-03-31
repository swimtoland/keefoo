import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, Minus, X } from 'lucide-react'
import {
  createShadowPosition,
  deleteShadowPosition,
  getScenarioPushes,
  getShadowPositions,
} from '../api'
import { useAuth } from '../contexts/AuthContext.jsx'
import { useUiPreferences } from '../contexts/UiPreferencesContext.jsx'
import { useToast } from '../components/Toast.jsx'

const ASSET_TYPES = [
  { label: '股票', value: 'stock' },
  { label: '基金', value: 'fund' },
  { label: '债券', value: 'bond' },
  { label: '期货', value: 'futures' },
  { label: '贵金属', value: 'gold' },
]

const inputLine =
  'w-full border-0 border-b border-[#E5E5E5] bg-transparent px-0 py-2 text-[14px] font-normal text-[#1A1A1A] placeholder:text-[#CCCCCC] outline-none transition-colors duration-200 focus:border-black dark:border-zinc-600 dark:text-white dark:placeholder:text-zinc-500 dark:focus:border-zinc-300'

function DirectionIcon({ direction }) {
  if (direction === 'positive') {
    return <ArrowUp className="h-4 w-4 text-[#22C55E]" strokeWidth={2} aria-hidden />
  }
  if (direction === 'negative') {
    return <ArrowDown className="h-4 w-4 text-[#EF4444]" strokeWidth={2} aria-hidden />
  }
  return <Minus className="h-4 w-4 text-[#AAAAAA]" strokeWidth={2} aria-hidden />
}

export default function Shadow() {
  const { user } = useAuth()
  const { t: tr } = useUiPreferences()
  const userId = user?.id
  const showToast = useToast()
  const [loading, setLoading] = useState(true)
  const [list, setList] = useState([])
  const [pushes, setPushes] = useState([])
  const [submitting, setSubmitting] = useState(false)

  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [assetType, setAssetType] = useState('stock')
  const [shadowKind, setShadowKind] = useState('watchlist')
  const [hypo, setHypo] = useState('')

  const pushByShadowId = useMemo(() => {
    const m = {}
    for (const p of pushes) {
      m[String(p.shadow_id)] = p
    }
    return m
  }, [pushes])

  const load = useCallback(() => {
    if (!userId) {
      setLoading(false)
      return Promise.resolve()
    }
    setLoading(true)
    return Promise.all([getShadowPositions(userId), getScenarioPushes(userId)])
      .then(([rows, sp]) => {
        setList(Array.isArray(rows) ? rows : [])
        setPushes(Array.isArray(sp) ? sp : [])
      })
      .catch((e) => {
        showToast(
          typeof e.response?.data?.detail === 'string'
            ? e.response.data.detail
            : e.message || tr('positions.loadFail'),
          'error',
        )
        setList([])
        setPushes([])
      })
      .finally(() => setLoading(false))
  }, [showToast, userId])

  useEffect(() => {
    load()
  }, [load])

  async function handleAdd(e) {
    e.preventDefault()
    if (!userId) {
      showToast(tr('shadowPage.needLogin'), 'error')
      return
    }
    if (!code.trim()) {
      showToast('请填写标的代码', 'error')
      return
    }
    setSubmitting(true)
    try {
      const payload = {
        asset_code: code.trim(),
        asset_name: name.trim() || undefined,
        asset_type: assetType,
        shadow_type: shadowKind,
        scenario_push_enabled: true,
        push_strength_cap: 'direction_only',
      }
      const hp = hypo.trim()
      if (hp !== '') {
        const n = Number(hp)
        if (!Number.isFinite(n) || n <= 0) {
          showToast('假设建仓价应为正数', 'error')
          setSubmitting(false)
          return
        }
        payload.hypothetical_entry_price = n
      }
      await createShadowPosition(userId, payload)
      showToast('已添加影子仓位', 'success')
      setCode('')
      setName('')
      setAssetType('stock')
      setShadowKind('watchlist')
      setHypo('')
      await load()
    } catch (err) {
      const d = err.response?.data?.detail
      const msg = typeof d === 'string' ? d : err.message || '添加失败'
      showToast(msg, 'error')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete(id) {
    if (!window.confirm('确定删除该影子仓位？')) return
    try {
      await deleteShadowPosition(id, userId)
      showToast('已删除', 'success')
      await load()
    } catch (err) {
      const d = err.response?.data?.detail
      showToast(typeof d === 'string' ? d : err.message || '删除失败', 'error')
    }
  }

  const atLimit = list.length >= 5

  return (
    <div className="text-[#1A1A1A] dark:text-zinc-100">
      <header className="mb-8">
        <h1 className="text-[28px] font-extrabold tracking-tight text-[#1A1A1A] dark:text-white">{tr('shadow.title')}</h1>
        <p className="mt-1 text-[13px] font-normal text-[#999] dark:text-zinc-500">{tr('shadow.subtitle')}</p>
      </header>

      <section className="card-hover mb-10 max-w-[640px] rounded-[20px] bg-white p-6 shadow-md transition-shadow duration-200 hover:shadow-lg dark:bg-zinc-900">
        <h2 className="mb-5 text-[15px] font-bold text-[#1A1A1A] dark:text-white">{tr('shadow.addSection')}</h2>
        <form onSubmit={handleAdd} className="space-y-5">
          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-[11px] text-[#999]">标的代码</label>
              <input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="000001"
                className={inputLine + ' font-mono'}
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] text-[#999]">标的名称</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="可选"
                className={inputLine}
              />
            </div>
          </div>

          <div>
            <span className="mb-2 block text-[11px] text-[#999]">资产类型</span>
            <div className="flex flex-wrap gap-2">
              {ASSET_TYPES.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setAssetType(t.value)}
                  className={`rounded-full px-3 py-1 text-[12px] font-medium transition-all duration-200 ${
                    assetType === t.value
                      ? 'bg-black text-white'
                      : 'bg-[#F5F5F5] text-[#999] hover:bg-[#EEEEEE]'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <span className="mb-2 block text-[11px] text-[#999]">类型</span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShadowKind('watchlist')}
                className={`rounded-full px-4 py-1.5 text-[13px] font-medium transition-all duration-200 ${
                  shadowKind === 'watchlist'
                    ? 'bg-black text-white'
                    : 'bg-[#F5F5F5] text-[#999]'
                }`}
              >
                观望中
              </button>
              <button
                type="button"
                onClick={() => setShadowKind('missed')}
                className={`rounded-full px-4 py-1.5 text-[13px] font-medium transition-all duration-200 ${
                  shadowKind === 'missed'
                    ? 'bg-black text-white'
                    : 'bg-[#F5F5F5] text-[#999]'
                }`}
              >
                错过的机会
              </button>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-[11px] text-[#999]">假设建仓价（可选）</label>
            <input
              type="number"
              step="any"
              min="0"
              value={hypo}
              onChange={(e) => setHypo(e.target.value)}
              className={`max-w-xs ${inputLine} font-mono`}
            />
          </div>

          <button
            type="submit"
            disabled={submitting || atLimit}
            className="rounded-xl bg-black px-6 py-2.5 text-[13px] font-semibold text-white transition-colors duration-200 hover:bg-[#333] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {atLimit ? '已达上限' : submitting ? '提交中…' : '添加'}
          </button>
        </form>
      </section>

      {atLimit && (
        <p className="mb-6 max-w-[640px] text-[13px] font-normal text-[#B45309]">
          免费版最多 5 个影子仓位
        </p>
      )}

      <section>
        <h2 className="mb-5 text-lg font-bold text-[#1A1A1A]">已有影子仓位</h2>

        {loading ? (
          <div className="space-y-3">
            {[1, 2].map((i) => (
              <div
                key={i}
                className="h-32 animate-pulse rounded-xl border border-dashed border-[#E8E8E8] bg-white dark:border-zinc-700 dark:bg-zinc-900"
              />
            ))}
          </div>
        ) : list.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[#E0E0E0] bg-white px-8 py-14 text-center text-sm text-[#999] dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-500">
            暂无影子仓位，请使用上方表单添加
          </div>
        ) : (
          <ul className="grid gap-4 md:grid-cols-2">
            {list.map((sp, i) => {
              const asset = sp.asset
              if (!asset) return null
              const isMissed = sp.shadow_type === 'missed'
              const label = isMissed ? '错过的机会' : '观望中'
              const tagCls = isMissed
                ? 'bg-[#FFF7ED] text-[#C2410C]'
                : 'bg-[#F5F5F5] text-[#555]'
              const hypoStr =
                sp.hypothetical_entry_price != null
                  ? Number(sp.hypothetical_entry_price).toFixed(4)
                  : '—'
              const scenario = pushByShadowId[String(sp.id)]

              return (
                <li
                  key={sp.id}
                  className="stagger-in"
                  style={{ animationDelay: `${i * 60}ms` }}
                >
                  <div className="card-hover relative rounded-xl border border-dashed border-[#E0E0E0] bg-white p-5 shadow-sm transition-shadow duration-200 hover:shadow-md dark:border-zinc-700 dark:bg-zinc-900">
                    <button
                      type="button"
                      onClick={() => handleDelete(sp.id)}
                      className="absolute right-4 top-4 rounded-lg p-1 text-[#CCC] transition-colors duration-200 hover:bg-[#FEF2F2] hover:text-[#EF4444]"
                      aria-label="删除"
                    >
                      <X className="h-4 w-4" strokeWidth={2} />
                    </button>

                    <span
                      className={`inline-block rounded-full px-2.5 py-0.5 text-[11px] font-medium ${tagCls}`}
                    >
                      {label}
                    </span>
                    <div className="mt-3 pr-8 text-base font-bold text-[#1A1A1A]">{asset.name}</div>
                    <div className="font-mono text-[12px] text-[#999]">{asset.code}</div>
                    <p className="mt-3 text-[13px] text-[#666]">
                      假设建仓价{' '}
                      <span className="font-mono font-medium text-[#1A1A1A]">{hypoStr}</span>
                    </p>
                  </div>

                  {scenario && (
                    <div className="mt-3 rounded-lg bg-[#F9F9F9] p-4">
                      <p className="text-[11px] font-medium text-[#999]">情景推演</p>
                      <div className="mt-2 flex items-start gap-2">
                        <DirectionIcon direction={scenario.direction} />
                        <div className="min-w-0 flex-1">
                          <p className="text-[13px] font-semibold text-[#1A1A1A]">
                            {scenario.event_title || '—'}
                          </p>
                          <p className="mt-2 text-[12px] leading-relaxed text-[#555]">
                            {scenario.scenario_text}
                          </p>
                        </div>
                      </div>
                      <p className="mt-3 text-[10px] leading-relaxed text-[#AAA]">
                        以上为历史情景对照，不构成投资建议
                      </p>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <footer className="mt-14 max-w-[720px] rounded-xl bg-[#F5F5F5] px-5 py-4 text-[11px] font-normal leading-relaxed text-[#777]">
        影子仓位仅提供方向性参考，不构成任何投资建议。投资有风险，入市需谨慎。
      </footer>
    </div>
  )
}
