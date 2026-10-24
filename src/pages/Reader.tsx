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
  Search,
  TriangleAlert,
} from 'lucide-react'
import { repository } from '../adapters/indexeddb'
import { speechEngine } from '../adapters/webSpeech'
import { splitSentences, splitSentencesRich } from '../lib/sentences'
import { searchChunks, type SearchHit } from '../lib/search'
import { useSettings } from '../store/settings'
import PlayerBar from '../components/PlayerBar'
import SettingsSheet from '../components/SettingsSheet'
import SearchSheet from '../components/SearchSheet'
import PageJumpSheet from '../components/PageJumpSheet'

const BEFORE = 2
const AFTER = 5

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
  const [searchOpen, setSearchOpen] = useState(false)
  const [jumpOpen, setJumpOpen] = useState(false)
  /** 进度初始化完成标志：可见窗口必须等它，否则会在进度加载前用第 0 块抢先初始化（进书停在第一页的根因） */
  const [initialized, setInitialized] = useState(false)
  /** 搜索命中后短暂高亮定位的句子（结构化定位，不依赖文字比对——兼容字符书的匹配文字和渲染文本不一致） */
  const [flashSent, setFlashSent] = useState<{ seq: number; idx: number } | null>(null)
  const flashSentRef = useRef<{ seq: number; idx: number } | null>(null)
  const [vis, setVis] = useState<{ start: number; end: number } | null>(null)

  const seqRef = useRef(0)
  const sentIdxRef = useRef(0)
  const chunksRef = useRef(new Map<number, string>())
  const initedFor = useRef<string | null>(null)
  const lastSaveRef = useRef(0)
  const playingRef = useRef(false)
  playingRef.current = playing
  /** 视口顶部可见的块序号：头部页码显示它，滚动/翻页后都与所见内容对应 */
  const topSeqRef = useRef(0)
  const [topSeq, setTopSeq] = useState(0)

  // 换书/首次进入时清空阅读视图，等进度初始化后再定位（同一组件实例在 /book/:id 间切换不会重挂载）
  useEffect(() => {
    seqRef.current = 0
    topSeqRef.current = 0
    sentIdxRef.current = 0
    chunksRef.current = new Map()
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
    const start = Math.min(progress?.chunkSeq ?? 0, total - 1)
    const si = progress?.sentenceIndex ?? 0
    seqRef.current = start
    setSeq(start)
    topSeqRef.current = start
    setTopSeq(start)
    sentIdxRef.current = si
    setSentIdx(si)
    setInitialized(true)
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
      repository.saveProgress({ bookId, chunkSeq: s, sentenceIndex: i, updatedAt: Date.now() })
      lastSaveRef.current = Date.now()
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

  const playFromRef = useRef<(s: number, i: number, fromGesture?: boolean) => void>(() => {})
  playFromRef.current = (s: number, startIdx: number, fromGesture = false) => {
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
        ensureChunks(next, AFTER).then(() => playFromRef.current(next, 0))
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
      playFromRef.current(seqRef.current, sentIdxRef.current, true)
    }
  }

  const jumpTo = (target: number, continuePlayback = true, targetSentIdx = 0) => {
    if (!total) return
    const next = Math.min(Math.max(target, 0), total - 1)
    const wasActive = playing
    speechEngine.stop()
    if (wasActive) {
      setPlaying(false)
      setPaused(false)
    }
    seqRef.current = next
    setSeq(next)
    topSeqRef.current = next
    setTopSeq(next)
    sentIdxRef.current = targetSentIdx
    setSentIdx(targetSentIdx)
    setVis({ start: Math.max(0, next - BEFORE), end: Math.min(total, next + AFTER + 1) })
    saveProgressNow(next, 0)
    if (wasActive && continuePlayback) {
      setPlaying(true)
      setPaused(false)
      ensureChunks(next, AFTER).then(() => playFromRef.current(next, 0))
    }
  }
  // 箭头翻页基于"正在看的块"，与头部页码一致
  const jump = (d: number) => jumpTo(topSeqRef.current + d)

  // 视口顶部可见块跟踪：头部页码跟随用户所见，而不是内部朗读位置
  useEffect(() => {
    let raf = 0
    const onScroll = () => {
      if (raf) return
      raf = window.requestAnimationFrame(() => {
        raf = 0
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
        if (top !== topSeqRef.current) {
          topSeqRef.current = top
          setTopSeq(top)
        }
      })
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      if (raf) window.cancelAnimationFrame(raf)
    }
  }, [])

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
    jumpTo(hit.seq, false, sentIdx)
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
    playFromRef.current(s, idx, true)
  }

  // 离开阅读页停止朗读
  useEffect(() => () => speechEngine.stop(), [])

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

  // 非播放状态下切块时定位视图；有搜索命中锚点时优先滚到命中句（等 chunks 渲染后生效）
  useEffect(() => {
    if (playingRef.current) return
    const f = flashSentRef.current
    if (f && f.seq === seq) {
      document.getElementById(`sent-${seq}-${f.idx}`)?.scrollIntoView({ block: 'center' })
    } else {
      document.getElementById(`chunk-${seq}`)?.scrollIntoView({ block: 'start' })
    }
  }, [seq, chunks])

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

  // 播放时当前句居中跟随。跨块推进时目标句常晚于 seq 就绪（等 vis 扩展/chunks 加载后才有 DOM），
  // 因此依赖 chunks 和 vis 变化重试，并加 400ms 延迟兜底；瞬时滚动（iOS 的 smooth scrollIntoView 间歇失效）
  useEffect(() => {
    if (!playing || paused) return
    const el = () => document.getElementById(`sent-${seq}-${sentIdx}`)
    el()?.scrollIntoView({ block: 'center' })
    const t = window.setTimeout(() => {
      if (playingRef.current) el()?.scrollIntoView({ block: 'center' })
    }, 400)
    return () => window.clearTimeout(t)
  }, [seq, sentIdx, playing, paused, chunks, vis])

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
              className="min-w-14 rounded-full px-1 text-center text-xs tabular-nums text-slate-600 dark:text-slate-300"
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

      <main className="reader-text mx-auto max-w-prose px-5 pt-4">
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
                    const active = s === seq && idx === sentIdx && playing
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

      <PlayerBar
        playing={playing}
        paused={paused}
        rate={settings.rate}
        onToggle={togglePlay}
        onRate={() => {
          const RATES = [0.75, 1, 1.25, 1.5, 2]
          const i = RATES.findIndex(r => Math.abs(r - settings.rate) < 0.01)
          update({ rate: RATES[(i + 1 + RATES.length) % RATES.length] })
        }}
        onSettings={() => setSettingsOpen(true)}
      />
      <SettingsSheet open={settingsOpen} onClose={() => setSettingsOpen(false)} />
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
        onJump={jumpTo}
      />
    </div>
  )
}
