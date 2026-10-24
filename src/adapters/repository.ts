import type { BookMeta, Chunk, Progress, Settings } from '../types'

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
  deleteBook(bookId: string): Promise<void>
  getSettings(): Promise<Settings | null>
  saveSettings(s: Settings): Promise<void>
  exportAll(): Promise<Blob>
  importJson(data: unknown): Promise<{ books: number }>
}
