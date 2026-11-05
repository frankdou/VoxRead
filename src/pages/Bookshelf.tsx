import { useEffect, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { BookCopy, BookOpenText, Plus, Search, Settings, X } from 'lucide-react'
import { repository, ImportError } from '../adapters/indexeddb'
import type { BookMeta } from '../types'
import BookCard from '../components/BookCard'
import SettingsSheet from '../components/SettingsSheet'

const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  (navigator as { standalone?: boolean }).standalone === true

const isIOS = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

export default function Bookshelf() {
  const books = useLiveQuery(() => repository.listBooks(), [], [])
  const [importing, setImporting] = useState<{ name: string; pct: number } | null>(null)
  const [notice, setNotice] = useState<{ msg: string; kind: 'info' | 'error' } | null>(null)
  const [search, setSearch] = useState('')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!notice || notice.kind === 'error') return
    const t = setTimeout(() => setNotice(null), 3500)
    return () => clearTimeout(t)
  }, [notice])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const list = books ?? []
    return q ? list.filter(b => b.title.toLowerCase().includes(q)) : list
  }, [books, search])

  async function handleFiles(files: FileList | null) {
    if (!files?.length) return
    for (const file of Array.from(files)) {
      if (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') {
        setNotice({ msg: `${file.name}：不是 PDF 文件`, kind: 'info' })
        continue
      }
      setImporting({ name: file.name, pct: 0 })
      try {
        await repository.importBook(file, pct => setImporting({ name: file.name, pct }))
        setNotice({ msg: `已导入《${file.name.replace(/\.pdf$/i, '')}》`, kind: 'info' })
      } catch (e) {
        const msg = e instanceof ImportError ? e.message : '导入失败，请重试'
        setNotice({ msg: `${file.name}：${msg}`, kind: 'error' })
      } finally {
        setImporting(null)
      }
    }
    if (fileRef.current) fileRef.current.value = ''
  }

  async function handleDelete(book: BookMeta) {
    if (window.confirm(`删除《${book.title}》？该书文本与进度将一并删除。`)) {
      await repository.deleteBook(book.id)
      setNotice({ msg: `已删除《${book.title}》`, kind: 'info' })
    }
  }

  const empty = books !== undefined && books.length === 0

  return (
    <div className="min-h-dvh pb-28">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-slate-100/85 backdrop-blur dark:border-slate-800 dark:bg-slate-950/85">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-3">
          <h1 className="flex items-center gap-2 text-lg font-bold">
            <BookCopy size={22} aria-hidden="true" />
            VoxRead
          </h1>
          <div className="flex-1" />
          <button
            onClick={() => setSettingsOpen(true)}
            aria-label="设置"
            className="flex h-9 w-9 items-center justify-center rounded-full active:bg-slate-200 dark:active:bg-slate-800"
          >
            <Settings size={20} />
          </button>
        </div>
        {(books?.length ?? 0) > 0 && (
          <div className="mx-auto max-w-2xl px-4 pb-3">
            <div className="relative">
              <Search
                size={16}
                className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                type="search"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="搜索书名"
                className="w-full rounded-full bg-white py-2 pl-10 pr-4 text-sm shadow-sm outline-none placeholder:text-slate-400 focus:ring-2 focus:ring-indigo-500/50 dark:bg-slate-900"
              />
            </div>
          </div>
        )}
      </header>

      <main className="mx-auto max-w-2xl px-4 pt-4">
        {empty ? (
          <div className="mt-16 space-y-6 text-center">
            <BookOpenText size={56} className="mx-auto text-indigo-300" strokeWidth={1.5} />
            <div>
              <p className="font-medium">书架还是空的</p>
              <p className="mt-1 text-sm text-slate-500">点右下角 + 上传一本 PDF 开始</p>
            </div>
            {!isStandalone() && isIOS() && (
              <div className="rounded-xl bg-amber-50 p-4 text-left text-sm text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
                <p className="mb-1 font-medium">建议先把 VoxRead 添加到主屏幕</p>
                <p className="leading-relaxed">
                  Safari 底部分享按钮 →「添加到主屏幕」。
                  未安装的站点在 iOS 上 7 天不访问会被清空数据（书会丢）；另外听书前建议在
                  系统设置 → 辅助功能 → 朗读内容 → 声音 里下载高质量中文语音。
                </p>
              </div>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
            {filtered.map(b => (
              <BookCard key={b.id} book={b} onDelete={handleDelete} />
            ))}
          </div>
        )}
      </main>

      <button
        onClick={() => fileRef.current?.click()}
        aria-label="上传 PDF"
        className="fixed bottom-[calc(1.25rem+env(safe-area-inset-bottom))] right-4 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-indigo-600 text-white shadow-xl shadow-indigo-600/30 active:scale-95"
      >
        <Plus size={28} />
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="application/pdf,.pdf"
        multiple
        className="hidden"
        onChange={e => handleFiles(e.target.files)}
      />

      {importing && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-6">
          <div className="w-full max-w-xs rounded-2xl bg-white p-5 text-center dark:bg-slate-900">
            <p className="mb-1 text-sm font-medium">正在解析</p>
            <p className="mb-4 truncate text-xs text-slate-400">{importing.name}</p>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
              <div
                className="h-full rounded-full bg-indigo-600 transition-all"
                style={{ width: `${importing.pct}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {notice && (
        <div className="fixed inset-x-0 bottom-24 z-40 flex justify-center px-4">
          {notice.kind === 'error' ? (
            <div className="flex w-full max-w-md items-start gap-2 rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-300">
              <p className="min-w-0 flex-1 break-all select-all">{notice.msg}</p>
              <button
                aria-label="关闭错误提示"
                onClick={() => setNotice(null)}
                className="shrink-0 text-red-400"
              >
                <X size={18} />
              </button>
            </div>
          ) : (
            <p className="max-w-sm rounded-full bg-slate-800/90 px-4 py-2 text-center text-sm text-white">
              {notice.msg}
            </p>
          )}
        </div>
      )}

      <SettingsSheet open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  )
}
