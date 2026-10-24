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
