export interface SpeakOptions {
  rate: number
  voiceURI: string | null
}

export interface SpeechCallbacks {
  /** 第 index 句开始朗读（index 相对本次 speakChunk 传入的句子数组） */
  onSentenceStart?: (index: number) => void
  /** 本次传入的句子全部读完 */
  onChunkEnd?: () => void
  /** 朗读引擎无响应（发出 speak 后系统既未开始也未排队）——通常是 iOS 僵死或静音 */
  onEngineStall?: () => void
}

/** 朗读引擎层：方案B 切换时用流式 <audio> 实现替换 */
export interface SpeechEngine {
  speakChunk(sentences: string[], opts: SpeakOptions, startIdx?: number, fromGesture?: boolean): void
  setOptions(opts: SpeakOptions): void
  setCallbacks(cbs: SpeechCallbacks): void
  pause(): void
  resume(): void
  stop(): void
  isPlaying(): boolean
  isPaused(): boolean
  getVoices(): SpeechSynthesisVoice[]
  preview(text: string, opts: SpeakOptions): void
  /** 若正在试听：立即停掉试听声音；此前若在朗读则接着读 */
  stopPreview(): void
}
