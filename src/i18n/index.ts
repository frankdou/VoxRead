import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import {
  APP_LOCALES,
  DEFAULT_LOCALE,
  HTML_LANG,
  browserLanguages,
  detectLocale,
  parseLocaleTag,
  readLocalePreference,
  resolveLocale,
  writeLocalePreference,
  type AppLocale,
  type LocalePreference,
} from './locale'
import en from './locales/en'
import ja from './locales/ja'
import ko from './locales/ko'
import zhHant from './locales/zh-Hant'
import zhHans from './locales/zh-Hans'

const resources = {
  'zh-Hans': { translation: zhHans },
  'zh-Hant': { translation: zhHant },
  ja: { translation: ja },
  ko: { translation: ko },
  en: { translation: en },
}

const initialLocale = detectLocale(readLocalePreference(), browserLanguages())

void i18n.use(initReactI18next).init({
  resources,
  lng: initialLocale,
  fallbackLng: DEFAULT_LOCALE,
  supportedLngs: [...APP_LOCALES],
  // 不做 zh-Hans → zh 的降级，保证中文脚本标签按原样命中资源
  load: 'currentOnly',
  defaultNS: 'translation',
  ns: ['translation'],
  interpolation: { escapeValue: false },
  returnNull: false,
  // 资源随包内置，同步初始化，避免首屏先渲染错误语言
  initAsync: false,
})

/** 当前生效的界面语言 */
export function currentLocale(): AppLocale {
  const lng = i18n.resolvedLanguage ?? i18n.language
  return parseLocaleTag(lng) ?? DEFAULT_LOCALE
}

/** 同步 <html lang> 与页面标题；切换语言时由 Provider 调用 */
export function applyDocumentLocale(locale: AppLocale): void {
  if (typeof document === 'undefined') return
  document.documentElement.lang = HTML_LANG[locale]
  document.title = i18n.t('meta.title')
}

/**
 * 切换界面语言：
 * - 具体语言：写入 localStorage，下次启动直接使用；
 * - auto：清除手动偏好，按浏览器语言重新匹配。
 * 只改变界面文案与文档元信息，不触碰 speechEngine。
 */
export async function setLocale(pref: LocalePreference): Promise<void> {
  writeLocalePreference(pref)
  const target = pref === 'auto' ? resolveLocale(browserLanguages()) : pref
  await i18n.changeLanguage(target)
}

export { i18n }
