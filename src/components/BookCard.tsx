import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { TriangleAlert, X } from 'lucide-react'
import { repository } from '../adapters/indexeddb'
import { coverCacheKey, getCachedCover, makeCoverDataUrl, setCachedCover } from '../lib/cover'
import type { BookMeta } from '../types'

interface Props {
  book: BookMeta
  onDelete: (book: BookMeta) => void
}

// 迁移做去重，避免 StrictMode 双重 effect 或列表刷新时重复写库
const migrating = new Set<string>()

export default function BookCard({ book, onDelete }: Props) {
  const navigate = useNavigate()
  const progress = useLiveQuery(() => repository.getProgress(book.id), [book.id], null)
  const [coverUrl, setCoverUrl] = useState<string | null>(book.coverDataUrl ?? null)

  // 新数据直接用持久化的 data URL；老数据（Blob）首次读取成功后懒迁移成字符串并清除 Blob。
  // iOS WebKit 的 IndexedDB Blob 在同一会话内可能失效（重启浏览器才恢复），
  // 所以优先用字符串，同一会话内再用内存缓存兜一次，任何失败都退回字母占位
  useEffect(() => {
    if (book.coverDataUrl) {
      setCoverUrl(book.coverDataUrl)
      return
    }
    const blob = book.coverBlob
    if (!(blob instanceof Blob) || blob.size === 0) {
      setCoverUrl(null)
      return
    }
    const cacheKey = coverCacheKey(book.id, blob)
    const cached = getCachedCover(cacheKey)
    if (cached) {
      setCoverUrl(cached)
      return
    }
    let cancelled = false
    makeCoverDataUrl(blob).then(url => {
      if (url) {
        // 成功读到数据后立刻缓存并迁移；即使本次 effect 已被 StrictMode 取消，
        // 迁移仍然有价值（封面内容对同一本书是稳定的）
        setCachedCover(cacheKey, url)
        if (!cancelled) setCoverUrl(url)
        if (!migrating.has(book.id)) {
          migrating.add(book.id)
          repository.updateBookCover(book.id, url).catch(() => migrating.delete(book.id))
        }
        return
      }
      if (!cancelled) setCoverUrl(getCachedCover(cacheKey))
    })
    return () => {
      cancelled = true
    }
  }, [book.id, book.coverDataUrl, book.coverBlob])

  const pct = book.totalChunks
    ? Math.min(100, Math.round((((progress?.chunkSeq ?? 0) + 1) / book.totalChunks) * 100))
    : 0

  return (
    <div className="relative">
      <button
        className="block w-full overflow-hidden rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-left shadow-sm"
        style={{ aspectRatio: '3 / 4' }}
        onClick={() => navigate(`/book/${book.id}`)}
      >
        {coverUrl ? (
          <img
            src={coverUrl}
            alt={book.title}
            className="h-full w-full object-cover"
            onError={() => setCoverUrl(null)}
          />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-4xl font-bold text-white/90">
            {book.title.slice(0, 1)}
          </span>
        )}
        <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-2 pt-8">
          <span className="line-clamp-2 text-xs leading-snug text-white">{book.title}</span>
          <span className="mt-1.5 block h-0.5 w-full rounded bg-white/30">
            <span className="block h-full rounded bg-indigo-400" style={{ width: `${pct}%` }} />
          </span>
        </span>
      </button>
      {book.lowQuality && (
        <span
          title="解析质量可能不佳（乱码或双栏），朗读体验可能受影响"
          className="absolute left-1.5 top-1.5 flex items-center gap-0.5 rounded-md bg-amber-500/90 px-1.5 py-0.5 text-[10px] text-white"
        >
          <TriangleAlert size={10} />
          解析质量
        </span>
      )}
      <button
        aria-label="删除"
        onClick={e => {
          e.stopPropagation()
          onDelete(book)
        }}
        className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur"
      >
        <X size={13} />
      </button>
    </div>
  )
}
