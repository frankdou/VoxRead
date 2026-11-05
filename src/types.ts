import type { TextLang } from './lib/voices'

export interface BookMeta {
  id: string
  title: string
  sourceFilename: string
  pageCount: number
  totalChunks: number
  createdAt: number
  lastReadAt: number
  coverBlob?: Blob
  /** 解析质量警告（乱码 / 疑似双栏） */
  lowQuality?: boolean
  /** 书籍主要语言：导入时由 PDF 元数据或正文检测得出（历史书籍打开时补检测） */
  language?: TextLang
  /** 用户在本书中手动选定的音色；为空表示按书籍语言自动选择 */
  voiceURI?: string | null
}

export interface Chunk {
  bookId: string
  seq: number
  text: string
}

export interface Progress {
  bookId: string
  chunkSeq: number
  sentenceIndex: number
  updatedAt: number
}

export interface Settings {
  id: 'global'
  rate: number
  voiceURI: string | null
  theme: 'light' | 'dark'
  fontSize: number
}
