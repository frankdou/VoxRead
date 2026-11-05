import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const speak = vi.fn()
const cancel = vi.fn()

/** 最小化的语音合成桩：只记录是否真的发声，不模拟系统引擎细节 */
class FakeUtterance {
  text: string
  rate = 1
  volume = 1
  lang = ''
  voice: unknown = null
  onend: (() => void) | null = null
  onerror: (() => void) | null = null
  onstart: (() => void) | null = null
  constructor(text: string) {
    this.text = text
  }
}

describe('WebSpeechEngine 只由调用方显式触发朗读', () => {
  beforeEach(() => {
    speak.mockClear()
    cancel.mockClear()
    vi.resetModules()
    vi.useFakeTimers()
    vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance)
    vi.stubGlobal('window', {
      speechSynthesis: {
        speak,
        cancel,
        getVoices: () => [],
        speaking: false,
        pending: false,
        pause: vi.fn(),
        resume: vi.fn(),
      },
    })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('创建后不会自动开口（打开书籍/恢复进度不触发朗读）', async () => {
    const { WebSpeechEngine } = await import('../../adapters/webSpeech')
    const engine = new WebSpeechEngine()
    expect(engine.isPlaying()).toBe(false)
    await vi.runAllTimersAsync()
    expect(speak).not.toHaveBeenCalled()
  })

  it('stop 后排队中的合成任务不会继续发声，且可重复调用', async () => {
    const { WebSpeechEngine } = await import('../../adapters/webSpeech')
    const engine = new WebSpeechEngine()
    engine.speakChunk(['第一句。'], { rate: 1, voiceURI: null })
    expect(engine.isPlaying()).toBe(true)

    engine.stop()
    engine.stop()
    await vi.runAllTimersAsync()

    expect(engine.isPlaying()).toBe(false)
    expect(speak).not.toHaveBeenCalled()
    expect(cancel).toHaveBeenCalled()
  })
})
