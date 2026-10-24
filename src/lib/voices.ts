/** 应用支持的朗读语言：中文（普通话）、英文、日语（粤语及其他语言的系统音色一律不列出） */
export const LANGUAGE_GROUPS = [
  { rank: 0, label: '中文', test: /^(zh|cmn)/ },
  { rank: 1, label: 'English', test: /^en/ },
  { rank: 2, label: '日本語', test: /^ja/ },
] as const

/** 每个语言组最多展示的音色数 */
export const MAX_VOICES_PER_LANG = 5

/**
 * iOS 系统自带的趣味/特效音色与老式机器人音色（不是正常人的声音），按名称（去括号后缀后）过滤：
 * Albert/Zarvox/Bahh/Bells/Boing/Bubbles/Cellos/organ 等是特效音，Fred/Junior/Kathy/Ralph 是 90 年代机器人音
 */
const NON_HUMAN_VOICES = new Set([
  'albert',
  'bad news',
  'bahh',
  'bells',
  'boing',
  'bubbles',
  'cellos',
  'good news',
  'jester',
  'junior',
  'kathy',
  'organ',
  'ralph',
  'superstar',
  'trinoids',
  'whisper',
  'wobble',
  'zarvox',
  'fred',
  'eddy',
  'ding',
])

/** 高品质音色（iOS 增强版/高级版）名称特征 */
const PREMIUM_RE = /(enhanced|premium|elite|增强|高级)/i

export interface VoiceLike {
  lang: string
  name: string
  voiceURI: string
  localService: boolean
}

function voiceBaseName(name: string): string {
  return name.replace(/\s*[（(].*[)）]\s*$/, '').trim().toLowerCase()
}

/** 过滤出支持语言的"正常人声"音色，按 中文→英文→日语 分组；组内高品质 > 本地 > 名称序，每组最多 5 个 */
export function pickSupportedVoices<T extends VoiceLike>(voices: T[]): T[] {
  const rank = (lang: string): number => {
    const l = lang.toLowerCase()
    const idx = LANGUAGE_GROUPS.findIndex(g => g.test.test(l))
    return idx === -1 ? Number.MAX_SAFE_INTEGER : idx
  }
  const sorted = voices
    .filter(v => !NON_HUMAN_VOICES.has(voiceBaseName(v.name)))
    .map(v => ({ v, r: rank(v.lang) }))
    .filter(x => x.r < LANGUAGE_GROUPS.length)
    .sort(
      (a, b) =>
        a.r - b.r ||
        Number(PREMIUM_RE.test(b.v.name)) - Number(PREMIUM_RE.test(a.v.name)) ||
        Number(b.v.localService) - Number(a.v.localService) ||
        a.v.name.localeCompare(b.v.name),
    )
  const kept: T[] = []
  const counts = new Array<number>(LANGUAGE_GROUPS.length).fill(0)
  for (const { v, r } of sorted) {
    if (counts[r] >= MAX_VOICES_PER_LANG) continue
    counts[r]++
    kept.push(v)
  }
  return kept
}

/** 音色所属语言组的展示名（不支持的返回 null） */
export function voiceGroupLabel(lang: string): string | null {
  const l = lang.toLowerCase()
  return LANGUAGE_GROUPS.find(g => g.test.test(l))?.label ?? null
}

export type TextLang = 'zh' | 'en' | 'ja'

/**
 * 句子语言检测（为 TTS 选音色服务）：
 * 含假名 → 日语；含汉字 → 中文（中文音色读混在句中的英文单词没问题，英文音色读汉字会静音）；纯拉丁 → 英文
 */
export function detectTextLang(text: string): TextLang | null {
  let han = 0
  let latin = 0
  for (const ch of text) {
    const c = ch.codePointAt(0) ?? 0
    if ((c >= 0x3040 && c <= 0x30ff) || (c >= 0x31f0 && c <= 0x31ff)) return 'ja'
    if (c >= 0x3400 && c <= 0x9fff) han++
    else if ((c >= 0x41 && c <= 0x5a) || (c >= 0x61 && c <= 0x7a)) latin++
  }
  if (han > 0) return 'zh'
  if (latin > 0) return 'en'
  return null
}

const DEFAULT_LANG: Record<TextLang, string> = { zh: 'zh-CN', en: 'en-US', ja: 'ja-JP' }

export interface ResolvedVoice {
  voice: VoiceLike | null
  lang: string
}

/**
 * 按句子语言解析朗读音色：选中音色语言匹配就用它；
 * 不匹配（如英文音色遇到中文句子，会静音）则回退到该语言组里最优的可用音色；
 * 连可用音色都没有时只给 lang 让引擎用系统默认。
 */
export function resolveUtteranceVoice(
  text: string,
  selected: VoiceLike | null | undefined,
  available: VoiceLike[],
): ResolvedVoice {
  const tl = detectTextLang(text) ?? 'zh'
  const group = voiceGroupLabel(DEFAULT_LANG[tl])
  if (selected && voiceGroupLabel(selected.lang) === group) {
    return { voice: selected, lang: selected.lang }
  }
  const fallback = available.find(v => voiceGroupLabel(v.lang) === group) ?? null
  return { voice: fallback, lang: fallback?.lang ?? DEFAULT_LANG[tl] }
}
