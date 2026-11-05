import { describe, expect, it } from 'vitest'
import {
  detectLocale,
  normalizePreference,
  parseLocaleTag,
  resolveLocale,
} from '../locale'

describe('parseLocaleTag', () => {
  it('繁体地区码优先判为繁体', () => {
    expect(parseLocaleTag('zh-TW')).toBe('zh-Hant')
    expect(parseLocaleTag('zh-HK')).toBe('zh-Hant')
    expect(parseLocaleTag('zh-MO')).toBe('zh-Hant')
  })

  it('简体地区码与裸 zh 判为简体', () => {
    expect(parseLocaleTag('zh-CN')).toBe('zh-Hans')
    expect(parseLocaleTag('zh-SG')).toBe('zh-Hans')
    expect(parseLocaleTag('zh')).toBe('zh-Hans')
  })

  it('脚本标签优先于地区码', () => {
    expect(parseLocaleTag('zh-Hant-CN')).toBe('zh-Hant')
    expect(parseLocaleTag('zh-Hans-TW')).toBe('zh-Hans')
    expect(parseLocaleTag('zh-Hant-HK')).toBe('zh-Hant')
  })

  it('下划线写法与大小写归一', () => {
    expect(parseLocaleTag('zh_Hant_HK')).toBe('zh-Hant')
    expect(parseLocaleTag('ZH-cn')).toBe('zh-Hans')
  })

  it('日韩英与不支持语言', () => {
    expect(parseLocaleTag('ja-JP')).toBe('ja')
    expect(parseLocaleTag('ko-KR')).toBe('ko')
    expect(parseLocaleTag('en-GB')).toBe('en')
    expect(parseLocaleTag('fr-FR')).toBeNull()
    expect(parseLocaleTag('yue-HK')).toBeNull()
    expect(parseLocaleTag('')).toBeNull()
  })
})

describe('resolveLocale', () => {
  it('按优先级取第一个可识别语言', () => {
    expect(resolveLocale(['fr-FR', 'zh-TW', 'en-US'])).toBe('zh-Hant')
    expect(resolveLocale(['ja-JP', 'en-US'])).toBe('ja')
  })

  it('全部不可识别时回退英文', () => {
    expect(resolveLocale(['fr-FR', 'de-DE'])).toBe('en')
    expect(resolveLocale([])).toBe('en')
  })
})

describe('detectLocale', () => {
  it('手动偏好优先于浏览器语言', () => {
    expect(detectLocale('zh-Hant', ['en-US'])).toBe('zh-Hant')
  })

  it('auto 时按浏览器语言匹配', () => {
    expect(detectLocale('auto', ['zh-TW'])).toBe('zh-Hant')
    expect(detectLocale(null, ['zh-HK', 'en-US'])).toBe('zh-Hant')
    expect(detectLocale(undefined, ['fr-FR'])).toBe('en')
  })
})

describe('normalizePreference', () => {
  it('只接受受支持的偏好值', () => {
    expect(normalizePreference('auto')).toBe('auto')
    expect(normalizePreference('zh-Hant')).toBe('zh-Hant')
    expect(normalizePreference('zh-TW')).toBe('zh-Hant')
    expect(normalizePreference('klingon')).toBe('auto')
    expect(normalizePreference(null)).toBe('auto')
  })
})
