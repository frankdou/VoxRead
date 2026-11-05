/** 应用支持的三类朗读语言 */
export type TextLang = 'zh' | 'en' | 'ja'

/** 应用支持的朗读语言：中文（普通话）、英文、日语（粤语及其他语言的系统音色一律不列出） */
export const LANGUAGE_GROUPS = [
  { rank: 0, label: '中文', code: 'zh' as TextLang, test: /^(zh|cmn)/ },
  { rank: 1, label: 'English', code: 'en' as TextLang, test: /^en/ },
  { rank: 2, label: '日本語', code: 'ja' as TextLang, test: /^ja/ },
] as const

/** 每个语言组最多展示的音色数 */
export const MAX_VOICES_PER_LANG = 5

/** 各语言的试听文案：试听强制用点选的音色，文案必须与音色语言一致才能真实试出效果 */
export const VOICE_PREVIEW_TEXT: Record<string, string> = {
  中文: '你好，我是你的专属读书声。翻开一本书，就像推开一扇窗，让故事自己走进来。',
  English: "Hello, I'm your reading voice. Open a book, and let the story carry you away.",
  日本語: 'こんにちは、私があなたの読み上げの声です。物語の世界へご案内します。',
}

/** 音色语言无法归组时的兜底试听文案 */
export const FALLBACK_PREVIEW_TEXT = VOICE_PREVIEW_TEXT['中文']

/**
 * iOS 系统自带的趣味/特效音色与老式机器人音色（不是正常人的声音），按名称（去括号后缀后）过滤：
 * Albert/Zarvox/Bahh/Bells/Boing/Bubbles/Cellos/organ 等是特效音，Fred/Junior/Kathy/Ralph 是 90 年代机器人音；
 * Eddy/Flo/Grandma/Grandpa/Reed/Rocko/Sandy/Shelley 是 iOS 15 起的 "Novelty" 合成音色，发音含糊不清
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
  'ding',
  'eddy',
  'flo',
  'grandma',
  'grandpa',
  'reed',
  'rocko',
  'sandy',
  'shelley',
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

/** 语言 → 展示名（如 zh → 中文） */
export function languageLabel(lang: TextLang): string {
  return LANGUAGE_GROUPS.find(g => g.code === lang)?.label ?? ''
}

/** PDF / 系统语言标签（如 zh-CN、cmn-Hans）→ 应用支持的语言 */
export function langTagToTextLang(tag: string): TextLang | null {
  const t = tag.trim().toLowerCase()
  if (!t) return null
  return LANGUAGE_GROUPS.find(g => g.test.test(t))?.code ?? null
}

/**
 * 书籍语言检测：统计正文中汉字 / 假名 / 拉丁字母的数量，取占优的语言。
 * 日语以假名在 CJK 字符中的占比判定（少量引用的假名不会把中文书误判为日语）；
 * 样本太少（< 20 个有效字符）时返回 null，交给调用方保持现有音色。
 */
export function detectBookLanguage(text: string): TextLang | null {
  let han = 0
  let kana = 0
  let latin = 0
  for (const ch of text) {
    const c = ch.codePointAt(0) ?? 0
    if ((c >= 0x3040 && c <= 0x30ff) || (c >= 0x31f0 && c <= 0x31ff)) kana++
    else if (c >= 0x3400 && c <= 0x9fff) han++
    else if ((c >= 0x41 && c <= 0x5a) || (c >= 0x61 && c <= 0x7a)) latin++
  }
  const total = han + kana + latin
  if (total < 20) return null
  const cjk = han + kana
  if (cjk > 0 && kana >= 10 && kana / cjk >= 0.15) return 'ja'
  if (han >= latin) return han > 0 ? 'zh' : 'en'
  return 'en'
}

/**
 * 语言 ↔ 默认音色的映射：优先选这些系统音色（iOS/macOS 与常见引擎的命名），
 * 都不可用时退回该语言组内排序最优的音色（见 pickSupportedVoices）。
 */
export const DEFAULT_VOICE_NAMES: Record<TextLang, string[]> = {
  zh: ['tingting', '婷婷', 'meijia', '美佳', 'xiaoxiao', '晓晓', 'huihui', '慧慧', 'yaoyao'],
  en: ['samantha', 'daniel', 'karen', 'moira', 'serena', 'aria', 'jenny', 'zoe'],
  ja: ['o-ren', 'oren', 'kyoko', 'otoya', 'hattori', 'nanami'],
}

function normalizeVoiceName(name: string): string {
  return voiceBaseName(name).replace(/[^a-z0-9\u4e00-\u9fff]/g, '')
}

/** 按书籍语言挑默认音色；该语言没有任何可用音色时返回 null（由调用方回退通用音色） */
export function pickDefaultVoiceForLang<T extends VoiceLike>(lang: TextLang, voices: T[]): T | null {
  const label = languageLabel(lang)
  const ofLang = voices.filter(v => voiceGroupLabel(v.lang) === label)
  if (ofLang.length === 0) return null
  for (const preferred of DEFAULT_VOICE_NAMES[lang]) {
    const key = normalizeVoiceName(preferred)
    const hit = ofLang.find(v => normalizeVoiceName(v.name).includes(key))
    if (hit) return hit
  }
  return ofLang[0]
}

export interface BookVoiceChoice {
  voice: VoiceLike | null
  /** 该书语言没有任何可用音色、已回退到通用音色 */
  fallback: boolean
}

/**
 * 打开书籍时决定生效音色：
 * 1. 本书已有手动选择且音色仍可用、语言匹配 → 保留手动选择；
 * 2. 否则按书籍语言选默认音色（跨语言切书时因此自动切换）；
 * 3. 该书语言没有可用音色 → 回退到当前音色或列表首个通用音色，并标记 fallback。
 */
export function resolveBookVoice(
  bookLang: TextLang,
  bookVoiceURI: string | null | undefined,
  voices: VoiceLike[],
  currentVoiceURI: string | null = null,
): BookVoiceChoice {
  const label = languageLabel(bookLang)
  const languageVoices = voices.filter(v => voiceGroupLabel(v.lang) === label)
  const manual = bookVoiceURI ? voices.find(v => v.voiceURI === bookVoiceURI) : null
  // 本书有该语言音色时，只认可语言匹配的手动选择；没有该语言音色时，用户任选的回退音色也保留
  if (manual && (languageVoices.length === 0 || voiceGroupLabel(manual.lang) === label)) {
    return { voice: manual, fallback: false }
  }
  if (languageVoices.length > 0) {
    return { voice: pickDefaultVoiceForLang(bookLang, voices), fallback: false }
  }
  if (voices.length === 0) return { voice: null, fallback: false }
  const current = currentVoiceURI ? voices.find(v => v.voiceURI === currentVoiceURI) : null
  return { voice: current ?? voices[0], fallback: true }
}

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
