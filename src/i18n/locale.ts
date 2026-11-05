/** 应用支持的界面语言 */
export type AppLocale = 'zh-Hans' | 'zh-Hant' | 'ja' | 'ko' | 'en'

/** 用户选择的语言偏好：具体语言或跟随系统 */
export type LocalePreference = AppLocale | 'auto'

export const APP_LOCALES: readonly AppLocale[] = ['zh-Hans', 'zh-Hant', 'ja', 'ko', 'en']

/** 匹配不到任何支持语言时的兜底语言 */
export const DEFAULT_LOCALE: AppLocale = 'en'

/** 写入 localStorage 的键（与 IndexedDB 设置分开，保证首屏同步可读） */
export const LOCALE_STORAGE_KEY = 'voxread.locale'

/** 界面语言 → <html lang> 值 */
export const HTML_LANG: Record<AppLocale, string> = {
  'zh-Hans': 'zh-CN',
  'zh-Hant': 'zh-TW',
  ja: 'ja',
  ko: 'ko',
  en: 'en',
}

/** 地区码判定为繁体的中文地区 */
const HANT_REGIONS = new Set(['tw', 'hk', 'mo'])

/**
 * 单个 BCP 47 语言标签 → 应用语言。
 * 判定顺序固定为 script（脚本）→ region（地区）→ language（语言），
 * 因此 zh-Hant-CN 按脚本判繁体，而不会因地区被误判成简体。
 */
export function parseLocaleTag(tag: string): AppLocale | null {
  const parts = tag
    .trim()
    .toLowerCase()
    .replace(/_/g, '-')
    .split('-')
    .filter(Boolean)
  if (!parts.length) return null
  const language = parts[0]
  const script = parts.slice(1).find(p => /^[a-z]{4}$/.test(p)) ?? null
  const region = parts.slice(1).find(p => /^[a-z]{2}$/.test(p) || /^\d{3}$/.test(p)) ?? null
  if (language === 'zh' || language === 'cmn') {
    if (script === 'hant') return 'zh-Hant'
    if (script === 'hans') return 'zh-Hans'
    if (region && HANT_REGIONS.has(region)) return 'zh-Hant'
    return 'zh-Hans'
  }
  if (language === 'ja') return 'ja'
  if (language === 'ko') return 'ko'
  if (language === 'en') return 'en'
  return null
}

/** 按优先级逐个匹配语言标签，全部不命中时回退英文 */
export function resolveLocale(
  tags: readonly string[],
  fallback: AppLocale = DEFAULT_LOCALE,
): AppLocale {
  for (const tag of tags) {
    const locale = parseLocaleTag(tag)
    if (locale) return locale
  }
  return fallback
}

/** localStorage 里的偏好 → 合法偏好；无法识别的值按「跟随系统」处理 */
export function normalizePreference(raw: string | null | undefined): LocalePreference {
  if (!raw) return 'auto'
  if (raw === 'auto') return 'auto'
  return parseLocaleTag(raw) ?? 'auto'
}

/**
 * 决定启动语言：手动偏好优先，否则按浏览器语言列表匹配，最后回退英文。
 * 参数显式传入，便于单元测试；运行时由 index.ts 从 localStorage / navigator 取值。
 */
export function detectLocale(
  stored: string | null | undefined,
  languages: readonly string[],
): AppLocale {
  const pref = normalizePreference(stored)
  if (pref !== 'auto') return pref
  return resolveLocale(languages)
}

/** 读取手动语言偏好（隐私模式/禁用存储时按跟随系统处理） */
export function readLocalePreference(): LocalePreference {
  try {
    return normalizePreference(window.localStorage.getItem(LOCALE_STORAGE_KEY))
  } catch {
    return 'auto'
  }
}

/** 持久化手动语言偏好 */
export function writeLocalePreference(pref: LocalePreference): void {
  try {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, pref)
  } catch {
    // 存储不可用时仍允许本次会话切换语言，只是不持久化
  }
}

/** 浏览器语言列表：优先 navigator.languages，缺失时退回 navigator.language */
export function browserLanguages(): string[] {
  if (typeof navigator === 'undefined') return []
  const list = navigator.languages
  if (list && list.length) return [...list]
  return navigator.language ? [navigator.language] : []
}
