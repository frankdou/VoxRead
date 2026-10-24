import { describe, expect, it } from 'vitest'
import { assembleParagraphs, buildChunks, MAX_CHUNK, type RawLine } from '../chunker'

const line = (
  text: string,
  opts: Partial<RawLine> = {},
): RawLine => ({
  text,
  x0: 50,
  y: 100,
  width: 400,
  fontSize: 12,
  ...opts,
})

describe('assembleParagraphs', () => {
  it('行首缩进视为新段落（中文小说缩进风格）', () => {
    const pages: RawLine[][] = [
      [
        line('第一章 山谷'),
        line('少年走在山路上，', { x0: 74, y: 88 }),
        line('感到一丝寒意。', { y: 76 }),
      ],
    ]
    // normalizeText 会去掉中文之间的空格（PDF 提取伪影），章标题的空格也不例外
    expect(assembleParagraphs(pages)).toEqual([
      '第一章山谷',
      '少年走在山路上，感到一丝寒意。',
    ])
  })

  it('行间距显著变大视为段落边界', () => {
    const pages: RawLine[][] = [
      [
        line('第一行文字。', { y: 100 }),
        line('第二行文字。', { y: 88 }),
        line('第三行文字。', { y: 76 }),
        line('第四行文字。', { y: 64 }),
        line('新的段落。', { y: 40 }),
      ],
    ]
    expect(assembleParagraphs(pages)).toEqual(['第一行文字。第二行文字。第三行文字。第四行文字。', '新的段落。'])
  })

  it('页末无终止标点时段落跨页延续', () => {
    const pages: RawLine[][] = [
      [line('这句话还没有', { y: 100 })],
      [line('说完就翻页了。', { y: 100 })],
    ]
    expect(assembleParagraphs(pages)).toEqual(['这句话还没有说完就翻页了。'])
  })

  it('页末有终止标点则不跨页', () => {
    const pages: RawLine[][] = [
      [line('这句话结束了。', { y: 100 })],
      [line('新的一段。', { y: 100 })],
    ]
    expect(assembleParagraphs(pages)).toEqual(['这句话结束了。', '新的一段。'])
  })
})

describe('buildChunks', () => {
  it('段落不跨块且每块 ≤1500 字符', () => {
    const paragraphs = Array.from({ length: 40 }, (_, i) => `第${i}段。${'内容'.repeat(60)}`)
    const chunks = buildChunks(paragraphs)
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(MAX_CHUNK)
    for (const p of paragraphs) {
      expect(chunks.some(c => c.includes(p))).toBe(true)
    }
    expect(chunks.join('\n')).toContain(paragraphs[0])
  })

  it('空段落被跳过', () => {
    expect(buildChunks(['', '唯一的内容。', ''])).toEqual(['唯一的内容。'])
  })

  it('超长段落按句切分', () => {
    const sentences = Array.from({ length: 200 }, (_, i) => `第${i}句话，长度还行。`)
    const long = sentences.join('')
    const chunks = buildChunks([long])
    expect(chunks.length).toBeGreaterThan(1)
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(MAX_CHUNK)
    expect(chunks.join('')).toBe(long)
  })

  it('块内段落以换行分隔（供阅读页渲染段落）', () => {
    expect(buildChunks(['段落一。', '段落二。'])).toEqual(['段落一。\n段落二。'])
  })
})
