import type { BookMeta, Chunk, Progress, Settings } from '../types'
import type { TextLang } from '../lib/voices'

export class ImportError extends Error {
  constructor(
    message: string,
    public code: 'scanned' | 'parse',
  ) {
    super(message)
  }
}

/** 书籍数据层：方案B 切换时用 HTTP 实现替换（见 docs/plan-a-browser-only.md §3） */
export interface BookRepository {
  listBooks(): Promise<BookMeta[]>
  getBook(id: string): Promise<BookMeta | undefined>
  importBook(file: File, onProgress?: (pct: number) => void): Promise<BookMeta>
  getChunks(bookId: string, fromSeq: number, count: number): Promise<Chunk[]>
  saveProgress(p: Progress): Promise<void>
  getProgress(bookId: string): Promise<Progress | null>
  /** 保存本书手动选择的音色（null 表示改回按语言自动选择） */
  updateBookVoice(bookId: string, voiceURI: string | null): Promise<void>
  /** 回写历史书籍检测出的语言 */
  updateBookLanguage(bookId: string, language: TextLang): Promise<void>
  /** 懒迁移：把历史封面 Blob 转成小图字符串并清除 Blob */
  updateBookCover(bookId: string, coverDataUrl: string): Promise<void>
  deleteBook(bookId: string): Promise<void>
  getSettings(): Promise<Settings | null>
  saveSettings(s: Settings): Promise<void>
  exportAll(): Promise<Blob>
  importJson(data: unknown): Promise<{ books: number }>
}
