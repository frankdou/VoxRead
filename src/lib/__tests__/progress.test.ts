import { describe, expect, it } from 'vitest'
import { resolveResumePosition } from '../progress'
import type { Progress } from '../../types'

describe('resolveResumePosition', () => {
  it('保存的块与句能原样还原（退出后重进定位到同一句）', () => {
    const saved: Progress = { bookId: 'b1', chunkSeq: 42, sentenceIndex: 7, updatedAt: 1 }
    expect(resolveResumePosition(saved, 100)).toEqual({ seq: 42, sentenceIndex: 7 })
  })

  it('没有进度时从开头开始', () => {
    expect(resolveResumePosition(null, 100)).toEqual({ seq: 0, sentenceIndex: 0 })
    expect(resolveResumePosition(undefined, 100)).toEqual({ seq: 0, sentenceIndex: 0 })
  })

  it('块号越界收敛到末块，句号不为负', () => {
    expect(resolveResumePosition({ chunkSeq: 999, sentenceIndex: -3 }, 10)).toEqual({
      seq: 9,
      sentenceIndex: 0,
    })
  })

  it('非法数字不会污染定位', () => {
    expect(resolveResumePosition({ chunkSeq: Number.NaN, sentenceIndex: Number.NaN }, 10)).toEqual({
      seq: 0,
      sentenceIndex: 0,
    })
  })
})
