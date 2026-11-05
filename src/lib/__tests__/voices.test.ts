import { describe, expect, it } from 'vitest'
import {
  MAX_VOICES_PER_LANG,
  detectTextLang,
  pickSupportedVoices,
  resolveUtteranceVoice,
  voiceGroupLabel,
} from '../voices'

const voice = (lang: string, name: string, localService = true) => ({
  lang,
  name,
  voiceURI: name,
  localService,
})

describe('pickSupportedVoices', () => {
  it('只保留中英日音色，其余语言（含粤语）过滤掉', () => {
    const out = pickSupportedVoices([
      voice('zh-CN', '婷婷'),
      voice('yue-HK', 'Sinji'),
      voice('ko-KR', 'Yuna'),
      voice('en-US', 'Samantha'),
    ])
    expect(out.map(v => v.name)).toEqual(['婷婷', 'Samantha'])
  })

  it('每组最多 5 个音色（本地优先的排在前面的留下）', () => {
    const zhVoices = [
      voice('zh-CN', '本地备选'),
      ...Array.from({ length: 6 }, (_, i) => voice('zh-CN', `在线${i}`, false)),
    ]
    const enVoices = Array.from({ length: 6 }, (_, i) => voice('en-US', `Voice${i}`))
    const out = pickSupportedVoices([...zhVoices, ...enVoices])
    const zhCount = out.filter(v => v.lang === 'zh-CN').length
    const enCount = out.filter(v => v.lang === 'en-US').length
    expect(zhCount).toBe(MAX_VOICES_PER_LANG)
    expect(enCount).toBe(MAX_VOICES_PER_LANG)
    // 本地音色优先入选，排序靠后的在线音色被裁掉
    expect(out.some(v => v.name === '本地备选')).toBe(true)
    expect(out.some(v => v.name === '在线4')).toBe(false)
    expect(out.some(v => v.name === '在线5')).toBe(false)
  })

  it('按 中文→英文→日语 排序，组内本地音色优先', () => {
    const out = pickSupportedVoices([
      voice('en-US', 'Zira', false),
      voice('ja-JP', 'O-ren'),
      voice('en-GB', 'Daniel'),
      voice('zh-TW', '美玲', false),
      voice('zh-CN', '婷婷'),
    ])
    expect(out.map(v => v.name)).toEqual(['婷婷', '美玲', 'Daniel', 'Zira', 'O-ren'])
  })

  it('识别 Safari 的 cmn 为中文', () => {
    const out = pickSupportedVoices([voice('cmn-Hans-CN', 'Xishi')])
    expect(out.map(v => v.name)).toEqual(['Xishi'])
  })

  it('过滤 iOS 趣味/特效音色、老式机器人音色与 Novelty 含糊音色，保留正常人声', () => {
    const out = pickSupportedVoices([
      voice('en-US', 'Albert'),
      voice('en-US', 'Zarvox'),
      voice('en-US', 'Bahh'),
      voice('en-US', 'Fred'),
      voice('en-US', 'Eddy (English (United States))'),
      voice('en-US', 'Flo (英语（美国）)'),
      voice('en-US', 'Grandma (英语（美国）)'),
      voice('en-US', 'Grandpa (英语（美国）)'),
      voice('en-US', 'Reed (英语（美国）)'),
      voice('en-US', 'Rocko (英语（美国）)'),
      voice('en-US', 'Sandy (英语（美国）)'),
      voice('en-US', 'Shelley (英语（美国）)'),
      voice('en-US', 'Samantha'),
      voice('en-GB', 'Daniel'),
    ])
    // 同组内按名称排序
    expect(out.map(v => v.name)).toEqual(['Daniel', 'Samantha'])
  })

  it('中文列表不被 Novelty 音色挤占，保留正常中文人声', () => {
    const out = pickSupportedVoices([
      voice('zh-CN', 'Eddy (中文（中国大陆）)'),
      voice('zh-CN', 'Flo (中文（中国大陆）)'),
      voice('zh-CN', 'Grandma (中文（中国大陆）)'),
      voice('zh-CN', 'Grandpa (中文（中国大陆）)'),
      voice('zh-CN', 'Reed (中文（中国大陆）)'),
      voice('zh-CN', 'Rocko (中文（中国大陆）)'),
      voice('zh-CN', 'Sandy (中文（中国大陆）)'),
      voice('zh-CN', 'Shelley (中文（中国大陆）)'),
      voice('zh-CN', 'Tingting'),
    ])
    expect(out.map(v => v.name)).toEqual(['Tingting'])
  })

  it('Enhanced/Premium 高品质音色排在普通音色前面', () => {
    const out = pickSupportedVoices([
      voice('en-US', 'Samantha'),
      voice('en-US', 'Zoe (Premium)'),
      voice('zh-CN', '婷婷'),
      voice('zh-CN', '婷婷（增强）'),
    ])
    expect(out.map(v => v.name)).toEqual(['婷婷（增强）', '婷婷', 'Zoe (Premium)', 'Samantha'])
  })

  it('空列表返回空', () => {
    expect(pickSupportedVoices([])).toEqual([])
  })
})

describe('voiceGroupLabel', () => {
  it('返回组名', () => {
    expect(voiceGroupLabel('zh-CN')).toBe('中文')
    expect(voiceGroupLabel('EN-us')).toBe('English')
    expect(voiceGroupLabel('ja-JP')).toBe('日本語')
  })

  it('不支持的语言返回 null', () => {
    expect(voiceGroupLabel('ko-KR')).toBeNull()
    expect(voiceGroupLabel('yue-HK')).toBeNull()
  })
})

describe('detectTextLang', () => {
  it('中文句子（含夹英文单词）识别为中文', () => {
    expect(detectTextLang('火车为什么停下。')).toBe('zh')
    expect(detectTextLang('他喜欢用JavaScript写小程序。')).toBe('zh')
  })

  it('纯英文句子识别为英文', () => {
    expect(detectTextLang('The quick brown fox jumps.')).toBe('en')
  })

  it('含假名的句子识别为日语', () => {
    expect(detectTextLang('こんにちは、世界。')).toBe('ja')
  })

  it('空文本返回 null', () => {
    expect(detectTextLang('   ')).toBeNull()
  })
})

describe('resolveUtteranceVoice', () => {
  const zhVoice = voice('zh-CN', '婷婷')
  const enVoice = voice('en-US', 'Samantha')
  const jaVoice = voice('ja-JP', 'O-ren')

  it('选中音色语言与句子匹配时直接使用', () => {
    const r = resolveUtteranceVoice('中文句子。', zhVoice, [zhVoice, enVoice])
    expect(r.voice?.name).toBe('婷婷')
    expect(r.lang).toBe('zh-CN')
  })

  it('英文音色遇到中文句子时回退到最优中文音色（英文音色读中文会静音）', () => {
    const r = resolveUtteranceVoice('中文句子。', enVoice, [zhVoice, enVoice])
    expect(r.voice?.name).toBe('婷婷')
  })

  it('中文音色遇到纯英文句子时回退到英文音色', () => {
    const r = resolveUtteranceVoice('The quick fox.', zhVoice, [zhVoice, enVoice])
    expect(r.voice?.name).toBe('Samantha')
  })

  it('没有任何可用音色时退回默认 lang', () => {
    const r = resolveUtteranceVoice('こんにちは', null, [zhVoice])
    expect(r.voice).toBeNull()
    expect(r.lang).toBe('ja-JP')
  })

  it('未选择音色时按句子语言挑最优可用音色', () => {
    const r = resolveUtteranceVoice('こんにちは', null, [zhVoice, jaVoice])
    expect(r.voice?.name).toBe('O-ren')
    expect(r.lang).toBe('ja-JP')
  })
})
