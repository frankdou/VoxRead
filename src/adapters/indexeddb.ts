import Dexie, { type Table } from 'dexie'
import type { BookMeta, Chunk, Progress, Settings } from '../types'
import { ImportError, type BookRepository } from './repository'

export { ImportError }
import { extractBook } from '../lib/pdf'
import { buildChunks } from '../lib/chunker'
import { blobToDataUrl, makeCoverDataUrl } from '../lib/cover'
import { detectBookLanguage, langTagToTextLang, type TextLang } from '../lib/voices'

class VoxReadDB extends Dexie {
  books!: Table<BookMeta, string>
  chunks!: Table<Chunk, [string, number]>
  progress!: Table<Progress, string>
  settings!: Table<Settings, string>

  constructor() {
    super('voxread')
    this.version(1).stores({
      books: 'id, lastReadAt',
      chunks: '[bookId+seq], bookId',
      progress: 'bookId',
      settings: 'id',
    })
  }
}

export const db = new VoxReadDB()

function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

/** 取开头/中段/结尾的正文样本做语言检测，避免拼接整本书 */
function languageSample(paragraphs: string[]): string {
  const n = paragraphs.length
  if (n === 0) return ''
  const pick = (from: number, count: number) =>
    paragraphs.slice(from, from + count).map(p => p.slice(0, 1000)).join('\n')
  return [
    pick(0, 20),
    pick(Math.max(0, Math.floor(n / 2) - 5), 10),
    pick(Math.max(0, n - 20), 20),
  ].join('\n')
}

interface ExportFile {
  version: 1
  exportedAt: number
  books: (Omit<BookMeta, 'coverBlob'> & { coverBlob?: string })[]
  chunks: Chunk[]
  progress: Progress[]
  settings?: Settings[]
}

export const repository: BookRepository = {
  async listBooks() {
    return db.books.orderBy('lastReadAt').reverse().toArray()
  },

  async getBook(id) {
    return db.books.get(id)
  },

  async importBook(file, onProgress) {
    let result: Awaited<ReturnType<typeof extractBook>>
    try {
      const buf = await file.arrayBuffer()
      result = await extractBook(buf, onProgress)
    } catch (e) {
      // 带上底层错误信息，避免吞掉真实原因（如旧浏览器的 API 缺失、内存不足）
      const detail = e instanceof Error ? e.message : String(e)
      throw new ImportError(`无法解析该 PDF 文件（${detail.slice(0, 200)}）`, 'parse')
    }
    const totalChars = result.paragraphs.reduce((n, p) => n + p.length, 0)
    if (result.paragraphs.length === 0 || totalChars < 100) {
      throw new ImportError('未检测到文本层（可能是扫描版 PDF），暂不支持', 'scanned')
    }
    const chunks = buildChunks(result.paragraphs)
    // 优先用 PDF 元数据语言标签，缺失或无法识别时按正文检测；都失败则留空，不阻断导入
    const language =
      langTagToTextLang(result.language ?? '') ??
      detectBookLanguage(languageSample(result.paragraphs)) ??
      undefined
    // 封面直接压成小图字符串持久化：iOS WebKit 的 IndexedDB Blob 在同一会话内可能失效，
    // 展示时不再需要读 Blob；转换失败就留空，由卡片走字母占位
    const coverDataUrl = result.coverBlob
      ? ((await makeCoverDataUrl(result.coverBlob)) ?? undefined)
      : undefined
    const meta: BookMeta = {
      id: uid(),
      title: result.title ?? file.name.replace(/\.pdf$/i, ''),
      sourceFilename: file.name,
      pageCount: result.pageCount,
      totalChunks: chunks.length,
      createdAt: Date.now(),
      lastReadAt: Date.now(),
      lowQuality: result.garbled || result.doubleColumn,
      language,
      coverDataUrl,
    }
    await db.transaction('rw', db.books, db.chunks, async () => {
      await db.books.add(meta)
      await db.chunks.bulkAdd(chunks.map((text, i) => ({ bookId: meta.id, seq: i, text })))
    })
    onProgress?.(100)
    return meta
  },

  async getChunks(bookId, fromSeq, count) {
    return db.chunks
      .where('bookId')
      .equals(bookId)
      .and(c => c.seq >= fromSeq && c.seq < fromSeq + count)
      .sortBy('seq')
  },

  async saveProgress(p) {
    await db.progress.put(p)
    await db.books.update(p.bookId, { lastReadAt: Date.now() })
  },

  async getProgress(bookId) {
    return (await db.progress.get(bookId)) ?? null
  },

  async updateBookVoice(bookId, voiceURI) {
    await db.books.update(bookId, { voiceURI })
  },

  async updateBookLanguage(bookId, language: TextLang) {
    await db.books.update(bookId, { language })
  },

  async updateBookCover(bookId, coverDataUrl) {
    // 写字符串的同时删除历史 Blob，避免两份额外占用；迁移失败时卡片仍有兜底
    await db.books.where('id').equals(bookId).modify(b => {
      b.coverDataUrl = coverDataUrl
      delete b.coverBlob
    })
  },

  async deleteBook(bookId) {
    await db.transaction('rw', db.books, db.chunks, db.progress, async () => {
      await db.books.delete(bookId)
      await db.chunks.where('bookId').equals(bookId).delete()
      await db.progress.delete(bookId)
    })
  },

  async getSettings() {
    return (await db.settings.get('global')) ?? null
  },

  async saveSettings(s) {
    await db.settings.put(s)
  },

  async exportAll() {
    const [books, chunks, progress, settings] = await Promise.all([
      db.books.toArray(),
      db.chunks.toArray(),
      db.progress.toArray(),
      db.settings.toArray(),
    ])
    const exportBooks = await Promise.all(
      books.map(async b => ({
        ...b,
        coverBlob: b.coverBlob ? await blobToDataUrl(b.coverBlob) : undefined,
      })),
    )
    const payload: ExportFile = {
      version: 1,
      exportedAt: Date.now(),
      books: exportBooks as ExportFile['books'],
      chunks,
      progress,
      settings,
    }
    return new Blob([JSON.stringify(payload)], { type: 'application/json' })
  },

  async importJson(data) {
    const parsed = data as ExportFile
    if (!parsed || !Array.isArray(parsed.books) || !Array.isArray(parsed.chunks)) {
      throw new ImportError('备份文件格式不正确', 'parse')
    }
    const books = await Promise.all(
      parsed.books.map(async b => ({
        ...b,
        coverBlob: typeof b.coverBlob === 'string' ? await dataUrlToBlob(b.coverBlob) : undefined,
      })),
    )
    await db.transaction('rw', db.books, db.chunks, db.progress, db.settings, async () => {
      await db.books.bulkPut(books as unknown as BookMeta[])
      await db.chunks.bulkPut(parsed.chunks)
      if (Array.isArray(parsed.progress)) await db.progress.bulkPut(parsed.progress)
      if (Array.isArray(parsed.settings)) await db.settings.bulkPut(parsed.settings)
    })
    return { books: books.length }
  },
}

function dataUrlToBlob(u: string): Promise<Blob> {
  return fetch(u).then(r => r.blob())
}
