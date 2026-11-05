import { useEffect, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { BookCopy, BookOpenText, Plus, Search, Settings, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
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
  const { t, i18n } = useTranslation()
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
        setNotice({ msg: i18n.t('bookshelf.notPdf', { file: file.name }), kind: 'info' })
        continue
      }
      setImporting({ name: file.name, pct: 0 })
      try {
        await repository.importBook(file, pct => setImporting({ name: file.name, pct }))
        setNotice({
          // 异步流程结束时才取文案，避免导入期间切换语言后仍用旧语言
          msg: i18n.t('bookshelf.imported', { name: file.name.replace(/\.pdf$/i, '') }),
          kind: 'info',
        })
      } catch (e) {
        const msg = e instanceof ImportError ? e.message : i18n.t('bookshelf.importFailed')
        setNotice({
          msg: i18n.t('bookshelf.importDetail', { file: file.name, message: msg }),
          kind: 'error',
        })
      } finally {
        setImporting(null)
      }
    }
    if (fileRef.current) fileRef.current.value = ''
  }

  async function handleDelete(book: BookMeta) {
    if (window.confirm(i18n.t('bookshelf.deleteConfirm', { title: book.title }))) {
      await repository.deleteBook(book.id)
      setNotice({ msg: i18n.t('bookshelf.deleted', { title: book.title }), kind: 'info' })
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
            aria-label={t('settings.title')}
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
              {/* iOS 在输入框字号 < 16px 聚焦时会自动放大页面，这里用 16px + leading-5 保持原有行高 */}
              <input
                type="search"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder={t('bookshelf.searchPlaceholder')}
                className="w-full rounded-full bg-white py-2 pl-10 pr-4 text-[16px] leading-5 shadow-sm outline-none placeholder:text-slate-400 focus:ring-2 focus:ring-indigo-500/50 dark:bg-slate-900"
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
              <p className="font-medium">{t('bookshelf.emptyTitle')}</p>
              <p className="mt-1 text-sm text-slate-500">{t('bookshelf.emptyHint')}</p>
            </div>
            {!isStandalone() && isIOS() && (
              <div className="rounded-xl bg-amber-50 p-4 text-left text-sm text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
                <p className="mb-1 font-medium">{t('bookshelf.iosTitle')}</p>
                <p className="leading-relaxed">{t('bookshelf.iosBody')}</p>
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
        aria-label={t('bookshelf.uploadPdf')}
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
            <p className="mb-1 text-sm font-medium">{t('bookshelf.importing')}</p>
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
                aria-label={t('bookshelf.dismissError')}
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
