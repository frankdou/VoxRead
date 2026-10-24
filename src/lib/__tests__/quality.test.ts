import { describe, expect, it } from 'vitest'
import { detectDoubleColumn, garbledRatio } from '../quality'

describe('garbledRatio', () => {
  it('正常文本比例接近 0', () => {
    expect(garbledRatio('这是一段完全正常的中文文本。')).toBe(0)
  })

  it('统计替换符与私用区字符', () => {
    expect(garbledRatio('正常\uFFFD正常\uE000')).toBeCloseTo(2 / 6)
  })

  it('garbledRatio 阈值判断（0.01 为乱码判定线）', () => {
    expect(garbledRatio('正常文本')).toBeLessThan(0.01)
    expect(garbledRatio('a\uFFFD'.repeat(10))).toBeGreaterThan(0.01)
  })
})

describe('detectDoubleColumn', () => {
  it('单栏排版不误报', () => {
    const pages = Array.from({ length: 10 }, () =>
      Array.from({ length: 10 }, (_, i) => ({ x0: 50, width: 400 - i })),
    )
    expect(detectDoubleColumn(pages)).toBe(false)
  })

  it('双栏排版被识别', () => {
    const pages = Array.from({ length: 10 }, () => [
      ...Array.from({ length: 6 }, () => ({ x0: 50, width: 170 })),
      ...Array.from({ length: 6 }, () => ({ x0: 280, width: 170 })),
    ])
    expect(detectDoubleColumn(pages)).toBe(true)
  })

  it('页数太少不判断', () => {
    expect(detectDoubleColumn([[{ x0: 0, width: 1 }]])).toBe(false)
  })
})
