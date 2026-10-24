import { describe, expect, it } from 'vitest'
import { buildFuzzyRegex, searchChunks } from '../search'

const chunk = (seq: number, text: string) => ({ seq, text })

describe('searchChunks', () => {
  it('基础中文匹配并返回带上下文的片段', () => {
    const hits = searchChunks([chunk(3, '他说完这句话就走了。我们都没在意。')], '这句话')
    expect(hits).toEqual([
      {
        seq: 3,
        paraIdx: 0,
        sentInPara: 0,
        before: '他说完',
        match: '这句话',
        after: '就走了。我们都没在意。',
      },
    ])
  })

  it('记录命中段落在块内的序号', () => {
    const hits = searchChunks([chunk(0, '第一段无关。\n第二段藏着关键词呢。\n第三段。')], '关键词')
    expect(hits.length).toBe(1)
    expect(hits[0].paraIdx).toBe(1)
    expect(hits[0].sentInPara).toBe(0)
  })

  it('命中落在段落内第几句被精确定位', () => {
    const hits = searchChunks([chunk(0, '第一句说别的。关键词出现在第二句里。第三句收尾。')], '关键词')
    expect(hits.length).toBe(1)
    expect(hits[0].sentInPara).toBe(1)
  })

  it('模糊匹配：忽略词间空格与标点', () => {
    const hits = searchChunks([chunk(0, '第一章 前言：写在开始之前。')], '第一章前言')
    expect(hits.length).toBe(1)
    expect(hits[0].match).toBe('第一章 前言')
  })

  it('英文不区分大小写、词间空格可跳过', () => {
    const hits = searchChunks([chunk(1, 'The Quick Brown Fox jumps.')], 'quick brown')
    expect(hits.length).toBe(1)
    expect(hits[0].seq).toBe(1)
    expect(hits[0].match.toLowerCase()).toBe('quick brown')
  })

  it('兼容字符（康熙部首）文本用常规字可搜到', () => {
    const hits = searchChunks([chunk(0, '关注你的⾎糖水平。')], '血糖')
    expect(hits.length).toBe(1)
    expect(hits[0].match).toBe('血糖')
  })

  it('跨段落不匹配、无命中返回空', () => {
    expect(searchChunks([chunk(0, '甲乙\n丙丁')], '甲丙')).toEqual([])
    expect(searchChunks([chunk(0, '完全无关的内容。')], '查询词')).toEqual([])
  })

  it('命中数量受 limit 限制', () => {
    const chunks = Array.from({ length: 30 }, (_, i) => chunk(i, '关键词出现了一次。'))
    expect(searchChunks(chunks, '关键词', 10).length).toBe(10)
  })
})

describe('buildFuzzyRegex', () => {
  it('空白查询返回 null', () => {
    expect(buildFuzzyRegex('')).toBeNull()
    expect(buildFuzzyRegex('   ')).toBeNull()
  })
})
