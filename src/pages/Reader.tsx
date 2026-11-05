import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { Link, useParams } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { Toast } from 'antd-mobile'
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  LocateFixed,
  Search,
  TriangleAlert,
} from 'lucide-react'
import { repository } from '../adapters/indexeddb'
import { speechEngine } from '../adapters/webSpeech'
import { splitSentences, splitSentencesRich } from '../lib/sentences'
import { resolveResumePosition } from '../lib/progress'
import { shouldContinueReading, type JumpSource } from '../lib/jump'
import { searchChunks, type SearchHit } from '../lib/search'
import {
  detectBookLanguage,
  languageLabel,
  resolveBookVoice,
  type TextLang,
} from '../lib/voices'
import { useSettings } from '../store/settings'
import PlayerBar from '../components/PlayerBar'
import SettingsSheet from '../components/SettingsSheet'
import VoiceSheet from '../components/VoiceSheet'
import SearchSheet from '../components/SearchSheet'
import PageJumpSheet from '../components/PageJumpSheet'

const BEFORE = 2
const AFTER = 5

/** 跨 Reader 实例串行化进度写入：退出后立即重进时，初始化可以等最近一次写入真正落盘，避免读到旧值 */
let pendingProgressWrite: Promise<void> = Promise.resolve()

/** 块文本 → 按段落分组的句子（保留每段首句的全局序号，供高亮与点击定位） */
function groupByPara(text: string): { start: number; sentences: { text: string }[] }[] {
  const groups: { start: number; sentences: { text: string }[] }[] = []
  let cursor = 0
  let cur: { start: number; sentences: { text: string }[] } | null = null
  let curPara = -1
  for (const s of splitSentencesRich(text)) {
    if (!cur || s.para !== curPara) {
      cur = { start: cursor, sentences: [] }
      groups.push(cur)
      curPara = s.para
    }
    cur.sentences.push({ text: s.text })
    cursor++
  }
  return groups
}

export default function Reader() {
  const { bookId = '' } = useParams()
  const { settings, update } = useSettings()
  // undefined = 查询中；null = 书不存在（已被删除）
  const book = useLiveQuery(async () => (await repository.getBook(bookId)) ?? null, [bookId])
  const progress = useLiveQuery(() => repository.getProgress(bookId), [bookId])
  const total = book?.totalChunks ?? 0

  const [chunks, setChunks] = useState<Map<number, string>>(new Map())
  const [seq, setSeq] = useState(0)
  const [sentIdx, setSentIdx] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [paused, setPaused] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [voiceOpen, setVoiceOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [jumpOpen, setJumpOpen] = useState(false)
  /** 进度初始化完成标志：可见窗口必须等它，否则会在进度加载前用第 0 块抢先初始化（进书停在第一页的根因） */
  const [initialized, setInitialized] = useState(false)
  /** 搜索命中后短暂高亮定位的句子（结构化定位，不依赖文字比对——兼容字符书的匹配文字和渲染文本不一致） */
  const [flashSent, setFlashSent] = useState<{ seq: number; idx: number } | null>(null)
  const flashSentRef = useRef<{ seq: number; idx: number } | null>(null)
  const [vis, setVis] = useState<{ start: number; end: number } | null>(null)
  /** 系统音色列表（播放栏展示当前音色名用；iOS 上会异步到达） */
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([])
  /** 本书语言：优先取 BookMeta.language，历史书籍用正文检测后补写；绑定 bookId 防止切书瞬间沿用上一本的语言 */
  const [bookLangState, setBookLangState] = useState<{ bookId: string; lang: TextLang } | null>(null)
  const bookLang = bookLangState?.bookId === bookId ? bookLangState.lang : null
  /** 当前朗读句是否在视口内：用于在用户滚离后显示"回到当前句"锚点 */
  const [atCurrent, setAtCurrent] = useState(true)

  const seqRef = useRef(0)
  const sentIdxRef = useRef(0)
  const chunksRef = useRef(new Map<number, string>())
  const initedFor = useRef<string | null>(null)
  const lastSaveRef = useRef(0)
  const playingRef = useRef(false)
  playingRef.current = playing
  /**
   * 朗读会话是否仍然有效：只有用户点击播放/点击句子后置 true；
   * 停止、离开页面、切后台、换书后置 false，所有异步续读（块懒加载、块结束接续）都必须先校验，
   * 避免 stop 之后又被排队中的续读任务重新开口。
   */
  const sessionLiveRef = useRef(false)
  /** 会话代际：每次停止/换书/离开页面都 +1，异步续读要校验代际，避免上一会话的任务在新会话里开口 */
  const sessionGenRef = useRef(0)
  /** 朗读推进时是否自动跟随滚动；用户手动滚动/滑动后关闭，点"当前句"或重新点播放时恢复 */
  const followRef = useRef(true)
  /** 正文容器：只在正文上的滚动手势才算"用户手动离开" */
  const mainRef = useRef<HTMLElement>(null)
  /** 进度是否已恢复完成：未完成前任何写入/滚动都不应落盘，否则会覆盖真实断点 */
  const initializedRef = useRef(false)
  const bookIdRef = useRef(bookId)
  bookIdRef.current = bookId
  /** 视口顶部可见的块序号：头部页码显示它，滚动/翻页后都与所见内容对应 */
  const topSeqRef = useRef(0)
  const [topSeq, setTopSeq] = useState(0)
  /** 视口顶部可见块里的第一句（纯阅读时的断点粒度） */
  const topSentRef = useRef(0)
  /** 断点恢复/跳块待执行的滚动目标：目标块渲染出来后再滚，且只滚一次 */
  const resumeTargetRef = useRef<{ seq: number; idx: number } | null>(null)
  /** 已执行过"按书籍语言自动选音色"的书：避免音色列表异步到达/设置变化时反复覆盖用户手动选择 */
  const voiceInitForRef = useRef<string | null>(null)
  /** 已补检测语言的书：避免重复写库 */
  const langDetectedForRef = useRef<string | null>(null)
  /**
   * 程序化滚动（断点恢复/跳转/找回当前句）期间暂停断点采样：
   * 内联 span 跨行时按几何取"顶部句"会取到上一句（甚至更早），
   * 若此时把采样结果落盘，反复进出会被这个更早的句子反复往回带。
   */
  const scrollSkipRef = useRef(false)
  const scrollSkipTimerRef = useRef(0)
  const suppressScrollSampling = () => {
    scrollSkipRef.current = true
    window.clearTimeout(scrollSkipTimerRef.current)
    scrollSkipTimerRef.current = window.setTimeout(() => {
      scrollSkipRef.current = false
    }, 800)
  }

  // 换书/首次进入时清空阅读视图，等进度初始化后再定位（同一组件实例在 /book/:id 间切换不会重挂载）
  useEffect(() => {
    // 换书必须停掉上一本书的朗读；这里不做 flush（closure 已指向新 bookId），离开页面的 flush 由卸载逻辑负责
    sessionLiveRef.current = false
    sessionGenRef.current += 1
    followRef.current = true
    speechEngine.stop()
    setPlaying(false)
    setPaused(false)
    setBookLangState(null)
    voiceInitForRef.current = null
    langDetectedForRef.current = null
    seqRef.current = 0
    topSeqRef.current = 0
    topSentRef.current = 0
    sentIdxRef.current = 0
    chunksRef.current = new Map()
    resumeTargetRef.current = null
    initializedRef.current = false
    lastSaveRef.current = 0
    setSeq(0)
    setTopSeq(0)
    setSentIdx(0)
    setChunks(new Map())
    setVis(null)
    setInitialized(false)
  }, [bookId])

  // 进度初始化（每本书只做一次）
  useEffect(() => {
    if (!bookId || initedFor.current === bookId || progress === undefined || !total) return
    initedFor.current = bookId
    // 退出→立即重进时，上一次 flush 可能还没落盘；等它完成后再读库，避免恢复成旧位置
    void pendingProgressWrite
      .then(() => repository.getProgress(bookId))
      .catch(() => progress)
      .then(latest => {
        if (bookIdRef.current !== bookId) return
        const saved = latest ?? progress
        const pos = resolveResumePosition(saved?.bookId === bookId ? saved : null, total)
        seqRef.current = pos.seq
        setSeq(pos.seq)
        topSeqRef.current = pos.seq
        setTopSeq(pos.seq)
        topSentRef.current = pos.sentenceIndex
        sentIdxRef.current = pos.sentenceIndex
        setSentIdx(pos.sentenceIndex)
        // 恢复要落到具体句子（而不只是块首），等目标块渲染后由滚动定位效果执行
        resumeTargetRef.current = { seq: pos.seq, idx: pos.sentenceIndex }
        initializedRef.current = true
        setInitialized(true)
      })
  }, [bookId, progress, total])

  const ensureChunks = useCallback(
    async (from: number, count: number) => {
      if (!bookId || !total) return
      const lo = Math.max(0, from)
      const hi = Math.min(total, from + count)
      let need = false
      for (let s = lo; s < hi; s++) {
        if (!chunksRef.current.has(s)) {
          need = true
          break
        }
      }
      if (!need) return
      const rows = await repository.getChunks(bookId, lo, hi - lo)
      const next = new Map(chunksRef.current)
      for (const r of rows) next.set(r.seq, r.text)
      chunksRef.current = next
      setChunks(next)
    },
    [bookId, total],
  )

  // 可见窗口初始化（进度定位后）
  useEffect(() => {
    if (!total || vis || !initialized) return
    setVis({ start: Math.max(0, seq - BEFORE), end: Math.min(total, seq + AFTER + 1) })
  }, [total, seq, vis, initialized])

  useEffect(() => {
    if (vis) ensureChunks(vis.start, vis.end - vis.start)
  }, [vis, ensureChunks])

  const saveProgressNow = useCallback(
    (s = seqRef.current, i = sentIdxRef.current) => {
      if (!bookId) return
      lastSaveRef.current = Date.now()
      const p = { bookId, chunkSeq: s, sentenceIndex: i, updatedAt: Date.now() }
      // 串行落盘：并发 put 不乱序，重进时的初始化也能等到最近一次写入完成
      pendingProgressWrite = pendingProgressWrite
        .then(() => repository.saveProgress(p))
        .catch(() => {})
    },
    [bookId],
  )

  const saveProgressSoon = useCallback(
    (s: number, i: number) => {
      if (Date.now() - lastSaveRef.current < 2000) return
      saveProgressNow(s, i)
    },
    [saveProgressNow],
  )

  const speakOpts = useMemo(
    () => ({ rate: settings.rate, voiceURI: settings.voiceURI }),
    [settings.rate, settings.voiceURI],
  )
  useEffect(() => {
    speechEngine.setOptions(speakOpts)
  }, [speakOpts])

  useEffect(() => {
    const synth = window.speechSynthesis
    if (!synth) return
    const refresh = () => setVoices(speechEngine.getVoices())
    refresh()
    synth.addEventListener('voiceschanged', refresh)
    return () => synth.removeEventListener('voiceschanged', refresh)
  }, [])

  const voiceName = useMemo(
    () => voices.find(v => v.voiceURI === settings.voiceURI)?.name ?? null,
    [voices, settings.voiceURI],
  )

  // 书籍语言：导入时已写入的直接用；历史书籍用已加载正文检测一次并回写
  useEffect(() => {
    if (!book) return
    const setLang = (lang: TextLang) =>
      setBookLangState(prev =>
        prev?.bookId === bookId && prev.lang === lang ? prev : { bookId, lang },
      )
    if (book.language) {
      setLang(book.language)
      return
    }
    if (langDetectedForRef.current === bookId) return
    const sample = [...chunks.entries()]
      .sort((a, b) => a[0] - b[0])
      .slice(0, 3)
      .map(([, text]) => text)
      .join('\n')
    if (!sample) return
    const detected = detectBookLanguage(sample)
    if (!detected) return
    langDetectedForRef.current = bookId
    setLang(detected)
    void repository.updateBookLanguage(bookId, detected)
  }, [book, bookId, chunks])

  // 打开书籍时按语言决定音色：本书手动选择优先；切到不同语言的书自动换新语言默认音色；
  // 该书语言没有音色时回退通用音色并提示，避免出现"列表为空/没有选中音色"
  useEffect(() => {
    if (!bookLang || !book || voices.length === 0) return
    if (voiceInitForRef.current === bookId) return
    voiceInitForRef.current = bookId
    const { voice, fallback } = resolveBookVoice(
      bookLang,
      book.voiceURI,
      voices,
      settings.voiceURI,
    )
    if (voice && voice.voiceURI !== settings.voiceURI) {
      update({ voiceURI: voice.voiceURI })
    }
    if (fallback) {
      Toast.show({
        content: `系统没有可用的${languageLabel(bookLang)}音色，已回退到通用音色`,
        duration: 3000,
      })
    }
  }, [book, bookId, bookLang, voices, settings.voiceURI, update])

  // 用户手动选音色：写入本书（下次打开保留），同时立即生效到全局引擎设置
  const handleVoiceSelect = (voiceURI: string) => {
    update({ voiceURI })
    void repository.updateBookVoice(bookId, voiceURI)
  }

  const playFromRef = useRef<(s: number, i: number, fromGesture?: boolean) => void>(() => {})
  playFromRef.current = (s: number, startIdx: number, fromGesture = false) => {
    // 会话已被 stop / 离开页面 / 换书终止：异步续读任务不得重新开口
    if (!sessionLiveRef.current) return
    const text = chunksRef.current.get(s)
    if (text === undefined) return
    const sentences = splitSentencesRich(text).map(x => x.text)
    if (!sentences.length) return
    const idx = Math.min(Math.max(0, startIdx), sentences.length - 1)
    speechEngine.setCallbacks({
      onSentenceStart: i => {
        sentIdxRef.current = i
        setSentIdx(i)
        saveProgressSoon(s, i)
      },
      onEngineStall: () => {
        Toast.show({
          content: '系统语音没有响应：请检查静音键和音量；若仍无声，请完全退出浏览器（上滑杀掉）后重新打开本页',
          duration: 4000,
        })
      },
      onChunkEnd: () => {
        const next = s + 1
        if (next >= total) {
          sessionLiveRef.current = false
          setPlaying(false)
          setPaused(false)
          saveProgressNow(Math.max(0, total - 1), 0)
          return
        }
        seqRef.current = next
        setSeq(next)
        sentIdxRef.current = 0
        setSentIdx(0)
        saveProgressNow(next, 0)
        const gen = sessionGenRef.current
        ensureChunks(next, AFTER).then(() => {
          // 等待加载期间可能已 stop/换书：代际失效就不要再开口
          if (gen === sessionGenRef.current && sessionLiveRef.current) playFromRef.current(next, 0)
        })
      },
    })
    speechEngine.speakChunk(sentences, speakOpts, idx, fromGesture)
  }

  const togglePlay = () => {
    if (!window.speechSynthesis) {
      window.alert('当前浏览器不支持语音合成')
      return
    }
    if (playing && !paused) {
      speechEngine.pause()
      setPaused(true)
      saveProgressNow()
    } else if (playing && paused) {
      sessionLiveRef.current = true
      sessionGenRef.current += 1
      // 用户点继续：恢复自动跟随
      followRef.current = true
      // 引擎可能在试听等操作中被取消出 paused 态，此时直接重读当前句
      if (speechEngine.isPaused()) {
        speechEngine.resume()
      } else {
        playFromRef.current(seqRef.current, sentIdxRef.current)
      }
      setPaused(false)
    } else {
      // iOS 偶发：页面多次重载后系统音色列表被清空，朗读会静默失败
      if (window.speechSynthesis.getVoices().length === 0) {
        Toast.show({
          content: '系统音色列表为空：请完全退出浏览器（上滑杀掉）后重新打开本页',
          duration: 3500,
        })
      }
      setPlaying(true)
      setPaused(false)
      sessionLiveRef.current = true
      // 用户重新点播放：作废可能还在等待懒加载的上一段续读，避免它抢先开读
      sessionGenRef.current += 1
      followRef.current = true
      playFromRef.current(seqRef.current, sentIdxRef.current, true)
    }
  }

  /**
   * 统一的跳块入口，按来源区分朗读语义：
   * - arrow（翻页箭头）：正在朗读时沿用当前会话继续读
   * - page（页码跳转）/ search（搜索命中）：强制停止朗读，只把视图定位到目标并落盘该位置
   */
  const jumpTo = (target: number, source: JumpSource, targetSentIdx = 0) => {
    if (!total) return
    const next = Math.min(Math.max(target, 0), total - 1)
    const wasActive = playing
    // 三种来源都先停引擎；是否续读由来源决定，避免依赖默认参数
    speechEngine.stop()
    sessionLiveRef.current = false
    sessionGenRef.current += 1
    if (wasActive) {
      setPlaying(false)
      setPaused(false)
    }
    seqRef.current = next
    setSeq(next)
    topSeqRef.current = next
    setTopSeq(next)
    topSentRef.current = targetSentIdx
    sentIdxRef.current = targetSentIdx
    setSentIdx(targetSentIdx)
    setVis({ start: Math.max(0, next - BEFORE), end: Math.min(total, next + AFTER + 1) })
    // 句序号必须一起落盘：搜索命中/指定句跳转后按 0 保存会丢掉具体句子
    saveProgressNow(next, targetSentIdx)
    if (shouldContinueReading(source, wasActive)) {
      followRef.current = true
      sessionLiveRef.current = true
      setPlaying(true)
      setPaused(false)
      const gen = sessionGenRef.current
      ensureChunks(next, AFTER).then(() => {
        if (gen === sessionGenRef.current) playFromRef.current(next, 0)
      })
    } else {
      resumeTargetRef.current = { seq: next, idx: targetSentIdx }
    }
  }
  // 箭头翻页基于"正在看的块"，与头部页码一致；朗读中继续当前会话
  const jump = (d: number) => jumpTo(topSeqRef.current + d, 'arrow')

  // 视口顶部可见块/句跟踪：头部页码跟随用户所见；纯阅读/滚动时把所见句作为断点
  useEffect(() => {
    let raf = 0
    const onScroll = () => {
      if (raf) return
      raf = window.requestAnimationFrame(() => {
        raf = 0
        if (scrollSkipRef.current) return
        const line = 64
        const sections = [...document.querySelectorAll<HTMLElement>('[id^="chunk-"]')]
          .map(el => Number(el.id.slice(6)))
          .sort((a, b) => a - b)
        let top = topSeqRef.current
        for (const s of sections) {
          const el = document.getElementById(`chunk-${s}`)
          if (el && el.getBoundingClientRect().bottom > line + 8) {
            top = s
            break
          }
        }
        let topIdx = 0
        const section = document.getElementById(`chunk-${top}`)
        if (section) {
          for (const el of section.querySelectorAll<HTMLElement>('[id^="sent-"]')) {
            if (el.getBoundingClientRect().bottom > line + 8) {
              topIdx = Number(el.id.slice(`sent-${top}-`.length)) || 0
              break
            }
          }
        }
        const topChanged = top !== topSeqRef.current
        if (topChanged) {
          topSeqRef.current = top
          setTopSeq(top)
        }
        if (topChanged || topIdx !== topSentRef.current) {
          topSentRef.current = topIdx
          // 朗读中由引擎逐句推进写入，滚动不覆盖；进度未恢复前也不能写，否则会把断点覆盖成 0
          if (!playingRef.current && initializedRef.current) saveProgressSoon(top, topIdx)
        }
      })
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      if (raf) window.cancelAnimationFrame(raf)
    }
  }, [saveProgressSoon])

  const runSearch = useCallback(
    async (query: string): Promise<SearchHit[]> => {
      if (!bookId || !total || !query.trim()) return []
      const chunks = await repository.getChunks(bookId, 0, total)
      return searchChunks(chunks, query)
    },
    [bookId, total],
  )

  const handleSearchSelect = async (hit: SearchHit) => {
    setSearchOpen(false)
    // 先确保目标块已加载，再按段落序号算出命中段落首句的全局句序号
    await ensureChunks(hit.seq, 1)
    const text = chunksRef.current.get(hit.seq) ?? ''
    let sentIdx = 0
    const paras = text.split('\n')
    for (let p = 0; p < hit.paraIdx && p < paras.length; p++) {
      sentIdx += splitSentences(paras[p]).length
    }
    sentIdx += hit.sentInPara
    // 同步写入 ref：滚动定位效果必须在 commit 时就能读到锚点（经 effect 同步会晚一拍，落到块顶滚动分支）
    const target = { seq: hit.seq, idx: sentIdx }
    flashSentRef.current = target
    setFlashSent(target)
    jumpTo(hit.seq, 'search', sentIdx)
  }

  useEffect(() => {
    if (!flashSent) return
    const t = window.setTimeout(() => {
      setFlashSent(null)
      flashSentRef.current = null
    }, 2500)
    return () => window.clearTimeout(t)
  }, [flashSent])

  // 点击任意句子：定位到该句并立即从此处开始朗读
  const handlePlayFrom = (s: number, idx: number) => {
    if (!total || !chunksRef.current.has(s)) return
    seqRef.current = s
    setSeq(s)
    topSeqRef.current = s
    setTopSeq(s)
    topSentRef.current = idx
    sentIdxRef.current = idx
    setSentIdx(idx)
    setPlaying(true)
    setPaused(false)
    setVis(v =>
      v && (s < v.start || s >= v.end)
        ? { start: Math.max(0, s - BEFORE), end: Math.min(total, s + AFTER + 1) }
        : v,
    )
    saveProgressNow(s, idx)
    // 必须走 playFromRef：它负责注册引擎回调（逐句高亮/滚动、块结束续读），直接 speakChunk 会让界面完全不知道朗读进度
    sessionLiveRef.current = true
    // 用户点句开读优先于任何排队中的续读
    sessionGenRef.current += 1
    followRef.current = true
    playFromRef.current(s, idx, true)
  }

  // 快速回到当前朗读句：把所在块拉回渲染窗口并滚动居中，短暂高亮便于确认
  const locateCurrent = () => {
    if (!total) return
    // 用户主动找回朗读位置：恢复自动跟随
    followRef.current = true
    const s = seqRef.current
    const i = sentIdxRef.current
    if (!chunksRef.current.has(s)) ensureChunks(s, 1)
    setVis(v =>
      v && s >= v.start && s < v.end
        ? v
        : { start: Math.max(0, s - BEFORE), end: Math.min(total, s + AFTER + 1) },
    )
    const target = { seq: s, idx: i }
    flashSentRef.current = target
    setFlashSent(target)
    // 回到朗读位置时断点仍应停在当前句，而不是滚动后视口顶部的句子
    topSeqRef.current = s
    topSentRef.current = i
    setTopSeq(s)
    suppressScrollSampling()
    // 目标块可能尚未渲染，短暂重试直到出现
    let tries = 0
    const tryScroll = () => {
      const el = document.getElementById(`sent-${s}-${i}`)
      if (el) {
        el.scrollIntoView({ block: 'center' })
        return
      }
      if (++tries < 8) window.setTimeout(tryScroll, 60)
    }
    tryScroll()
  }

  // 离开阅读页 / 切后台：先落盘，再同步且幂等地停止朗读与所有待续读任务
  const flushPositionRef = useRef<() => void>(() => {})
  flushPositionRef.current = () => {
    // 进度还没恢复完成时不能写，会把真实断点覆盖成 0
    if (!initializedRef.current) return
    // 朗读中且视图仍在跟随朗读句：以朗读句为准；已手动滚离或已停止朗读：写用户当前可见位置
    if (playingRef.current && followRef.current) saveProgressNow(seqRef.current, sentIdxRef.current)
    else saveProgressNow(topSeqRef.current, topSentRef.current)
  }
  const stopReadingRef = useRef<() => void>(() => {})
  stopReadingRef.current = () => {
    // 先置 false：引擎 stop 会让排队中的续读（块懒加载/块结束接续）失效，避免 stop 后又被重新开读
    sessionLiveRef.current = false
    sessionGenRef.current += 1
    flushPositionRef.current()
    speechEngine.stop()
    setPlaying(false)
    setPaused(false)
  }
  useEffect(() => {
    const stopReading = () => stopReadingRef.current()
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') stopReading()
    }
    window.addEventListener('pagehide', stopReading)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('pagehide', stopReading)
      document.removeEventListener('visibilitychange', onVisibility)
      // 返回书架/切到其他路由会卸载本组件；这里必须同步取消 speechSynthesis 队列
      stopReading()
    }
  }, [])

  // 朗读时保持屏幕常亮（iOS 锁屏会停朗读的缓解手段）
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null
    let cancelled = false
    const nav = navigator as { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } }
    if (playing && !paused && nav.wakeLock) {
      nav.wakeLock
        .request('screen')
        .then(l => {
          if (cancelled) l.release().catch(() => {})
          else lock = l
        })
        .catch(() => {})
    }
    return () => {
      cancelled = true
      lock?.release().catch(() => {})
    }
  }, [playing, paused])

  // 断点恢复/跳块定位：等目标块渲染出来再滚到目标句（无句序号则滚块顶），只执行一次。
  // 之前这里依赖整个 chunks，追加加载块时会把视图反复拽回 seq 所在块，导致"退出位置对不上"。
  useEffect(() => {
    if (playingRef.current) {
      // 开始朗读后由引擎的高亮跟随负责滚动，清掉待执行的定位避免停下时被拽回
      resumeTargetRef.current = null
      return
    }
    const t = resumeTargetRef.current
    if (!t || t.seq !== seq || !chunks.has(t.seq)) return
    resumeTargetRef.current = null
    // 定位是程序化滚动，不能把途中采样到的"顶部句"当成用户断点
    suppressScrollSampling()
    const sentEl = t.idx > 0 ? document.getElementById(`sent-${t.seq}-${t.idx}`) : null
    if (sentEl) {
      // 把恢复句放到吸顶头部下方（而不是居中），这样"视口顶部句"与断点一致，反复进出不会向后漂移
      const y = window.scrollY + sentEl.getBoundingClientRect().top - 64
      window.scrollTo(0, Math.max(0, y))
    } else {
      document.getElementById(`chunk-${t.seq}`)?.scrollIntoView({ block: 'start' })
    }
  }, [seq, chunks, vis, playing])

  // 搜索命中定位单独触发：命中可能在当前块内（seq 不变），上面的效果不会重跑
  useEffect(() => {
    if (!flashSent || playingRef.current) return
    document
      .getElementById(`sent-${flashSent.seq}-${flashSent.idx}`)
      ?.scrollIntoView({ block: 'center' })
  }, [flashSent, chunks])

  // 播放时保证当前块之后的块已进入可见窗口（否则读到窗口末尾后界面不再跟随）
  useEffect(() => {
    setVis(v =>
      v && seq >= v.end - 1 ? { ...v, end: Math.min(total, seq + AFTER + 1) } : v,
    )
  }, [seq, total])

  // 用户手动滚动/滑动正文：朗读继续，但关闭自动跟随，避免朗读推进把用户滚走的位置硬拽回来
  useEffect(() => {
    const off = (e: Event) => {
      const t = e.target
      if (t instanceof Node && mainRef.current?.contains(t)) {
        followRef.current = false
        // 用户真正开始滚动：程序化定位的采样抑制到此结束
        scrollSkipRef.current = false
      }
    }
    window.addEventListener('wheel', off, { passive: true })
    window.addEventListener('touchmove', off, { passive: true })
    return () => {
      window.removeEventListener('wheel', off)
      window.removeEventListener('touchmove', off)
    }
  }, [])

  // 播放时当前句居中跟随。跨块推进时目标句常晚于 seq 就绪（等 vis 扩展/chunks 加载后才有 DOM），
  // 因此依赖 chunks 和 vis 变化重试，并加 400ms 延迟兜底；瞬时滚动（iOS 的 smooth scrollIntoView 间歇失效）
  useEffect(() => {
    // 用户手动滚走后不再跟随：朗读继续出声，但视图留在用户停下的位置
    if (!playing || paused || !followRef.current) return
    const el = () => document.getElementById(`sent-${seq}-${sentIdx}`)
    el()?.scrollIntoView({ block: 'center' })
    const t = window.setTimeout(() => {
      if (playingRef.current && followRef.current) el()?.scrollIntoView({ block: 'center' })
    }, 400)
    return () => window.clearTimeout(t)
  }, [seq, sentIdx, playing, paused, chunks, vis])

  // 当前朗读句是否在视口内：用户滚离后显示"回到当前句"锚点；跨块渲染空窗延迟确认，避免按钮闪烁
  useEffect(() => {
    if (!initialized) {
      setAtCurrent(true)
      return
    }
    let raf = 0
    let showTimer = 0
    const measure = () => {
      raf = 0
      const el = document.getElementById(`sent-${seqRef.current}-${sentIdxRef.current}`)
      if (!el) {
        if (!showTimer) showTimer = window.setTimeout(() => setAtCurrent(false), 250)
        return
      }
      if (showTimer) {
        window.clearTimeout(showTimer)
        showTimer = 0
      }
      const r = el.getBoundingClientRect()
      setAtCurrent(r.bottom > 56 && r.top < window.innerHeight - 96)
    }
    const schedule = () => {
      if (!raf) raf = window.requestAnimationFrame(measure)
    }
    measure()
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule)
    return () => {
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
      if (raf) window.cancelAnimationFrame(raf)
      if (showTimer) window.clearTimeout(showTimer)
    }
  }, [initialized, seq, sentIdx, chunks, vis])

  // 向下滚动到底部哨兵时追加渲染
  const bottomRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = bottomRef.current
    if (!el || !total) return
    const io = new IntersectionObserver(
      entries => {
        if (entries.some(e => e.isIntersecting)) {
          setVis(v => (v && v.end < total ? { ...v, end: Math.min(total, v.end + 4) } : v))
        }
      },
      { rootMargin: '600px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [total])

  const loadEarlier = () => {
    setVis(v => (v ? { ...v, start: Math.max(0, v.start - BEFORE - 3) } : v))
  }
  // 上方插入内容后保持视口位置
  const anchorRef = useRef({ start: -1, height: 0 })
  useLayoutEffect(() => {
    if (!vis) return
    if (anchorRef.current.start > vis.start) {
      const h = document.documentElement.scrollHeight
      window.scrollBy(0, h - anchorRef.current.height)
    }
    anchorRef.current = { start: vis.start, height: document.documentElement.scrollHeight }
  }, [vis?.start])

  const visibleSeqs = useMemo(() => {
    if (!vis) return []
    const arr: number[] = []
    for (let s = vis.start; s < vis.end; s++) if (chunks.has(s)) arr.push(s)
    return arr
  }, [vis, chunks])

  if (book === undefined) {
    return (
      <div className="flex min-h-dvh items-center justify-center text-sm text-slate-400">
        加载中…
      </div>
    )
  }

  if (book === null) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4">
        <p className="text-sm text-slate-400">这本书不存在或已被删除</p>
        <Link
          to="/"
          className="rounded-full bg-indigo-600 px-5 py-2 text-sm text-white active:scale-95"
        >
          返回书架
        </Link>
      </div>
    )
  }

  return (
    <div className="min-h-dvh pb-36">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-slate-100/85 backdrop-blur dark:border-slate-800 dark:bg-slate-950/85">
        <div className="mx-auto flex h-12 max-w-prose items-center px-3">
          <div className="flex flex-1 items-center">
            <Link
              to="/"
              aria-label="返回书架"
              className="flex h-9 w-9 items-center justify-center rounded-full active:bg-slate-200 dark:active:bg-slate-800"
            >
              <ArrowLeft size={22} />
            </Link>
          </div>
          <div className="flex items-center rounded-full bg-slate-200/80 dark:bg-slate-800">
            <button
              onClick={() => jump(-1)}
              disabled={topSeq <= 0}
              aria-label="上一段"
              className="flex h-8 w-8 items-center justify-center rounded-full active:bg-slate-300 disabled:opacity-30 dark:active:bg-slate-700"
            >
              <ChevronLeft size={18} />
            </button>
            <button
              onClick={() => setJumpOpen(true)}
              aria-label="跳转到指定块"
              className="flex h-8 min-w-20 items-center justify-center rounded-full px-2 text-lg font-semibold tabular-nums text-slate-600 transition-colors active:bg-slate-300 dark:text-slate-300 dark:active:bg-slate-700"
            >
              {topSeq + 1} / {total}
            </button>
            <button
              onClick={() => jump(1)}
              disabled={topSeq >= total - 1}
              aria-label="下一段"
              className="flex h-8 w-8 items-center justify-center rounded-full active:bg-slate-300 disabled:opacity-30 dark:active:bg-slate-700"
            >
              <ChevronRight size={18} />
            </button>
          </div>
          <div className="flex flex-1 items-center justify-end gap-1">
            <button
              onClick={() => setSearchOpen(true)}
              aria-label="全文搜索"
              className="flex h-9 w-9 items-center justify-center rounded-full active:bg-slate-200 dark:active:bg-slate-800"
            >
              <Search size={20} />
            </button>
            {book.lowQuality && (
              <TriangleAlert size={16} className="text-amber-500" aria-label="解析质量可能不佳" />
            )}
          </div>
        </div>
        <div className="h-0.5 bg-slate-200 dark:bg-slate-800">
          <div
            className="h-full bg-indigo-600 transition-all"
            style={{ width: `${total ? ((topSeq + 1) / total) * 100 : 0}%` }}
          />
        </div>
      </header>

      <main ref={mainRef} className="reader-text mx-auto max-w-prose px-5 pt-4">
        {vis && vis.start > 0 && (
          <button
            onClick={loadEarlier}
            className="mx-auto mb-6 flex items-center gap-1 rounded-full bg-slate-200 px-4 py-1.5 text-xs dark:bg-slate-800"
          >
            <ChevronUp size={14} />
            载入上文
          </button>
        )}
        {visibleSeqs.map(s => {
          const paras = groupByPara(chunks.get(s) ?? '')
          return (
            <section key={s} id={`chunk-${s}`} className="mb-6">
              {paras.map((para, pi) => (
                <p key={pi} className="mb-4 [text-indent:2em]">
                  {para.sentences.map((sen, si) => {
                    const idx = para.start + si
                    // 当前朗读句始终高亮（播放、暂停、重进书本时都能看出读到哪一句）
                    const active = s === seq && idx === sentIdx
                    const flashing = flashSent !== null && flashSent.seq === s && flashSent.idx === idx
                    return (
                      <span
                        key={idx}
                        id={`sent-${s}-${idx}`}
                        onClick={() => handlePlayFrom(s, idx)}
                        className={`cursor-pointer rounded-sm transition-colors ${
                          active
                            ? 'bg-indigo-200 dark:bg-indigo-500/30'
                            : flashing
                              ? 'bg-amber-200/80 dark:bg-amber-500/30'
                              : 'hover:bg-slate-200/70 active:bg-slate-300/70 dark:hover:bg-slate-700/40 dark:active:bg-slate-600/40'
                        }`}
                      >
                        {sen.text}
                      </span>
                    )
                  })}
                </p>
              ))}
            </section>
          )
        })}
        <div ref={bottomRef} />
        {vis && vis.end >= total && total > 0 && (
          <p className="mt-10 text-center text-sm text-slate-400">—— 全书完 ——</p>
        )}
      </main>

      {!atCurrent && total > 0 && (
        <button
          onClick={locateCurrent}
          aria-label="定位到当前句"
          className="fixed right-4 bottom-[calc(6rem+env(safe-area-inset-bottom))] z-20 flex h-10 items-center gap-1.5 rounded-full bg-indigo-600/95 px-3.5 text-xs font-medium text-white shadow-lg shadow-indigo-600/30 backdrop-blur active:scale-95"
        >
          <LocateFixed size={16} />
          当前句
        </button>
      )}

      <PlayerBar
        playing={playing}
        paused={paused}
        voiceName={voiceName}
        onToggle={togglePlay}
        onVoice={() => setVoiceOpen(true)}
        onSettings={() => setSettingsOpen(true)}
      />
      <SettingsSheet open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <VoiceSheet
        open={voiceOpen}
        onClose={() => setVoiceOpen(false)}
        voices={voices}
        lang={bookLang}
        onSelect={handleVoiceSelect}
      />
      <SearchSheet
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        onSearch={runSearch}
        onSelect={handleSearchSelect}
      />
      <PageJumpSheet
        open={jumpOpen}
        total={total}
        current={topSeq}
        onClose={() => setJumpOpen(false)}
        onJump={page => jumpTo(page, 'page')}
      />
    </div>
  )
}
