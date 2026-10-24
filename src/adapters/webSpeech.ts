import type { SpeakOptions, SpeechCallbacks, SpeechEngine } from './speech'
import { pickSupportedVoices, resolveUtteranceVoice, type VoiceLike } from '../lib/voices'

/** 喂给合成器的分段上限：iOS 引擎对长文本会随机漏音节（"线粒体"→"线体"），切段后可靠得多 */
const TTS_SEG = 80

/** 把一个句子切成 ≤80 字的合成段（先按标点切，超长再硬切）；对界面隐藏，高亮仍按句 */
function splitForTts(s: string): string[] {
  if (s.length <= TTS_SEG) return [s]
  const parts = s.split(/(?<=[，,、：:；）)”'])/)
  const out: string[] = []
  let buf = ''
  for (const p of parts) {
    if (buf && buf.length + p.length > TTS_SEG) {
      out.push(buf)
      buf = p
    } else {
      buf += p
    }
  }
  if (buf) out.push(buf)
  return out.flatMap(x => (x.length <= TTS_SEG ? [x] : hardSlice(x)))
}

function hardSlice(s: string): string[] {
  const out: string[] = []
  for (let i = 0; i < s.length; i += TTS_SEG) out.push(s.slice(i, i + TTS_SEG))
  return out
}

/** 15 秒静音 bug 是桌面 Chrome 特有的，其平台不必（也无法）做 pause/resume 脉冲 */
const DESKTOP_CHROME =
  typeof navigator !== 'undefined' &&
  /Chrome/.test(navigator.userAgent) &&
  !/Android|iPhone|iPad|iPod|Mobile/.test(navigator.userAgent)

interface Segment {
  text: string
  /** 该段属于哪个句子（用于句级高亮与进度） */
  sentenceIdx: number
}

export class WebSpeechEngine implements SpeechEngine {
  private segments: Segment[] = []
  /** 当前合成段下标 */
  private current = 0
  private opts: SpeakOptions = { rate: 1, voiceURI: null }
  private state: 'idle' | 'playing' | 'paused' = 'idle'
  private keepAlive: ReturnType<typeof setInterval> | null = null
  /** 发声看门狗：speak 后一段时间系统仍未开始发声则自愈重试/上报 */
  private watchdog: ReturnType<typeof setTimeout> | null = null
  /** 连续合成失败计数：瞬间失败的段会让引擎跳段，连锁起来表现为"越播越快"，超限熔断 */
  private consecutiveErrors = 0
  /** 代际计数：cancel 后旧 utterance 的 onend/onerror 仍会触发，靠它判断事件是否已过期 */
  private gen = 0
  /** 当前书里选中的音色与按语言分组后的可用音色（speakChunk 时刷新；按句语言解析用） */
  private selected: VoiceLike | null = null
  private available: SpeechSynthesisVoice[] = []
  private cbs: SpeechCallbacks = {}

  setCallbacks(cbs: SpeechCallbacks) {
    this.cbs = cbs
  }

  isPlaying() {
    return this.state === 'playing'
  }

  isPaused() {
    return this.state === 'paused'
  }

  getVoices(): SpeechSynthesisVoice[] {
    // 只列出中文/英文/日语音色（产品设定），按语言分组排序
    return pickSupportedVoices(window.speechSynthesis.getVoices())
  }

  speakChunk(sentences: string[], opts: SpeakOptions, startIdx = 0, fromGesture = false) {
    this.opts = opts
    this.segments = []
    sentences.forEach((s, sentenceIdx) => {
      for (const piece of splitForTts(s)) this.segments.push({ text: piece, sentenceIdx })
    })
    this.current = Math.max(
      0,
      this.segments.findIndex(seg => seg.sentenceIdx >= startIdx),
    )
    this.state = 'playing'
    this.consecutiveErrors = 0
    this.gen++
    // speaking 卡在 true 是 iOS 僵死的典型症状，先强制清队列
    window.speechSynthesis.cancel()
    const all = window.speechSynthesis.getVoices()
    this.available = pickSupportedVoices(all)
    this.selected = all.find(x => x.voiceURI === this.opts.voiceURI) ?? null
    this.startKeepAlive()
    this.speakCurrent(fromGesture, true)
  }

  setOptions(opts: SpeakOptions) {
    const changed = opts.voiceURI !== this.opts.voiceURI || opts.rate !== this.opts.rate
    this.opts = opts
    if (this.state === 'playing' && changed) {
      // iOS 上排队中的旧音色 utterance 不会变，取消后用新音色立即重读当前段
      this.gen++
      window.speechSynthesis.cancel()
      this.speakCurrent(false, true)
    }
  }

  pause() {
    if (this.state !== 'playing') return
    this.state = 'paused'
    this.stopKeepAlive()
    window.speechSynthesis.pause()
  }

  resume() {
    if (this.state !== 'paused') return
    this.state = 'playing'
    this.startKeepAlive()
    window.speechSynthesis.resume()
    // 部分 Android 实现 resume() 无效：确认仍未恢复发声则从当前段重读
    setTimeout(() => {
      if (this.state === 'playing' && !window.speechSynthesis.speaking && !window.speechSynthesis.pending) {
        this.gen++
        window.speechSynthesis.cancel()
        this.speakCurrent(false, true)
      }
    }, 400)
  }

  stop() {
    this.halt()
  }

  /** 试听进行中标记与试听前的朗读状态（关闭设置面板停止试听时用于恢复朗读） */
  private previewActive = false
  private previewWasPlaying = false

  preview(text: string, opts: SpeakOptions) {
    // 试听强制用用户点选的音色（试听目的是听这个声音本身），文案语言由调用方按音色语言给定；
    // 试听会打断当前朗读：结束后自动从当前段恢复
    this.previewWasPlaying = this.state === 'playing'
    this.previewActive = true
    this.state = 'idle'
    this.gen++
    this.stopKeepAlive()
    this.clearWatchdog()
    window.speechSynthesis.cancel()

    const gen = this.gen
    const done = () => {
      this.previewActive = false
      if (gen !== this.gen) return
      if (this.previewWasPlaying && this.segments.length) {
        this.state = 'playing'
        this.startKeepAlive()
        this.speakCurrent()
      }
    }
    const speakIt = () => {
      if (gen !== this.gen) return
      const u = new SpeechSynthesisUtterance(text)
      u.rate = opts.rate
      const v = window.speechSynthesis.getVoices().find(x => x.voiceURI === opts.voiceURI)
      if (v) {
        u.voice = v
        u.lang = v.lang
      } else {
        u.lang = 'zh-CN'
      }
      u.onend = done
      u.onerror = done
      window.speechSynthesis.speak(u)
    }
    // 预热段垫住试听开口的掐头
    this.speakWarmup(gen, speakIt, true)
  }

  stopPreview() {
    if (!this.previewActive) return
    this.previewActive = false
    const wasPlaying = this.previewWasPlaying
    this.gen++
    this.clearWatchdog()
    window.speechSynthesis.cancel()
    if (wasPlaying && this.segments.length) {
      this.state = 'playing'
      this.startKeepAlive()
      this.speakCurrent()
    }
  }

  private speakCurrent(fromGesture = false, warmup = false) {
    if (this.current >= this.segments.length) {
      this.state = 'idle'
      this.stopKeepAlive()
      this.clearWatchdog()
      this.cbs.onChunkEnd?.()
      return
    }
    const seg = this.segments[this.current]
    const gen = this.gen
    const speakReal = () => {
      if (gen !== this.gen || this.state !== 'playing') return
      const u = new SpeechSynthesisUtterance(seg.text)
      u.rate = this.opts.rate
      // 按句子语言解析音色：选中的音色语言不匹配（如英文音色读中文会静音）时自动退到该语言的最优可用音色
      const resolved = resolveUtteranceVoice(seg.text, this.selected, this.available)
      if (resolved.voice) {
        u.voice = resolved.voice as SpeechSynthesisVoice
        u.lang = resolved.voice.lang
      } else {
        u.lang = resolved.lang
      }
      u.onstart = () => {
        if (gen !== this.gen || this.state !== 'playing') return
        // 只在进入新句子时上报（段是界面不可见的内部细节，高亮/进度按句）
        const prev = this.segments[this.current - 1]
        if (!prev || prev.sentenceIdx !== seg.sentenceIdx) {
          this.consecutiveErrors = 0
          this.clearWatchdog()
          this.cbs.onSentenceStart?.(seg.sentenceIdx)
        }
      }
      u.onend = () => {
        this.clearWatchdog()
        if (gen !== this.gen || this.state !== 'playing') return
        const ended = seg.text
        this.current++
        const next = this.segments[this.current]
        // 段间与句间留间隙：零间隙连喂会截音；句边界停顿更长也更自然
        const gap = !next
          ? 0
          : next.sentenceIdx !== seg.sentenceIdx
            ? (/[。！？…!?]$/.test(ended) ? 200 : 90)
            : 80
        setTimeout(() => {
          if (gen === this.gen && this.state === 'playing') this.speakCurrent()
        }, gap)
      }
      u.onerror = e => {
        this.clearWatchdog()
        if (gen !== this.gen) return
        if (e.error === 'interrupted' || e.error === 'canceled') return
        if (this.state !== 'playing') return
        this.consecutiveErrors++
        if (this.consecutiveErrors >= 4) {
          // 熔断：连续多段合成失败说明系统语音出问题了，停下并提示，而不是跳着狂奔
          this.halt()
          this.cbs.onEngineStall?.()
          return
        }
        this.current++
        this.speakCurrent()
      }
      window.speechSynthesis.speak(u)
      this.armWatchdog()
    }
    if (warmup) {
      // 预热段：cancel/恢复后引擎直接开口会掐掉第一个词（"火车为什么停下"→"为什么停下"），
      // 先说一个独立的短句"。"垫场，真实内容在它结束后开口。前导标点会被引擎剥掉所以不能用
      this.speakWarmup(gen, speakReal, fromGesture)
      return
    }
    // 用户手势直接触发的首次朗读同步 speak（iOS 的手势解锁链路）；引擎内部续读走宏任务规避 Chrome 丢句
    if (fromGesture) speakReal()
    else setTimeout(speakReal, 0)
  }

  private speakWarmup(gen: number, then: () => void, fromGesture: boolean) {
    // 静音预热段：cancel/恢复后引擎直接开口会掐掉第一个词，先走一遍零音量的合成垫场。
    // 不能用"。"等孤立标点当预热文本——会被语音引擎读出名字（"句号"）
    const w = new SpeechSynthesisUtterance('好')
    w.rate = this.opts.rate
    w.volume = 0
    w.lang = 'zh-CN'
    const proceed = () => {
      // 只校验代际（stop/新会话会使旧预热失效）；状态由 then 里的 speakReal 自行校验——
      // 试听路径的 state 是 idle，若在这里卡"必须 playing"会导致试听永远无声
      if (gen === this.gen) then()
    }
    w.onend = proceed
    w.onerror = proceed
    const speakIt = () => {
      // 只校验代际：试听路径 state 是 idle，卡"必须 playing"会让预热句发不出去（试听无声）
      if (gen !== this.gen) return
      window.speechSynthesis.speak(w)
      this.armWatchdog()
    }
    if (fromGesture) speakIt()
    else setTimeout(speakIt, 0)
  }

  private halt() {
    this.state = 'idle'
    this.gen++
    this.stopKeepAlive()
    this.clearWatchdog()
    window.speechSynthesis.cancel()
  }

  private armWatchdog() {
    this.clearWatchdog()
    this.watchdog = setTimeout(() => {
      if (this.state !== 'playing') return
      if (window.speechSynthesis.speaking || window.speechSynthesis.pending) return
      // 自愈：强制清队列后重试当前段（不再预热，避免自愈循环叠加延迟）
      this.gen++
      window.speechSynthesis.cancel()
      this.speakCurrent()
      setTimeout(() => {
        if (
          this.state === 'playing' &&
          !window.speechSynthesis.speaking &&
          !window.speechSynthesis.pending
        ) {
          this.cbs.onEngineStall?.()
        }
      }, 2000)
    }, 2500)
  }

  private clearWatchdog() {
    if (this.watchdog) {
      clearTimeout(this.watchdog)
      this.watchdog = null
    }
  }

  private startKeepAlive() {
    if (!DESKTOP_CHROME) return
    this.stopKeepAlive()
    this.keepAlive = setInterval(() => {
      if (this.state === 'playing' && window.speechSynthesis.speaking) {
        window.speechSynthesis.pause()
        window.speechSynthesis.resume()
      }
    }, 10000)
  }

  private stopKeepAlive() {
    if (this.keepAlive) {
      clearInterval(this.keepAlive)
      this.keepAlive = null
    }
  }
}

export const speechEngine = new WebSpeechEngine()
