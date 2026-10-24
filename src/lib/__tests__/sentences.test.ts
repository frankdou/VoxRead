import { describe, expect, it } from 'vitest'
import { normalizeText, splitSentences, splitSentencesRich } from '../sentences'

describe('splitSentences', () => {
  it('按终止标点切分并保留标点', () => {
    expect(splitSentences('今天天气很好。我们去公园吧！真的吗？')).toEqual([
      '今天天气很好。',
      '我们去公园吧！',
      '真的吗？',
    ])
  })

  it('空串与空段落返回空数组', () => {
    expect(splitSentences('')).toEqual([])
    expect(splitSentences('\n\n')).toEqual([])
  })

  it('无标点短句原样返回', () => {
    expect(splitSentences('一段没有任何标点的话')).toEqual(['一段没有任何标点的话'])
  })

  it('超长句按逗号二次切分且每句 ≤200 字', () => {
    const clause = '这是一段用来测试超长句子切分行为的子句，'
    const long = clause.repeat(20) + '结束。'
    const out = splitSentences(long)
    expect(out.length).toBeGreaterThan(1)
    for (const s of out) expect(s.length).toBeLessThanOrEqual(200)
    expect(out.join('')).toBe(long)
  })

  it('完全没有标点的超长文本硬切且不丢字', () => {
    const long = '字'.repeat(500)
    const out = splitSentences(long)
    expect(out.join('')).toBe(long)
    for (const s of out) expect(s.length).toBeLessThanOrEqual(200)
  })

  it('换行视为句边界（段落边界不产生句子）', () => {
    expect(splitSentences('第一段。第二段！')).toEqual(['第一段。', '第二段！'])
  })
})

describe('splitSentencesRich', () => {
  it('保留段落归属', () => {
    const rich = splitSentencesRich('第一段句子一。句子二。\n第二段句子三。')
    expect(rich.map(r => r.para)).toEqual([0, 0, 1])
    expect(rich.map(r => r.text)).toEqual(['第一段句子一。', '句子二。', '第二段句子三。'])
  })
})

describe('normalizeText', () => {
  it('去掉中日韩字符间的空格伪影', () => {
    expect(normalizeText('我 昨天 去 了 图书馆')).toBe('我昨天去了图书馆')
  })

  it('保留拉丁文词间空格', () => {
    expect(normalizeText('hello world')).toBe('hello world')
  })

  it('去除零宽字符并合并连续空白', () => {
    expect(normalizeText('a\u200bb\t\tc')).toBe('ab c')
  })

  it('NFKC 归一兼容字符（康熙部首）', () => {
    expect(normalizeText('⽬录 第⼀章 ⾎糖')).toBe('目录第一章血糖')
  })
})
