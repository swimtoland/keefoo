import React from 'react'
import { Bot, TrendingUp, TrendingDown, Clock, Info, ShieldAlert, GitBranch } from 'lucide-react'
import { useUiPreferences } from '../contexts/UiPreferencesContext.jsx'

function formatWhen(iso) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return '—'
  }
}

export default function FeedCard({ item, onRead, onAssetClick, onNodeClick }) {
  const isRead = item.is_read
  const score = item.relevance_score || 0
  const { t } = useUiPreferences()
  
  // 设计哲学：工程级三层展示
  // Layer 1: 核心事实 (Event Title + Impact)
  // Layer 2: 关联深度 (Relevance Score + Linked Assets)
  // Layer 3: Agent 审判/提示 (Relevance Note)
  
  return (
    <div 
      className={`group relative overflow-hidden rounded-2xl border transition-all duration-300 ${
        isRead 
          ? 'bg-[#F9FAFB] border-[#F2F4F7] dark:bg-zinc-900/40 dark:border-zinc-800/50' 
          : 'bg-white border-[#EAECF0] shadow-sm hover:shadow-md dark:bg-zinc-900 dark:border-zinc-800'
      }`}
      onClick={() => !isRead && onRead && onRead(item.id)}
    >
      {/* 侧边强度条 */}
      <div 
        className="absolute left-0 top-0 bottom-0 w-1.5 transition-all"
        style={{ 
          backgroundColor: score > 0.8 ? '#101828' : score > 0.5 ? '#667085' : '#D0D5DD',
          opacity: isRead ? 0.3 : 1
        }}
      />

      <div className="p-5 pl-7">
        {/* Layer 1: 头部 & 核心事实 */}
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1">
              {item.relevance_level && (
                <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                  item.relevance_level === 'direct' 
                    ? 'bg-blue-600 text-white' 
                    : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400'
                }`}>
                  {t(`feed.level.${item.relevance_level}`) || item.relevance_level}
                </span>
              )}
              <span className="text-[11px] text-zinc-400 flex items-center gap-1 font-medium">
                <Clock className="w-3 h-3" />
                {formatWhen(item.event_occurred_at)}
              </span>
            </div>
            <h3 className={`text-[15px] font-bold leading-snug truncate ${
              isRead ? 'text-zinc-500' : 'text-zinc-900 dark:text-zinc-100'
            }`}>
              {item.event_title}
            </h3>
          </div>
          <div className="shrink-0 flex items-center gap-1 text-[13px] font-mono font-medium text-zinc-400">
            {(score * 100).toFixed(0)}%
          </div>
        </div>

        {/* Layer 2: 关联推演 */}
        <div className="mt-3 flex flex-wrap gap-2">
          {item.related_asset_ids?.map(assetId => (
            <button 
              key={assetId} 
              onClick={(e) => { e.stopPropagation(); onAssetClick && onAssetClick(assetId); }}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-50 border border-zinc-200 text-[11px] font-bold text-zinc-700 hover:border-zinc-400 transition-colors dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-300 dark:hover:border-zinc-500"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
              {assetId}
            </button>
          ))}
          
          {/* 模拟的逻辑关联节点（Weaver 提取） */}
          {score > 0.6 && (
            <>
              {['动销数据', '成本结构'].map(node => (
                <button 
                  key={node}
                  onClick={(e) => { e.stopPropagation(); onNodeClick && onNodeClick(e, {label: node}); }}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-zinc-100 text-[11px] text-zinc-400 hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-500 dark:hover:bg-zinc-800/50"
                >
                  <GitBranch className="w-3 h-3" />
                  {node}
                </button>
              ))}
            </>
          )}
        </div>

        {/* Layer 3: Agent 深度解析 (Atomic Note) */}
        {item.relevance_note && (
          <div className="mt-4 flex flex-col gap-2 p-3.5 rounded-xl bg-zinc-50 border border-zinc-100 dark:bg-zinc-950/30 dark:border-zinc-800/50">
            <div className="flex items-center gap-2 text-[10px] font-bold text-zinc-400 uppercase tracking-tight">
              <Bot className="w-3.5 h-3.5" />
              Judge Audit
            </div>
            <p className="text-[12.5px] leading-relaxed text-zinc-700 dark:text-zinc-300 font-medium">
              {item.relevance_note}
            </p>
          </div>
        )}
      </div>

      {!isRead && (
        <div className="absolute top-4 right-12">
          <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
        </div>
      )}
    </div>
  )
}
