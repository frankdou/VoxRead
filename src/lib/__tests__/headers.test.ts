import { describe, expect, it } from 'vitest'
import { isPageNumberLike, stripRepeatedLines } from '../headers'
import type { RawLine } from '../chunker'

const line = (text: string): RawLine => ({ text, x0: 50, y: 100, width: 400, fontSize: 12 })

function page(lines: string[]): RawLine[] {
  return lines.map(line)
}

describe('stripRepeatedLines', () => {
  it('剔除跨页重复的页眉页脚', () => {
    const n = 10
    const cn = '甲乙丙丁戊己庚辛壬癸'
    // 正文行内容各不相同（页眉页脚判重会把仅数字不同的行视为同一行）
    const pages = Array.from({ length: n }, (_, i) =>
      page([`我的书名`, `正文第${cn[i]}行，内容各不相同。`, '更多正文内容。', `补充${cn[i]}。`, `${i + 1}`]),
    )
    const cleaned = stripRepeatedLines(pages)
    cleaned.forEach((p, i) => {
      expect(p.map(l => l.text)).toEqual([
        `正文第${cn[i]}行，内容各不相同。`,
        '更多正文内容。',
        `补充${cn[i]}。`,
      ])
    })
  })

  it('保留只出现在少数页的首行（如章节标题）', () => {
    const pages = Array.from({ length: 10 }, (_, i) =>
      page([i < 3 ? '第二章 新的开始' : `正文内容第${i}行。`, `正文主体${i}。`, `${i + 1}`]),
    )
    const cleaned = stripRepeatedLines(pages)
    expect(cleaned[0].map(l => l.text)).toContain('第二章 新的开始')
  })

  it('剔除纯页码行', () => {
    const cn = '甲乙丙丁戊'
    const pages = Array.from({ length: 5 }, (_, i) =>
      page(['固定页眉', `内容${cn[i]}。`, '- 12 -']),
    )
    const cleaned = stripRepeatedLines(pages)
    cleaned.forEach((p, i) => {
      expect(p.map(l => l.text)).toEqual([`内容${cn[i]}。`])
    })
  })

  it('页数很少时不误删（阈值下限 3）', () => {
    const pages = [page(['共用标题', '内容一。', '1']), page(['共用标题', '内容二。', '2'])]
    const cleaned = stripRepeatedLines(pages)
    expect(cleaned[0].map(l => l.text)).toContain('共用标题')
  })
})

describe('isPageNumberLike', () => {
  it('识别纯数字与页码样式', () => {
    expect(isPageNumberLike('12')).toBe(true)
    expect(isPageNumberLike('- 12 -')).toBe(true)
    expect(isPageNumberLike('第 12 页')).toBe(true)
  })

  it('不误伤正文', () => {
    expect(isPageNumberLike('1997 年的夏天')).toBe(false)
    expect(isPageNumberLike('第三章')).toBe(false)
    expect(isPageNumberLike('')).toBe(false)
  })
})
