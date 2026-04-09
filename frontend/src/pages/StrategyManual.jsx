import React, { useState, useEffect } from 'react'
import { 
  ShieldCheck, 
  Plus, 
  Trash2, 
  Settings2, 
  Zap, 
  BookOpen, 
  Target, 
  AlertTriangle 
} from 'lucide-react'
import { getStrategies, createStrategy, updateStrategy, deleteStrategy } from '../api'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../components/Toast'

export default function StrategyManual() {
  const { user } = useAuth()
  const showToast = useToast()
  const [strategies, setStrategies] = useState([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState(null)
  const [isAdding, setIsAdding] = useState(false)
  const [formData, setFormData] = useState({
    title: '',
    content: '',
    strategy_type: 'custom',
    is_active: true
  })

  useEffect(() => {
    if (user?.id) {
      loadStrategies()
    }
  }, [user])

  const loadStrategies = async () => {
    setLoading(true)
    try {
      const data = await getStrategies(user.id)
      setStrategies(data)
    } catch (e) {
      showToast('加载策略手册失败', 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    if (!formData.title || !formData.content) {
      showToast('请填写标题和内容', 'warning')
      return
    }

    try {
      if (editingId) {
        await updateStrategy(user.id, editingId, formData)
        showToast('策略已更新', 'success')
      } else {
        await createStrategy(user.id, formData)
        showToast('策略已添加', 'success')
      }
      setIsAdding(false)
      setEditingId(null)
      setFormData({ title: '', content: '', strategy_type: 'custom', is_active: true })
      loadStrategies()
    } catch (e) {
      showToast('保存失败', 'error')
    }
  }

  const handleDelete = async (id) => {
    if (window.confirm('确定要删除这条策略吗？')) {
      try {
        await deleteStrategy(id, user.id)
        showToast('已删除', 'success')
        loadStrategies()
      } catch (e) {
        showToast('删除失败', 'error')
      }
    }
  }

  const startEdit = (s) => {
    setEditingId(s.id)
    setFormData({
      title: s.title,
      content: s.content,
      strategy_type: s.strategy_type,
      is_active: s.is_active
    })
    setIsAdding(true)
  }

  return (
    <div className="max-w-5xl mx-auto py-10 px-6">
      <header className="mb-10 flex items-center justify-between">
        <div>
          <h1 className="text-[24px] font-bold text-zinc-900 dark:text-white flex items-center gap-3">
            <ShieldCheck className="w-8 h-8 text-indigo-600" />
            专属策略手册
          </h1>
          <p className="mt-2 text-[14px] text-zinc-500 max-w-lg">
            通过阶段性的复盘构建专属的交易纪律。Agent 团队将实时学习并依据该手册对您的每笔交易进行针对性审判与辅助。
          </p>
        </div>
        <button 
          onClick={() => { setIsAdding(true); setEditingId(null); setFormData({ title: '', content: '', strategy_type: 'custom', is_active: true }) }}
          className="flex items-center gap-2 px-4 py-2 bg-black text-white rounded-xl text-[14px] font-semibold hover:bg-zinc-800 transition-all dark:bg-white dark:text-black dark:hover:bg-zinc-200"
        >
          <Plus className="w-4 h-4" />
          新增策略
        </button>
      </header>

      {isAdding && (
        <div className="mb-10 p-6 bg-white border border-zinc-200 rounded-2xl shadow-sm dark:bg-zinc-900 dark:border-zinc-800">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="col-span-1">
              <label className="block text-[12px] font-bold text-zinc-400 uppercase tracking-wider mb-2">策略标题</label>
              <input 
                type="text" 
                className="w-full bg-zinc-50 border border-zinc-100 rounded-xl px-4 py-2 text-[14px] focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:bg-zinc-800/50 dark:border-zinc-700 dark:text-white"
                placeholder="例如：止损纪律、特定标的逻辑"
                value={formData.title}
                onChange={e => setFormData({ ...formData, title: e.target.value })}
              />
            </div>
            <div className="col-span-1">
              <label className="block text-[12px] font-bold text-zinc-400 uppercase tracking-wider mb-2">策略类型</label>
              <select 
                className="w-full bg-zinc-50 border border-zinc-100 rounded-xl px-4 py-2 text-[14px] focus:outline-none dark:bg-zinc-800/50 dark:border-zinc-700 dark:text-white"
                value={formData.strategy_type}
                onChange={e => setFormData({ ...formData, strategy_type: e.target.value })}
              >
                <option value="custom">自定义</option>
                <option value="stop_loss">止损守则</option>
                <option value="event_driven">事件驱动</option>
                <option value="fundamental">基本面锚点</option>
              </select>
            </div>
            <div className="col-span-2">
              <label className="block text-[12px] font-bold text-zinc-400 uppercase tracking-wider mb-2">核心守则/逻辑内容</label>
              <textarea 
                className="w-full bg-zinc-50 border border-zinc-100 rounded-xl px-4 py-3 text-[14px] h-32 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:bg-zinc-800/50 dark:border-zinc-700 dark:text-white"
                placeholder="详细描述该策略的触发条件、决策逻辑或必须遵守的底线..."
                value={formData.content}
                onChange={e => setFormData({ ...formData, content: e.target.value })}
              />
            </div>
          </div>
          <div className="mt-6 flex gap-3 justify-end">
             <button 
               onClick={() => setIsAdding(false)}
               className="px-4 py-2 text-[14px] font-medium text-zinc-500 hover:text-zinc-800"
             >
               取消
             </button>
             <button 
               onClick={handleSave}
               className="px-6 py-2 bg-indigo-600 text-white rounded-xl text-[14px] font-semibold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-500/20"
             >
               保存策略
             </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {loading ? (
          [1, 2].map(i => (
            <div key={i} className="h-40 bg-zinc-100 animate-pulse rounded-2xl dark:bg-zinc-800" />
          ))
        ) : strategies.length === 0 ? (
          <div className="col-span-2 py-20 text-center border-2 border-dashed border-zinc-100 rounded-3xl dark:border-zinc-800">
             <BookOpen className="w-12 h-12 text-zinc-200 mx-auto mb-4" />
             <p className="text-zinc-400 text-[14px]">暂无策略，点击上方新增您的第一条策略</p>
          </div>
        ) : strategies.map(s => (
          <div 
            key={s.id} 
            className="group p-6 bg-white border border-zinc-200 rounded-2xl hover:border-indigo-500/50 hover:shadow-lg transition-all dark:bg-zinc-900 dark:border-zinc-800"
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${
                  s.strategy_type === 'stop_loss' ? 'bg-red-50 text-red-600' : 
                  s.strategy_type === 'event_driven' ? 'bg-amber-50 text-amber-600' : 'bg-indigo-50 text-indigo-600'
                }`}>
                  {s.strategy_type === 'stop_loss' ? <AlertTriangle className="w-4 h-4" /> : 
                   s.strategy_type === 'event_driven' ? <Zap className="w-4 h-4" /> : <Target className="w-4 h-4" />}
                </div>
                <h3 className="font-bold text-zinc-900 dark:text-white">{s.title}</h3>
              </div>
              <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                 <button onClick={() => startEdit(s)} className="p-1.5 text-zinc-400 hover:text-indigo-600"><Settings2 className="w-4 h-4" /></button>
                 <button onClick={() => handleDelete(s.id)} className="p-1.5 text-zinc-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
              </div>
            </div>
            <p className="mt-4 text-[13px] text-zinc-600 leading-relaxed dark:text-zinc-400 line-clamp-3">
              {s.content}
            </p>
            <div className="mt-6 pt-4 border-t border-zinc-50 dark:border-zinc-800 flex items-center justify-between">
              <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest">{s.strategy_type}</span>
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${s.is_active ? 'bg-green-500' : 'bg-zinc-300'}`} />
                <span className="text-[11px] font-medium text-zinc-500 uppercase">{s.is_active ? 'Active' : 'Disabled'}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
