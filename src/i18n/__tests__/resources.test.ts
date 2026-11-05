import { describe, expect, it } from 'vitest'
import { i18n } from '../index'
import { APP_LOCALES } from '../locale'
import en from '../locales/en'
import ja from '../locales/ja'
import ko from '../locales/ko'
import zhHant from '../locales/zh-Hant'
import zhHans from '../locales/zh-Hans'

type ResourceShape = { [key: string]: string | ResourceShape }

const dictionaries: Record<string, ResourceShape> = {
  'zh-Hans': zhHans,
  'zh-Hant': zhHant,
  ja,
  ko,
  en,
}

/** 递归展开所有叶子 key，并校验值均为非空字符串 */
function flatten(value: ResourceShape, prefix = ''): Map<string, string> {
  const out = new Map<string, string>()
  for (const [key, child] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (typeof child === 'string') {
      out.set(path, child)
    } else {
      for (const [k, v] of flatten(child, path)) out.set(k, v)
    }
  }
  return out
}

describe('语言资源完整性', () => {
  const source = flatten(dictionaries['zh-Hans'])
  const sourceKeys = [...source.keys()].sort()

  it('五份资源的 key 集合完全一致', () => {
    for (const locale of APP_LOCALES) {
      const keys = [...flatten(dictionaries[locale]).keys()].sort()
      expect(keys, `${locale} 缺少或多出 key`).toEqual(sourceKeys)
    }
  })

  it('所有文案均为非空字符串', () => {
    for (const locale of APP_LOCALES) {
      for (const [key, value] of flatten(dictionaries[locale])) {
        expect(value.trim(), `${locale}.${key} 为空`).not.toBe('')
      }
    }
  })

  it('插值占位符在各语言间保持一致', () => {
    const placeholders = (text: string) =>
      [...text.matchAll(/\{\{(\w+)\}\}/g)].map(m => m[1]).sort()
    for (const key of sourceKeys) {
      const expected = placeholders(source.get(key) ?? '')
      if (!expected.length) continue
      for (const locale of APP_LOCALES) {
        const actual = placeholders(flatten(dictionaries[locale]).get(key) ?? '')
        expect(actual, `${locale}.${key} 占位符不一致`).toEqual(expected)
      }
    }
  })
})

describe('i18next 接线', () => {
  it('五种语言按 key 返回对应文案', async () => {
    const cases: [string, string][] = [
      ['zh-Hans', '设置'],
      ['zh-Hant', '設定'],
      ['ja', '設定'],
      ['ko', '설정'],
      ['en', 'Settings'],
    ]
    for (const [locale, expected] of cases) {
      await i18n.changeLanguage(locale)
      expect(i18n.t('settings.title')).toBe(expected)
    }
  })

  it('插值使用 {{var}}', async () => {
    await i18n.changeLanguage('en')
    expect(i18n.t('search.blockPrefix', { index: 3 })).toBe('Block 3')
    expect(i18n.t('jump.subtitle', { total: 42 })).toContain('42')
    await i18n.changeLanguage('zh-Hans')
  })
})
