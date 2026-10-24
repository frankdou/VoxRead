import { useEffect, useRef, useState } from 'react'
import { Popup, SearchBar } from 'antd-mobile'
import type { SearchHit } from '../lib/search'

interface Props {
  open: boolean
  onClose: () => void
  onSearch: (query: string) => Promise<SearchHit[]>
  onSelect: (hit: SearchHit) => void
}

export default function SearchSheet({ open, onClose, onSearch, onSelect }: Props) {
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<SearchHit[] | null>(null)
  const [busy, setBusy] = useState(false)
  const timer = useRef<number | undefined>(undefined)

  // 结果与关键词跨开关保留，直到新查询替换（关闭面板不清空）
  useEffect(() => {
    if (!open) return
    window.clearTimeout(timer.current)
    const q = query.trim()
    const cjk = /[\u4e00-\u9fff]/.test(q)
    if (q.length < (cjk ? 1 : 2)) {
      setHits(null)
      return
    }
    timer.current = window.setTimeout(async () => {
      setBusy(true)
      try {
        setHits(await onSearch(q))
      } finally {
        setBusy(false)
      }
    }, 300)
    return () => window.clearTimeout(timer.current)
  }, [query, open, onSearch])

  return (
    // 顶部弹出：键盘从底部升起，搜索框和结果在上方，物理上不会被键盘遮挡
    <Popup
      visible={open}
      onMaskClick={onClose}
      position="top"
      destroyOnClose
      onClose={onClose}
      bodyStyle={{ borderBottomLeftRadius: 16, borderBottomRightRadius: 16 }}
    >
      <div className="flex max-h-[62vh] flex-col overflow-hidden pt-2">
        <div className="px-3 pb-1">
          <SearchBar
            value={query}
            onChange={setQuery}
            placeholder="输入要找的文字（忽略空格和标点）"
            cancelText="取消"
            onCancel={onClose}
            autoFocus
          />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3 pt-1">
          {busy && <p className="px-2 py-4 text-center text-sm text-slate-400">搜索中…</p>}
          {!busy && hits === null && (
            <p className="px-2 py-6 text-center text-sm text-slate-400">
              在本书全文中查找任意文字，点击结果跳转过去
            </p>
          )}
          {!busy && hits !== null && hits.length === 0 && (
            <p className="px-2 py-6 text-center text-sm text-slate-400">没有找到匹配内容</p>
          )}
          {!busy &&
            hits?.map((h, i) => (
              <button
                key={`${h.seq}-${i}`}
                onClick={() => onSelect(h)}
                className="flex w-full items-baseline gap-2 rounded-lg px-3 py-2.5 text-left text-sm leading-relaxed active:bg-slate-100 dark:active:bg-slate-800"
              >
                <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-xs tabular-nums text-slate-500 dark:bg-slate-800">
                  块{h.seq + 1}
                </span>
                <span className="min-w-0 flex-1">
                  {h.before}
                  <mark className="rounded-sm bg-amber-200 px-0.5 text-inherit dark:bg-amber-500/40">
                    {h.match}
                  </mark>
                  {h.after}
                </span>
              </button>
            ))}
        </div>
      </div>
    </Popup>
  )
}
